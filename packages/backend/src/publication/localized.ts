import { createHash } from "node:crypto";
import { isLocale, LOCALES, type Locale } from "@aihot/contracts/locale";
import { sql, type Db } from "../db.ts";
import { collapseWhitespace } from "../lib/text.ts";
import { displayTags } from "./rules.ts";
import { sourceLanguage, translationMatchesLocale } from "../content/language.ts";

type ArticleText = { title: string | null; summary: string | null; reason: string | null };
/** 已写作的摘要以中文为源；尚未写作的公开详情按标题实际语言判断。 */
export function articleTextLocale(row: ArticleText): Locale {
  if (row.summary?.trim()) return "zh";
  const locale = sourceLanguage(null, row.title ?? "");
  return isLocale(locale) ? locale : "en";
}
export function articleSourceHash(row: ArticleText): string {
  return createHash("md5").update([row.title ?? "", row.summary ?? "", row.reason ?? ""].join("\x1f")).digest("hex");
}

type Localization = { ref_id: string; locale: string; source_hash: string; fields: unknown };
export function validArticleFields(value: unknown, source: ArticleText, locale: Locale): value is { title: string; summary: string | null; reason: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fields = value as Partial<ArticleText>;
  return typeof fields.title === "string" && !!fields.title.trim()
    && (source.summary?.trim() ? typeof fields.summary === "string" && !!fields.summary.trim() : fields.summary === source.summary)
    && (fields.reason === null || typeof fields.reason === "string")
    && (!source.reason?.trim() || !!fields.reason?.trim())
    && [fields.title, fields.summary, fields.reason].every((text) => !text || translationMatchesLocale(text, locale));
}

export async function localizeArticles<T extends ArticleText & { id: string }>(rows: T[], locale: Locale, db: Db = sql): Promise<Array<T & { text_locale: Locale }>> {
  if (!rows.length || rows.every((row) => articleTextLocale(row) === locale)) return rows.map((row) => ({ ...row, text_locale: locale }));
  const stored = await db<Localization[]>`
    SELECT ref_id, locale, source_hash, fields FROM localizations
    WHERE kind = 'article' AND ref_id = ANY(${rows.map((r) => r.id)}::text[]) AND locale = ${locale}`;
  const byId = new Map(stored.map((r) => [`${r.ref_id}:${r.locale}`, r]));
  return rows.map((row) => {
    const native = articleTextLocale(row);
    if (native === locale) return { ...row, text_locale: native };
    const hash = articleSourceHash(row);
    const found = byId.get(`${row.id}:${locale}`);
    if (found?.source_hash === hash && validArticleFields(found.fields, row, locale)) {
      return { ...row, title: found.fields.title, summary: found.fields.summary, reason: row.reason ? found.fields.reason : row.reason, text_locale: locale };
    }
    return { ...row, text_locale: native };
  });
}

export async function localizedSearchText(db: Db, articleId: string, hash: string): Promise<string> {
  const rows = await db<{ fields: Partial<ArticleText> | null }[]>`
    SELECT fields FROM localizations WHERE kind = 'article' AND ref_id = ${articleId} AND source_hash = ${hash}
    AND locale = ANY(${[...LOCALES]}::text[]) ORDER BY locale`;
  return collapseWhitespace(rows.flatMap((r) => [r.fields?.title, r.fields?.summary]).filter((text) => typeof text === "string").join(" ")).toLowerCase();
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
