// Public read layer, item level. Every exit (site API, v1, RSS, MCP, sitemap) reads
// items through these functions; visibility, release gate and body licences are applied here.
import { DEFAULT_LOCALE, type Locale } from "@aihot/contracts/locale";
import { sourceLanguageSql, translationMatchesLocaleSql } from "../content/language.ts";
import type { CategoryKey, ChannelKey } from "@aihot/contracts/taxonomy";
import type { FeedItemSummary, ItemSummary, MediaView, SourceKind, XPostView } from "@aihot/contracts/site";
import { sql, type Db } from "../db.ts";
import { proxiedImage, proxiedImageSet } from "../media/imgproxy.ts";
import { displayTags } from "./rules.ts";

export interface ItemRow {
  id: string;
  revision: number;
  title: string;
  text_locale?: Locale;
  original_title: string | null;
  summary: string | null;
  reason: string | null;
  category: string | null;
  tags: string[];
  score: number | null;
  selected: boolean;
  eligible: boolean;
  channel: "news" | "x";
  url: string;
  published_at: Date | null;
  discovered_at: Date;
  timeline_at: Date;
  /** Reading-group anchor for a selected item (timeline_at otherwise). */
  sort_at: Date;
  first_party: boolean;
  visibility: string;
  body_mode: "full" | "summary";
  syndicate: boolean;
  indexable: boolean;
  visible_after: Date | null;
  backfill: boolean;
  fact_id: number | null;
  story_id: number | null;
  source_id: string;
  source_name: string;
  source_kind: SourceKind;
  /** Participation mode of the source now (editorial, hot_signal, isolated). */
  source_mode: string;
  source_icon: string | null;
  x_post: Record<string, any> | null;
  author: string | null;
  language: string | null;
  story_public_id: string | null;
  story_title: string | null;
  zh_text: string | null;
  /** 请求语言的引用帖译文，字段名保留以兼容内部投影。 */
  quoted_zh: string | null;
}

/** Columns every item listing selects. Internal judgement details never leave this layer. */
export const ITEM_COLUMNS = sql`
  p.article_id AS id, p.revision, p.title, p.original_title, p.summary, p.reason, p.category, p.tags, p.score,
  p.selected, p.eligible, p.channel, p.url, p.published_at, p.discovered_at, p.timeline_at, p.sort_at, p.first_party, p.visibility,
  p.body_mode, p.syndicate, p.indexable, p.visible_after, p.backfill, p.fact_id, p.story_id,
  s.id AS source_id, s.name AS source_name, s.kind AS source_kind, s.participation_mode AS source_mode, s.icon_url AS source_icon,
  a.x_post, a.author, a.language,
  st.public_id::text AS story_public_id, st.title AS story_title,
  CASE WHEN p.channel = 'x' THEN tr.body_text END AS zh_text, qt.text_zh AS quoted_zh`;

/** Public API listings never render article bodies, X media or story metadata. */
export type ApiItemRow = Pick<ItemRow, "id" | "title" | "original_title" | "summary" | "source_name" | "url" | "published_at" | "discovered_at" | "category" | "score" | "selected" | "reason">;
export const API_ITEM_COLUMNS = sql`
  p.article_id AS id, p.title, p.original_title, p.summary, s.name AS source_name, p.url,
  p.published_at, p.discovered_at, p.category, p.score, p.selected, p.reason`;
export const API_ITEM_FROM = sql`FROM publications p JOIN sources s ON s.id = p.source_id`;

/** 只读取请求语言；原文已是请求语言时直接使用原文。 */
export function bodyTranslationJoins(locale: Locale = DEFAULT_LOCALE, completeOnly = false) {
  const quoted = sql`coalesce(a.x_post->'quoted'->>'text', '')`;
  const quoteLanguage = sourceLanguageSql(sql`NULL::text`, quoted);
  return sql`
    LEFT JOIN LATERAL (
      SELECT t.* FROM translations t WHERE t.article_id = p.article_id AND t.revision >= a.revision
        AND t.lang = ${locale} AND ${sourceLanguageSql()} <> ${locale}
        AND (NOT t.complete OR ${translationMatchesLocaleSql(locale, sql`t.body_html`)})
        AND coalesce(t.body_text, '') <> '' ${completeOnly ? sql`AND t.complete` : sql``}
      ORDER BY (t.lang = ${locale}) DESC LIMIT 1
    ) tr ON true
    LEFT JOIN LATERAL (
      SELECT text AS text_zh FROM (
        SELECT q.lang, q.text, q.text_hash, 0 AS priority FROM quote_translations_lang q
        WHERE q.tweet_id = substring(a.x_post->'quoted'->>'url' from '/status/([0-9]+)') AND q.lang = ${locale}
        UNION ALL
        SELECT 'zh', q.text_zh, q.text_hash, 1 FROM quote_translations q
        WHERE q.tweet_id = substring(a.x_post->'quoted'->>'url' from '/status/([0-9]+)') AND ${locale} = 'zh'
      ) q WHERE ${quoteLanguage} <> ${locale}
        AND q.text_hash = encode(sha256(convert_to(${quoted}, 'UTF8')), 'hex')
        AND ${translationMatchesLocaleSql(locale, sql`q.text`)}
      ORDER BY (q.lang = ${locale}) DESC, priority LIMIT 1
    ) qt ON p.channel = 'x'`;
}

export function itemFrom(locale: Locale = DEFAULT_LOCALE) {
  return sql`FROM publications p
    JOIN sources s ON s.id = p.source_id
    JOIN articles a ON a.id = p.article_id
    LEFT JOIN stories st ON st.id = p.story_id AND st.merged_into IS NULL
    ${bodyTranslationJoins(locale)}`;
}

/** Listed items: public, and a selected item only after its release gate. */
export function listedCondition(now: Date) {
  return sql`p.visibility = 'public' AND (NOT p.selected OR p.visible_after <= ${now})`;
}

/** Selected set as shown on the home timeline, v1 selected mode and RSS. */
export function selectedCondition(now: Date) {
  return sql`p.visibility = 'public' AND p.selected AND p.visible_after <= ${now}`;
}

export function channelCondition(channel: ChannelKey | null | undefined) {
  if (!channel || channel === "all") return sql``;
  if (channel === "firstParty") return sql`AND p.first_party`;
  return sql`AND p.channel = ${channel}`;
}

export function categoryCondition(category: CategoryKey | null | undefined, v1 = false) {
  if (!category) return sql``;
  // v1 and RSS publish opinion as tip.
  if (v1 && category === "tip") return sql`AND p.category IN ('tip', 'opinion')`;
  return sql`AND p.category = ${category}`;
}

export function tagCondition(tag: string | null | undefined) {
  if (!tag) return sql``;
  return sql`AND p.tags @> ${[tag]}::text[]`;
}

export function topicCondition(topicTags: string[] | null | undefined) {
  if (!topicTags || topicTags.length === 0) return sql``;
  return sql`AND p.tags && ${topicTags}::text[]`;
}

function mediaView(m: Record<string, any>, mode: "card" | "thumb" | "full" = "thumb", responsive = false): MediaView | null {
  const url = proxiedImage(m.url, mode);
  if (!url) return null;
  return {
    kind: m.kind === "video" ? "video" : "image",
    url,
    ...(responsive && mode !== "full" ? { fullUrl: proxiedImage(m.url, "full")! } : {}),
    ...(responsive && proxiedImageSet(m.poster ?? m.url, mode === "full" ? "body" : "card") ? { srcSet: proxiedImageSet(m.poster ?? m.url, mode === "full" ? "body" : "card")! } : {}),
    width: typeof m.width === "number" ? m.width : null,
    height: typeof m.height === "number" ? m.height : null,
    alt: m.alt ?? null,
    poster: m.poster ? proxiedImage(m.poster, mode === "card" ? "card" : "thumb") : null,
  };
}

export function xView(row: Pick<ItemRow, "x_post" | "zh_text"> & Partial<Pick<ItemRow, "quoted_zh">>, compact = false, responsive = compact): XPostView | null {
  const x = row.x_post;
  if (!x) return null;
  const quoted = x.quoted && typeof x.quoted === "object"
    ? {
      authorName: String(x.quoted.authorName ?? ""), handle: String(x.quoted.handle ?? ""), text: String(x.quoted.text ?? ""), url: String(x.quoted.url ?? ""),
      translation: row.quoted_zh && row.quoted_zh.trim() !== String(x.quoted.text ?? "").trim() ? row.quoted_zh : null,
    }
    : null;
  const media = ((x.media ?? []) as Array<Record<string, any>>)
    .map((raw) => ({ raw, view: mediaView(raw, compact || !responsive ? "thumb" : "full", responsive) }))
    .filter((entry): entry is { raw: Record<string, any>; view: MediaView } => entry.view !== null);
  return {
    authorName: String(x.authorName ?? x.handle ?? ""),
    handle: String(x.handle ?? ""),
    avatarUrl: proxiedImage(x.avatarUrl, "avatar"),
    ...(responsive && proxiedImageSet(x.avatarUrl, "avatar") ? { avatarSrcSet: proxiedImageSet(x.avatarUrl, "avatar")! } : {}),
    text: String(x.text ?? ""),
    translation: row.zh_text && row.zh_text.trim() !== String(x.text ?? "").trim() ? row.zh_text : null,
    quoted,
    // A multi-image list grid is 112 CSS px wide; one image can be 240 px. Keep 3x pixels for both.
    // Detail retains full media for the lightbox; srcSet bounds the displayed image.
    media: media.map(({ raw, view }) => compact && media.length > 1 ? mediaView(raw, "card", responsive)! : view),
  };
}

export function toItemSummary(row: ItemRow): ItemSummary {
  const x = row.channel === "x" ? xView(row, true) : null;
  return {
    id: row.id,
    revision: row.revision,
    title: row.title,
    textLocale: row.text_locale ?? "zh",
    originalTitle: row.original_title,
    summary: row.summary,
    reason: row.selected ? row.reason : null,
    source: {
      id: row.source_id,
      name: row.source_name,
      kind: row.source_kind,
      firstParty: row.first_party,
      iconUrl: proxiedImage(row.source_icon, "avatar"),
      ...(proxiedImageSet(row.source_icon, "avatar") ? { iconSrcSet: proxiedImageSet(row.source_icon, "avatar")! } : {}),
    },
    links: { aihot: `/items/${row.id}`, original: row.url },
    publishedAt: row.published_at?.toISOString() ?? null,
    discoveredAt: row.discovered_at.toISOString(),
    timelineAt: row.timeline_at.toISOString(),
    category: (row.category as CategoryKey | null) ?? null,
    tags: displayTags(row.tags),
    score: row.score === null ? null : Math.round(Number(row.score)),
    selected: row.selected,
    channel: row.channel,
    story: row.story_public_id ? { publicId: row.story_public_id, title: row.story_title ?? "" } : null,
    x,
  };
}

/** Project the shared public article into the exact fields a site card renders. */
export function toFeedItemSummary(row: ItemRow): FeedItemSummary {
  const item = toItemSummary(row);
  return {
    id: item.id, title: item.title, textLocale: item.textLocale, summary: item.summary, reason: item.reason,
    source: { name: item.source.name }, publishedAt: item.publishedAt, timelineAt: item.timelineAt,
    category: item.category, tags: item.tags, score: item.score, selected: item.selected, channel: item.channel,
    x: item.x ? {
      authorName: item.x.authorName, handle: item.x.handle, avatarUrl: item.x.avatarUrl,
      ...(item.x.avatarSrcSet ? { avatarSrcSet: item.x.avatarSrcSet } : {}), media: item.x.media,
      quoted: item.x.quoted ? { authorName: item.x.quoted.authorName, handle: item.x.quoted.handle, text: item.x.quoted.text, translation: item.x.quoted.translation } : null,
    } : null,
  };
}

export async function fetchItemsByIds(ids: string[], db: Db = sql, locale: Locale = DEFAULT_LOCALE): Promise<Map<string, ItemRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db<ItemRow[]>`SELECT ${ITEM_COLUMNS} ${itemFrom(locale)} WHERE p.article_id IN ${db(ids)}`;
  return new Map(rows.map((r) => [r.id, r]));
}
