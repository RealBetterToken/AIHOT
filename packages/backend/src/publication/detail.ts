// Item detail and Markdown export, both behind the same visibility and licence rules.
import { DEFAULT_LOCALE, type Locale } from "@aihot/contracts/locale";
import { localizeItemStories, localizedStoryTexts } from "./localized-story-report.ts";
import { localizeArticles } from "./localized.ts";
import type { ItemDetail, SiteItemDetail, OutlineEntry, StoryRef } from "@aihot/contracts/site";
import TurndownService from "turndown";
import { sql } from "../db.ts";
import { proxyBodyImages } from "../media/imgproxy.ts";
import { textToHtml } from "../content/sanitize.ts";
import { ITEM_COLUMNS, itemFrom, selectedCondition, toItemSummary, xView, type ItemRow } from "./items.ts";
import { itemUrl, pageUrl } from "./links.ts";
import { markdownCopy } from "./markdown-copy.ts";
import { hasItemPage } from "./rules.ts";
import { SITE } from "@aihot/industry/site";

interface DetailRow extends ItemRow {
  body_html: string | null;
  body_text: string | null;
  body_status: string;
  tr_html: string | null;
  tr_complete: boolean | null;
  tr_lang: Locale | null;
}

export type DetailResult =
  | { kind: "found"; detail: ItemDetail; row: DetailRow }
  | { kind: "not_found" };

/** Adds stable ids to h2–h4 and returns the outline. */
function withOutline(html: string): { html: string; outline: OutlineEntry[] } {
  const outline: OutlineEntry[] = [];
  let n = 0;
  const out = html.replace(/<h([2-4])(?: id="sec-\d+")?>([\s\S]*?)<\/h\1>/gi, (_m, level: string, inner: string) => {
    n += 1;
    const id = `sec-${n}`;
    const text = inner.replace(/<[^>]+>/g, "").trim();
    if (text) outline.push({ id, text: text.slice(0, 80), level: Number(level) });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html: out, outline };
}

async function loadRow(id: string, locale: Locale): Promise<DetailRow | null> {
  const [row] = await sql<DetailRow[]>`
    SELECT ${ITEM_COLUMNS}, a.body_html, a.body_text, a.body_status, tr.body_html AS tr_html, tr.complete AS tr_complete, tr.lang AS tr_lang
    ${itemFrom(locale)}
    WHERE p.article_id = ${id}`;
  return row ?? null;
}

/**
 * Public detail (rules.hasItemPage): items the lists leave out (low relevance, merged duplicates, no
 * Chinese summary yet) keep a noindex page; withdrawn and hot_signal items are a 404.
 */
export async function loadItemDetail(id: string, now = new Date(), locale: Locale = DEFAULT_LOCALE): Promise<DetailResult> {
  const row = await loadRow(id, locale);
  if (!row || !hasItemPage({ visibility: row.visibility, sourceMode: row.source_mode })) return { kind: "not_found" };

  const [localized] = await localizeItemStories(await localizeArticles([row], locale), locale);
  const summary = toItemSummary(localized!);
  if (row.channel === "x") summary.x = xView(row, false, true);
  if (row.visibility === "summary-only") {
    const detail: ItemDetail = {
      ...summary,
      reason: null,
      tags: [],
      x: null,
      readingMode: "summary-only",
      author: null,
      language: row.language,
      body: null,
      outline: [],
      relatedStories: [],
      indexable: false,
      markdownAvailable: false,
      group: null,
    };
    return { kind: "found", detail, row };
  }

  const related = await sql<StoryRef[]>`
    SELECT DISTINCT st.public_id::text AS "publicId", st.title
    FROM fact_articles fa JOIN facts f ON f.id = fa.fact_id JOIN stories st ON st.id = f.story_id
    WHERE fa.article_id = ${id} AND fa.role <> 'mention' AND st.merged_into IS NULL
    LIMIT 6`;

  const relatedTitles = await localizedStoryTexts(related.map((r) => r.publicId), locale);
  const localizedRelated = related.map((r) => ({ ...r, title: relatedTitles.get(r.publicId)?.title ?? r.title }));

  let body: ItemDetail["body"] = null;
  let outline: OutlineEntry[] = [];
  if (row.body_mode === "full") {
    const original = row.channel === "x"
      ? textToHtml(String(row.x_post?.text ?? row.body_text ?? ""))
      : row.body_html ? proxyBodyImages(row.body_html) : null;
    const translated = row.channel === "x"
      ? summary.x?.translation ? textToHtml(summary.x.translation) : null
      : row.tr_html ? proxyBodyImages(row.tr_html) : null;
    if (original) {
      const primary = withOutline(translated ?? original);
      outline = primary.outline;
      body = {
        localized: translated ? primary.html : null,
        original: translated ? withOutline(original).html : primary.html,
        localizedLanguage: translated ? row.tr_lang : null,
        complete: translated ? row.tr_complete ?? false : true,
      };
    }
  }

  let group: ItemDetail["group"] = null;
  if (row.fact_id) {
    const [g] = await sql<{ public_id: string; reports: number; sources: number }[]>`
      SELECT f.public_id, count(p.article_id) AS reports, count(DISTINCT p.source_id) AS sources
      FROM facts f JOIN publications p ON p.fact_id = f.id
      WHERE f.id = ${row.fact_id} AND p.visibility = 'public' AND p.eligible AND (NOT p.selected OR p.visible_after <= ${now})
      GROUP BY f.public_id`;
    const [dev] = await sql<{ n: number }[]>`
      SELECT count(DISTINCT other.id) AS n FROM facts f
      JOIN facts other ON other.story_id = f.story_id AND other.id <> f.id
      JOIN publications p ON p.fact_id = other.id
      WHERE f.id = ${row.fact_id} AND f.story_id IS NOT NULL AND ${selectedCondition(now)}`;
    if (g) {
      group = {
        factId: g.public_id,
        story: summary.story,
        reportCount: Number(g.reports),
        additionalSourceCount: Math.max(0, Number(g.sources) - 1),
        developmentCount: Number(dev?.n ?? 0),
      };
    }
  }

  const detail: ItemDetail = {
    ...summary,
    readingMode: "full",
    author: row.author,
    language: row.language,
    body,
    outline,
    relatedStories: localizedRelated,
    indexable: row.indexable,
    markdownAvailable: markdownAvailable(row),
    group,
  };
  return { kind: "found", detail, row };
}

/**
 * Same predicate for the export button and the export route: a public page with something to export
 * (a summary, the post, or a full-text body).
 */
export function markdownAvailable(row: {
  visibility: string; source_mode: string; summary: string | null; body_mode: string; body_html?: string | null; channel: string; x_post: Record<string, any> | null;
}): boolean {
  if (row.visibility !== "public" || !hasItemPage({ visibility: row.visibility, sourceMode: row.source_mode })) return false;
  return !!row.summary || (row.channel === "x" && !!row.x_post?.text) || (row.body_mode === "full" && !!row.body_html);
}

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });

export async function exportMarkdown(id: string, locale: Locale = DEFAULT_LOCALE): Promise<{ filename: string; body: string } | null> {
  const source = await loadRow(id, locale);
  if (!source || !markdownAvailable(source)) return null;
  const [row] = await localizeArticles([source], locale);
  if (!row) return null;
  const copy = markdownCopy(locale);
  const lines: string[] = [];
  lines.push(`# ${row.title}`, "");
  if (row.original_title) lines.push(`> ${copy.originalTitle}：${row.original_title}`, "");
  lines.push(`- ${copy.source}：${row.source_name}`);
  lines.push(`- ${copy.published}：${(row.published_at ?? row.discovered_at).toISOString()}`);
  lines.push(`- ${SITE.name}：${pageUrl(`/items/${row.id}`, locale)}`);
  lines.push(`- ${copy.original}：${row.url}`, "");
  if (row.summary) lines.push(`## ${copy.summary}`, "", row.summary, "");
  if (row.selected && row.reason) lines.push(`## ${copy.reason}`, "", row.reason, "");
  if (row.channel === "x" && row.x_post?.text) {
    lines.push(`## ${copy.body}`, "", String(row.x_post.text), "");
    if (row.zh_text) lines.push(`## ${copy.translatedBody}`, "", row.zh_text, "");
    const q = row.x_post.quoted as { handle?: string; text?: string; url?: string } | null | undefined;
    if (q?.text) lines.push(`## ${copy.quote} @${q.handle ?? ""}`, "", ...String(q.text).split("\n").map((l) => `> ${l}`), "", ...(q.url ? [q.url, ""] : []));
    if (q?.text && row.quoted_zh) lines.push(`### ${copy.translatedQuote}`, "", ...row.quoted_zh.split("\n").map((l) => `> ${l}`), "");
  } else if (row.body_mode === "full" && row.body_html) {
    const isOriginal = !row.tr_html;
    if (row.tr_html && row.tr_complete) lines.push(`## ${copy.translatedBody}`, "", turndown.turndown(row.tr_html), "");
    lines.push(`## ${isOriginal ? copy.body : copy.originalBody}`, "", turndown.turndown(row.body_html), "");
  }
  return { filename: `${SITE.mcpPrefix}-${locale}-${row.id}.md`, body: lines.join("\n").replace(/\n{3,}/g, "\n\n") };
}

/** Site reading projection: default text remains SSR, a second language has its own readable URL. */
export function siteItemDetail(detail: ItemDetail, original = false): SiteItemDetail {
  const hasTranslation = !!detail.body?.localized && !!detail.body.original;
  const bodyLanguage = !original && detail.body?.localized ? detail.body.localizedLanguage ?? DEFAULT_LOCALE : "original";
  const selectedHtml = bodyLanguage === "original" ? detail.body?.original : detail.body?.localized;
  const { text: _text, translation: _translation, ...x } = detail.x ?? {} as NonNullable<ItemDetail["x"]>;
  return { ...detail, x: detail.x ? { ...x, quoted: x.quoted ? { ...x.quoted, translation: original ? null : x.quoted.translation } : null } : null, hasTranslation, bodyLanguage,
    body: detail.body ? { ...detail.body, localized: bodyLanguage !== "original" ? detail.body.localized : null, original: bodyLanguage === "original" ? detail.body.original : null } : null,
    outline: selectedHtml ? withOutline(selectedHtml).outline : [],
  };
}
