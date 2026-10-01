import { createHash } from "node:crypto";
import { z } from "zod";
import { TARGET_LOCALES, type Locale } from "@aihot/contracts/locale";
import { CATEGORIES, categorySection } from "@aihot/industry/taxonomy";
import { sql, type Db } from "../db.ts";
import { localizeArticles } from "./localized.ts";

const Text = z.string().nullable();
export const StoryFields = z.object({
  title: z.string().trim().min(1), summary: Text, digest: Text, latest: Text,
  developments: z.array(z.object({ public_id: z.string(), title: z.string().trim().min(1) }).strict()),
}).strict();
export type StoryText = z.infer<typeof StoryFields>;
export type StorySource = StoryText & { public_id: string; source_hash: string };

/** 只读取有可见报道的未合并事件；进展标题参与同一个源快照。 */
export async function storySources(db: Db = sql, opts: { ids?: string[]; limit?: number; pending?: boolean; lock?: boolean } = {}): Promise<StorySource[]> {
  return db<StorySource[]>`
    SELECT s.public_id::text, s.title, s.summary, s.digest, s.latest, f.developments, h.source_hash
    FROM stories s CROSS JOIN LATERAL (
      SELECT coalesce(jsonb_agg(jsonb_build_object('public_id', f.public_id::text, 'title', f.title) ORDER BY f.public_id), '[]'::jsonb) AS developments
      FROM facts f WHERE f.story_id = s.id AND EXISTS (
        SELECT 1 FROM fact_articles fa JOIN publications p ON p.article_id = fa.article_id
        JOIN sources src ON src.id = p.source_id
        WHERE fa.fact_id = f.id AND p.visibility = 'public' AND src.participation_mode = 'editorial'
          AND (NOT p.selected OR p.visible_after <= now()))
    ) f CROSS JOIN LATERAL (
      SELECT md5(jsonb_build_object('title', s.title, 'summary', s.summary, 'digest', s.digest,
        'latest', s.latest, 'developments', f.developments)::text) AS source_hash
    ) h
    WHERE s.merged_into IS NULL AND jsonb_array_length(f.developments) > 0 AND btrim(s.title) <> ''
      AND ${opts.ids ? db`s.public_id::text = ANY(${opts.ids}::text[])` : db`true`}
      AND ${opts.pending ? db`EXISTS (SELECT 1 FROM unnest(${[...TARGET_LOCALES]}::text[]) target(locale)
        WHERE NOT EXISTS (SELECT 1 FROM localizations l WHERE l.kind = 'story' AND l.ref_id = s.public_id::text
          AND l.locale = target.locale AND l.source_hash = h.source_hash))` : db`true`}
    ORDER BY s.latest_at DESC NULLS LAST, s.id DESC LIMIT ${opts.limit ?? 2147483647}
    ${opts.lock ? db`FOR UPDATE OF s` : db``}`;
}

function present(source: string | null, translated: string | null): boolean {
  if (source === null) return translated === null;
  return source.trim() ? !!translated?.trim() : translated === source;
}

export function validStoryFields(value: unknown, source: StoryText): StoryText | null {
  const parsed = StoryFields.safeParse(value);
  if (!parsed.success) return null;
  const fields = parsed.data;
  if (!present(source.summary, fields.summary) || !present(source.digest, fields.digest) || !present(source.latest, fields.latest)) return null;
  if (fields.developments.length !== source.developments.length) return null;
  const ids = new Set(fields.developments.map((f) => f.public_id));
  if (ids.size !== source.developments.length || source.developments.some((f) => !ids.has(f.public_id))) return null;
  return fields;
}

type Stored = { ref_id: string; locale: string; source_hash: string; fields: unknown };
/** 缺失或失效译文按请求语言、英语、中文依次回退。 */
export async function localizedStoryTexts(ids: string[], locale: Locale, db: Db = sql): Promise<Map<string, StoryText>> {
  if (!ids.length || locale === "zh") return new Map();
  const sources = await storySources(db, { ids: [...new Set(ids)] });
  const stored = await db<Stored[]>`SELECT ref_id, locale, source_hash, fields FROM localizations
    WHERE kind = 'story' AND ref_id = ANY(${ids}::text[]) AND locale = ANY(${[locale, "en"]}::text[])`;
  const byId = new Map(stored.map((r) => [`${r.ref_id}:${r.locale}`, r]));
  return new Map(sources.map((source) => {
    for (const language of [locale, "en"]) {
      const row = byId.get(`${source.public_id}:${language}`);
      if (row?.source_hash !== source.source_hash) continue;
      const translated = validStoryFields(row.fields, source);
      if (translated) return [source.public_id, translated] as const;
    }
    return [source.public_id, source] as const;
  }));
}

export const ReportFields = z.object({
  title: Text, headline: Text, overview: Text,
  lead: z.object({ title: z.string(), leadParagraph: z.string() }).strict().nullable(),
  themes: z.array(z.object({ heading: z.string(), summary: Text }).strict()),
  sections: z.array(z.object({ summary: Text }).strict()),
}).strict();
export type ReportProse = z.infer<typeof ReportFields>;
export type ReportSource = { kind: "daily" | "weekly" | "monthly"; key: string; content: Record<string, any> };

/** 只向模型发送读者文字，不发送引用、排序、日期或统计等结构数据。 */
export function reportProse(content: Record<string, any>): ReportProse {
  return {
    title: /^.+ [周月]报 · \d{4}-/.test(String(content.title ?? "")) ? null : (content.title ?? null), headline: content.headline ?? null, overview: content.overview ?? null,
    lead: content.lead ? { title: content.lead.title ?? "", leadParagraph: content.lead.leadParagraph ?? "" } : null,
    themes: (content.themes ?? []).map((t: any) => ({ heading: t.heading ?? "", summary: t.summary ?? null })),
    sections: (content.sections ?? []).map((s: any) => ({ summary: s.summary ?? null })),
  };
}

/** 固定键序列的 JSON 只包含实际翻译的中文文案。 */
export function reportSourceHash(content: Record<string, any>): string {
  return createHash("md5").update(JSON.stringify(reportProse(content))).digest("hex");
}

export function hasReportProse(content: Record<string, any>): boolean {
  const prose = reportProse(content);
  return !![prose.title, prose.headline, prose.overview, prose.lead?.title, prose.lead?.leadParagraph,
    ...prose.themes.flatMap((t) => [t.heading, t.summary]), ...prose.sections.map((s) => s.summary)]
    .some((text) => text?.trim());
}

export function validReportFields(value: unknown, source: ReportProse): ReportProse | null {
  const parsed = ReportFields.safeParse(value);
  if (!parsed.success) return null;
  const fields = parsed.data;
  if (!(["title", "headline", "overview"] as const).every((key) => present(source[key], fields[key]))) return null;
  if (!!source.lead !== !!fields.lead || fields.themes.length !== source.themes.length || fields.sections.length !== source.sections.length) return null;
  if (source.lead && fields.lead && (!present(source.lead.title, fields.lead.title) || !present(source.lead.leadParagraph, fields.lead.leadParagraph))) return null;
  if (source.themes.some((t, i) => !present(t.heading, fields.themes[i]!.heading) || !present(t.summary, fields.themes[i]!.summary))) return null;
  if (source.sections.some((s, i) => !present(s.summary, fields.sections[i]!.summary))) return null;
  return fields;
}

function applyReportProse(content: Record<string, any>, prose: ReportProse): Record<string, any> {
  const translated = { ...content };
  for (const key of ["title", "headline", "overview"] as const) if (content[key] !== undefined) translated[key] = prose[key];
  if (content.lead) translated.lead = { ...content.lead, ...prose.lead };
  if (content.themes) translated.themes = content.themes.map((t: any, i: number) => ({ ...t, ...prose.themes[i] }));
  if (content.sections) translated.sections = content.sections.map((s: any, i: number) => ({ ...s, ...(s.summary !== undefined ? { summary: prose.sections[i]?.summary } : {}) }));
  return translated;
}

/** 引用卡片的哈希总是取 publications 全部标题、摘要和理由；快讯中的裁剪字段不能用于校验。 */
async function localizeCitations(contents: Record<string, any>[], locale: Locale, db: Db): Promise<Record<string, any>[]> {
  const items = contents.flatMap((c) => [...(c.sections ?? []).flatMap((s: any) => s.items ?? []), ...(c.flashes ?? []), ...(c.themes ?? []).flatMap((t: any) => t.storyRefs ?? [])]);
  const ids: string[] = [...new Set(items.map((i: any) => i.itemId).filter((id: unknown): id is string => typeof id === "string" && !!id))];
  if (!ids.length) return contents;
  const sources = await db<{ id: string; title: string | null; summary: string | null; reason: string | null }[]>`
    SELECT article_id AS id, title, summary, reason FROM publications
    WHERE article_id = ANY(${ids}::text[]) AND visibility = 'public' AND eligible`;
  const translated = await localizeArticles(sources, locale, db);
  const byId = new Map(translated.flatMap((row, i) => row === sources[i] ? [] : [[row.id, row] as const]));
  const cite = (raw: Record<string, any>) => {
    const text = byId.get(raw.itemId);
    return text ? { ...raw, title: text.title, ...(raw.summary !== undefined ? { summary: text.summary } : {}) } : raw;
  };
  return contents.map((c) => ({ ...c,
    ...(c.sections ? { sections: c.sections.map((s: any) => ({ ...s, items: (s.items ?? []).map(cite) })) } : {}),
    ...(c.flashes ? { flashes: c.flashes.map(cite) } : {}),
    ...(c.themes ? { themes: c.themes.map((t: any) => ({ ...t, storyRefs: (t.storyRefs ?? []).map(cite) })) } : {}),
  }));
}

export async function localizeReportRows<T extends ReportSource>(rows: T[], locale: Locale, db: Db = sql): Promise<T[]> {
  if (locale === "zh" || !rows.length) return rows;
  const stored = await db<Stored[]>`SELECT ref_id, locale, source_hash, fields FROM localizations
    WHERE kind = 'report' AND ref_id = ANY(${rows.map((r) => `${r.kind}:${r.key}`)}::text[]) AND locale = ANY(${[locale, "en"]}::text[])`;
  const byId = new Map(stored.map((r) => [`${r.ref_id}:${r.locale}`, r]));
  const contents = rows.map((row) => {
    let content = row.content;
    for (const language of [locale, "en"]) {
      const stored = byId.get(`${row.kind}:${row.key}:${language}`);
      if (stored?.source_hash !== reportSourceHash(row.content)) continue;
      const fields = validReportFields(stored.fields, reportProse(row.content));
      if (fields) { content = applyReportProse(content, fields); break; }
    }
    return { ...content, ...(content.sections ? { sections: content.sections.map((s: any) => {
      const category = CATEGORIES.find((c) => c.section === s.label || c.key === s.label);
      return { ...s, label: category ? categorySection(category.key, locale) : s.label };
    }) } : {}) };
  });
  const localized = await localizeCitations(contents, locale, db);
  return rows.map((row, i) => ({ ...row, content: localized[i]! }));
}

/** 列表和详情中的事件引用同样使用事件译文，而不是借用某篇报道的标题。 */
export async function localizeItemStories<T extends { story_public_id: string | null; story_title: string | null }>(rows: T[], locale: Locale, db: Db = sql): Promise<T[]> {
  if (locale === "zh") return rows;
  const translated = await localizedStoryTexts(rows.flatMap((r) => r.story_public_id ? [r.story_public_id] : []), locale, db);
  return rows.map((r) => ({ ...r, story_title: (r.story_public_id && translated.get(r.story_public_id)?.title) || r.story_title }));
}
