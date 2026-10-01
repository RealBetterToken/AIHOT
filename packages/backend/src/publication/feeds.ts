// RSS feeds. GUID = article id (isPermaLink=false), <link> = the site's page, pubDate = source
// publication time. Summary feeds never carry content:encoded; full feeds inline bodies only for
// 信源默认带正文，可独立关闭；频道文案来自站名和分类。
import { DEFAULT_LOCALE, type Locale } from "@aihot/contracts/locale";
import { localizeArticles } from "./localized.ts";
import { PUBLIC_API_CATEGORY_KEYS, type PublicApiCategoryKey } from "@aihot/contracts/taxonomy";
import { SITE } from "@aihot/industry/site";
import { categoryLabel } from "@aihot/industry/taxonomy";
import { feedCopy } from "./feed-copy.ts";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { escapeXml } from "../lib/text.ts";
import { proxyBodyImages } from "../media/imgproxy.ts";
import { reportHeadline, reportIndex } from "./reports.ts";
import { textToHtml } from "../content/sanitize.ts";
import { bodyTranslationJoins, categoryCondition, listedCondition, selectedCondition, xView, type ItemRow } from "./items.ts";
import { pageUrl, siteUrl } from "./links.ts";

interface FeedMeta {
  id: string;
  path: string;
  title: string;
  description: string;
  homePath: string;
  pollHintMinutes: number;
}

function feedMeta(kind: "selected" | "selectedFull" | "all" | "daily", locale: Locale): FeedMeta {
  const c = feedCopy(locale);
  const paths = { selected: "/feed.xml", selectedFull: "/feed/full.xml", all: "/feed/all.xml", daily: "/feed/daily.xml" };
  return { id: kind, path: paths[kind], title: kind === "daily" ? `${SITE.name} ${c.daily}` : `${SITE.name} — ${c[kind]}`,
    description: c[`${kind}Description`], homePath: kind === "all" ? "/all" : kind === "daily" ? "/daily" : "/", pollHintMinutes: 30 };
}

/** RSS <author> needs an address; a no-reply one on the site's own domain. */
const AUTHOR = `noreply@${new URL(config.siteUrl).hostname}`;

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")}]]>`;
}

function rfc822(d: Date): string {
  return d.toUTCString();
}

function channel(meta: { title: string; description: string; homePath: string; selfPath: string; ttl: number }, items: string[], locale: Locale = DEFAULT_LOCALE): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(meta.title)}</title>
    <link>${escapeXml(pageUrl(meta.homePath, locale))}</link>
    <description>${escapeXml(meta.description)}</description>
    <language>${locale === "zh" ? "zh-CN" : locale}</language>
    <atom:link href="${escapeXml(siteUrl(`${meta.selfPath}${locale === DEFAULT_LOCALE ? "" : `?lang=${locale}`}`))}" rel="self" type="application/rss+xml" />
    <ttl>${meta.ttl}</ttl>
    <generator>${escapeXml(`${SITE.name} (${pageUrl("/agent", locale)})`)}</generator>
${items.join("\n")}
  </channel>
</rss>
`;
}

type FeedRow = Pick<ItemRow, "id" | "title" | "summary" | "reason" | "url" | "category" | "published_at" | "discovered_at" | "source_name"> &
  Partial<Pick<ItemRow, "channel" | "x_post" | "zh_text" | "quoted_zh" | "language" | "syndicate"> & {
    body_html: string | null; tr_html: string | null; tr_complete: boolean | null;
  }>;

/** Readers keep feed items for days: body images in full RSS are signed for a week, not a day. */
const FEED_IMAGE_SECONDS = 7 * 86400;

/** 全文 RSS 按请求语言、完整英文译文、原文回退，保留归属和站内链接。 */
function fullContent(r: FeedRow, aihot: string, locale: Locale): string | null {
  let html: string | null = null;
  const x = r.channel === "x" ? xView({ x_post: r.x_post ?? null, zh_text: r.zh_text ?? null, quoted_zh: r.quoted_zh ?? null }) : null;
  if (x?.text) {
    html = textToHtml(x.translation ?? x.text);
    if (x.quoted?.text) {
      html += `<blockquote><p>${feedCopy(locale).quoted} @${escapeXml(x.quoted.handle)}：</p>${textToHtml(x.quoted.translation ?? x.quoted.text)}${x.quoted.url ? `<p><a href="${escapeXml(x.quoted.url)}">${escapeXml(x.quoted.url)}</a></p>` : ""}</blockquote>`;
    }
  } else if (r.body_html) {
    html = r.tr_html && r.tr_complete ? r.tr_html : r.body_html;
  }
  if (!html) return null;
  return `${proxyBodyImages(html, true, FEED_IMAGE_SECONDS)}<p>${escapeXml(feedCopy(locale).attribution)} <a href="${aihot}">${aihot}</a></p>`;
}

function itemXml(r: FeedRow, includeContent: boolean, locale: Locale): string {
  const aihot = pageUrl(`/items/${r.id}`, locale);
  const summary = r.summary ?? "";
  const description = `<p>${escapeXml(summary)}</p>\n<p>🔗 <a href="${escapeXml(r.url)}">${feedCopy(locale).original}</a></p>\n<p>via ${escapeXml(SITE.name)} · <a href="${aihot}">${aihot}</a></p>`;
  const label = r.category ? categoryLabel(r.category, locale) : undefined;
  const category = label ? `\n      <category>${escapeXml(label)}</category>` : "";
  let content = "";
  if (includeContent && r.syndicate) {
    const html = fullContent(r, aihot, locale);
    if (html) content = `\n      <content:encoded>${cdata(html)}</content:encoded>`;
  }
  const pub = r.published_at ?? r.discovered_at;
  return `    <item>
      <title>${cdata(r.title)}</title>
      <link>${aihot}</link>
      <description>${cdata(description)}</description>${content}${category}
      <pubDate>${rfc822(pub)}</pubDate>
      <guid isPermaLink="false">${escapeXml(r.id)}</guid>
      <author>${AUTHOR} (${escapeXml(r.source_name)})</author>
    </item>`;
}

export type ItemFeedKind = "selected" | "selected-full" | "all";

// Like the live feeds, items are the newest by their original publish time (the pubDate shown):
// 50 per feed; a category feed holds only its last 7 days (by original publish time).

export async function itemFeed(kind: ItemFeedKind, category: PublicApiCategoryKey | null, now = new Date(), locale: Locale = DEFAULT_LOCALE): Promise<string> {
  const includeContent = kind === "selected-full";
  const scope = kind === "all"
    ? sql`${listedCondition(now)} AND p.eligible AND coalesce(p.published_at, p.discovered_at) > ${now}::timestamptz - interval '7 days'
        AND coalesce(p.published_at, p.discovered_at) <= ${now}`
    : sql`${selectedCondition(now)} ${categoryCondition(category, true)}
        ${category ? sql`AND coalesce(p.published_at, p.discovered_at) >= ${new Date(now.getTime() - 7 * 86400_000)}` : sql``}`;
  const rows = await sql<FeedRow[]>`
    WITH page AS MATERIALIZED (
      SELECT p.article_id FROM publications p WHERE ${scope}
      ORDER BY coalesce(p.published_at, p.discovered_at) DESC, p.article_id DESC LIMIT 50
    )
    SELECT p.article_id AS id, p.title, p.summary, p.reason, p.url, p.category, p.published_at, p.discovered_at, s.name AS source_name
      ${includeContent ? sql`, p.channel, p.syndicate, a.language, a.x_post,
        CASE WHEN p.channel = 'x' THEN tr.body_text END AS zh_text, qt.text_zh AS quoted_zh,
        a.body_html, tr.body_html AS tr_html, tr.complete AS tr_complete` : sql``}
    FROM page JOIN publications p ON p.article_id = page.article_id JOIN sources s ON s.id = p.source_id
    ${includeContent ? sql`LEFT JOIN articles a ON a.id = p.article_id AND p.syndicate
      ${bodyTranslationJoins(locale, true)}` : sql``}
    ORDER BY coalesce(p.published_at, p.discovered_at) DESC, p.article_id DESC`;
  let meta: { title: string; description: string; homePath: string; selfPath: string; ttl: number };
  if (category) {
    const label = categoryLabel(category, locale);
    const copy = feedCopy(locale);
    meta = {
      title: includeContent ? `${SITE.name} — ${label}${locale === "zh" ? "" : ": "}${copy.full}` : `${SITE.name} — ${label}`,
      description: includeContent
        ? copy.fullCategoryDescription.replace("{label}", label)
        : copy.categoryDescription.replace("{label}", label),
      homePath: "/",
      selfPath: includeContent ? `/feed/full/category/${category}.xml` : `/feed/category/${category}.xml`,
      ttl: 30,
    };
  } else {
    const m = feedMeta(kind === "selected" ? "selected" : kind === "selected-full" ? "selectedFull" : "all", locale);
    meta = { title: m.title, description: m.description, homePath: m.homePath, selfPath: m.path, ttl: m.pollHintMinutes };
  }
  return channel(meta, (await localizeArticles(rows, locale)).map((r) => itemXml(r, includeContent, locale)), locale);
}

export async function dailyFeed(locale: Locale = DEFAULT_LOCALE): Promise<string> {
  const index = await reportIndex("daily", locale);
  const rows = index.rows.slice(0, 30);
  const m = feedMeta("daily", locale);
  const gone = index.gone;
  const items = rows.map((r) => {
    const url = pageUrl(`/daily/${r.key}`, locale);
    const lead = reportHeadline(r.content, "daily", gone);
    const title = lead ? `${SITE.name} ${feedCopy(locale).daily} · ${r.key} — ${lead}` : `${SITE.name} ${feedCopy(locale).daily} · ${r.key}`;
    const description = `<p>${escapeXml(r.content.lead?.leadParagraph ?? lead ?? "")} — ${feedCopy(locale).readDaily}</p>\n<p>via ${escapeXml(SITE.name)} · <a href="${url}">${url}</a></p>`;
    return `    <item>
      <title>${cdata(title)}</title>
      <link>${url}</link>
      <description>${cdata(description)}</description>
      <pubDate>${rfc822(r.generated_at)}</pubDate>
      <guid isPermaLink="false">daily-${escapeXml(r.key)}</guid>
      <author>${AUTHOR} (${escapeXml(SITE.name)})</author>
    </item>`;
  });
  return channel({ title: m.title, description: m.description, homePath: m.homePath, selfPath: m.path, ttl: m.pollHintMinutes }, items, locale);
}

export function isFeedCategory(v: string): v is PublicApiCategoryKey {
  return (PUBLIC_API_CATEGORY_KEYS as readonly string[]).includes(v);
}
