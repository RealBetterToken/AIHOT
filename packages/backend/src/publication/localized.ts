import { createHash } from "node:crypto";
import { TARGET_LOCALES, type Locale } from "@aihot/contracts/locale";
import { sql, type Db } from "../db.ts";
import { collapseWhitespace } from "../lib/text.ts";
import { displayTags } from "./rules.ts";

type ArticleText = { title: string | null; summary: string | null; reason: string | null };
export function articleSourceHash(row: ArticleText): string {
  return createHash("md5").update([row.title ?? "", row.summary ?? "", row.reason ?? ""].join("\x1f")).digest("hex");
}

type Localization = { ref_id: string; locale: string; source_hash: string; fields: Partial<ArticleText> };
export async function localizeArticles<T extends ArticleText & { id: string }>(rows: T[], locale: Locale, db: Db = sql): Promise<T[]> {
  if (locale === "zh" || !rows.length) return rows;
  const stored = await db<Localization[]>`
    SELECT ref_id, locale, source_hash, fields FROM localizations
    WHERE kind = 'article' AND ref_id = ANY(${rows.map((r) => r.id)}::text[]) AND locale = ANY(${[locale, "en"]}::text[])`;
  const byId = new Map(stored.map((r) => [`${r.ref_id}:${r.locale}`, r]));
  return rows.map((row) => {
    const hash = articleSourceHash(row);
    for (const language of [locale, "en"]) {
      const found = byId.get(`${row.id}:${language}`);
      if (found?.source_hash !== hash || !found.fields.title?.trim() || !found.fields.summary?.trim()) continue;
      return { ...row, title: found.fields.title, summary: found.fields.summary, reason: found.fields.reason?.trim() ? found.fields.reason : row.reason };
    }
    return row;
  });
}

export async function localizedSearchText(db: Db, articleId: string, hash: string): Promise<string> {
  const rows = await db<{ fields: Partial<ArticleText> }[]>`
    SELECT fields FROM localizations WHERE kind = 'article' AND ref_id = ${articleId} AND source_hash = ${hash}
    AND locale = ANY(${[...TARGET_LOCALES]}::text[]) ORDER BY locale`;
  return collapseWhitespace(rows.flatMap((r) => [r.fields.title, r.fields.summary]).filter(Boolean).join(" ")).toLowerCase();
}

export async function refreshLocalizedSearch(db: Db, articleId: string): Promise<void> {
  // Rebuild from source fields and valid translations, never append to the old index.
  const [row] = await db<(ArticleText & { original_title: string | null; name: string; tags: string[]; subjects: string[] })[]>`
    SELECT p.title, p.summary, p.reason, p.original_title, s.name, p.tags, coalesce(a.subjects, '{}') AS subjects
    FROM publications p JOIN sources s ON s.id = p.source_id LEFT JOIN analyses a ON a.id = p.analysis_id
    WHERE p.article_id = ${articleId} FOR UPDATE OF p`;
  if (!row) return;
  const translated = await localizedSearchText(db, articleId, articleSourceHash(row));
  const text = collapseWhitespace([row.title, row.original_title, row.summary, row.name, ...displayTags(row.tags), ...row.subjects, translated].filter(Boolean).join(" ")).toLowerCase();
  await db`UPDATE publications SET search_text = ${text} WHERE article_id = ${articleId}`;
  await db`UPDATE pool_search SET direct = ${text} WHERE article_id = ${articleId}`;
}
