import { createHash } from "node:crypto";
import { z } from "zod";
import { TARGET_LOCALES, type Locale } from "@aihot/contracts/locale";
import { CATEGORIES, categorySection } from "@aihot/industry/taxonomy";
import { translationMatchesLocale } from "../content/language.ts";
import { sql, type Db } from "../db.ts";

const Text = z.string().nullable();
export const StoryFields = z.object({
  title: z.string().trim().min(1), summary: Text, digest: Text, latest: Text,
  developments: z.array(z.object({ public_id: z.string(), title: z.string().trim().min(1) }).strict()),
}).strict();
export type StoryText = z.infer<typeof StoryFields>;
export type StorySource = StoryText & { public_id: string; source_hash: string };

/** 只读取有可见报道的未合并事件；进展标题参与同一个源快照。 */
export async function storySources(db: Db = sql, opts: { ids?: string[]; limit?: number; pending?: boolean; qualityVersion?: string; lock?: boolean; offset?: number; budgetMs?: number } = {}): Promise<StorySource[]> {
  if (opts.pending) {
    const started = Date.now();
    const limit = Math.max(0, Math.floor(opts.limit ?? 30));
    const sources: StorySource[] = [];
    // 校验实际字段，避免同哈希的损坏译文永久挡住补译；分页同时覆盖历史事件。
    for (let offset = 0; sources.length < limit && Date.now() - started < (opts.budgetMs ?? 4 * 60_000); offset += 100) {
      const rows = await storySources(db, { ids: opts.ids, limit: 100, offset });
      if (!rows.length) break;
      const stored = await db<(Stored & { quality_version: string })[]>`SELECT ref_id, locale, source_hash, fields, quality_version FROM localizations
        WHERE kind = 'story' AND ref_id = ANY(${rows.map((r) => r.public_id)}::text[])
          AND locale = ANY(${[...TARGET_LOCALES]}::text[])`;
      const byId = new Map(stored.map((r) => [`${r.ref_id}:${r.locale}`, r]));
      for (const row of rows) {
        if (TARGET_LOCALES.some((locale) => {
          const found = byId.get(`${row.public_id}:${locale}`);
          return found?.source_hash !== row.source_hash || (opts.qualityVersion !== undefined && found?.quality_version !== opts.qualityVersion)
            || !validStoryFields(found.fields, row, locale);
        })) sources.push(row);
        if (sources.length >= limit) break;
      }
      if (rows.length < 100) break;
    }
    return sources;
  }
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
    ORDER BY s.latest_at DESC NULLS LAST, s.id DESC LIMIT ${opts.limit ?? 2147483647} OFFSET ${opts.offset ?? 0}
    ${opts.lock ? db`FOR UPDATE OF s` : db``}`;
}

function present(source: string | null, translated: string | null): boolean {
  if (source === null) return translated === null;
  return source.trim() ? !!translated?.trim() : translated === source;
}

export function validStoryFields(value: unknown, source: StoryText, locale?: Locale): StoryText | null {
  const parsed = StoryFields.safeParse(value);
  if (!parsed.success) return null;
  const fields = parsed.data;
  if (!present(source.summary, fields.summary) || !present(source.digest, fields.digest) || !present(source.latest, fields.latest)) return null;
  if (fields.developments.length !== source.developments.length) return null;
  const ids = new Set(fields.developments.map((f) => f.public_id));
  if (ids.size !== source.developments.length || source.developments.some((f) => !ids.has(f.public_id))) return null;
  if (locale && ![fields.title, fields.summary, fields.digest, fields.latest, ...fields.developments.map((f) => f.title)]
    .every((text) => text === null || translationMatchesLocale(text, locale))) return null;
  return fields;
}

type Stored = { ref_id: string; locale: string; source_hash: string; fields: unknown };
/** 只使用目标语言的有效译文；缺失时保留源文，不拿另一种译文替代。 */
export async function localizedStoryTexts(ids: string[], locale: Locale, db: Db = sql): Promise<Map<string, StoryText>> {
  if (!ids.length || locale === "zh") return new Map();
  const sources = await storySources(db, { ids: [...new Set(ids)] });
  const stored = await db<Stored[]>`SELECT ref_id, locale, source_hash, fields FROM localizations
    WHERE kind = 'story' AND ref_id = ANY(${ids}::text[]) AND locale = ${locale}`;
  const byId = new Map(stored.map((r) => [`${r.ref_id}:${r.locale}`, r]));
  return new Map(sources.map((source) => {
    const row = byId.get(`${source.public_id}:${locale}`);
    const translated = row?.source_hash === source.source_hash ? validStoryFields(row.fields, source, locale) : null;
    if (translated) return [source.public_id, translated] as const;
    return [source.public_id, source] as const;
  }));
}

const CitationFields = z.object({ title: z.string(), summary: Text }).strict();
export const ReportFields = z.object({
  title: Text, headline: Text, overview: Text,
  lead: z.object({ title: z.string(), leadParagraph: z.string() }).strict().nullable(),
  themes: z.array(z.object({ heading: z.string(), summary: Text, storyRefs: z.array(CitationFields) }).strict()),
  sections: z.array(z.object({ label: Text, summary: Text, items: z.array(CitationFields) }).strict()),
  flashes: z.array(CitationFields),
}).strict();
export type ReportProse = z.infer<typeof ReportFields>;
export type ReportSource = { kind: "daily" | "weekly" | "monthly"; key: string; content: Record<string, any> };

const citationProse = (item: Record<string, any>) => ({ title: item.title ?? "", summary: item.summary ?? null });
const sectionCategory = (label: string) => CATEGORIES.find((category) => category.section === label || category.key === label);

/** 包含报刊快照的全部读者文字；引用按位置翻译，身份、链接和统计留在源快照。 */
export function reportProse(content: Record<string, any>): ReportProse {
  return {
    title: /^.+ [周月]报 · \d{4}-/.test(String(content.title ?? "")) ? null : (content.title ?? null), headline: content.headline ?? null, overview: content.overview ?? null,
    lead: content.lead ? { title: content.lead.title ?? "", leadParagraph: content.lead.leadParagraph ?? "" } : null,
    themes: (content.themes ?? []).map((t: any) => ({ heading: t.heading ?? "", summary: t.summary ?? null, storyRefs: (t.storyRefs ?? []).map(citationProse) })),
    sections: (content.sections ?? []).map((s: any) => ({ label: sectionCategory(s.label) ? null : (s.label ?? null), summary: s.summary ?? null, items: (s.items ?? []).map(citationProse) })),
    flashes: (content.flashes ?? []).map(citationProse),
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
    .concat(prose.sections.map((s) => s.label),
      [...prose.themes.flatMap((t) => t.storyRefs), ...prose.sections.flatMap((s) => s.items), ...prose.flashes].flatMap((c) => [c.title, c.summary]))
    .some((text) => text?.trim());
}

export function validReportFields(value: unknown, source: ReportProse, locale?: Locale): ReportProse | null {
  const parsed = ReportFields.safeParse(value);
  if (!parsed.success) return null;
  const fields = parsed.data;
  if (!(["title", "headline", "overview"] as const).every((key) => present(source[key], fields[key]))) return null;
  if (!!source.lead !== !!fields.lead || fields.themes.length !== source.themes.length || fields.sections.length !== source.sections.length) return null;
  if (source.lead && fields.lead && (!present(source.lead.title, fields.lead.title) || !present(source.lead.leadParagraph, fields.lead.leadParagraph))) return null;
  const validCitation = (source: z.infer<typeof CitationFields>, translated: z.infer<typeof CitationFields>) =>
    present(source.title, translated.title) && present(source.summary, translated.summary);
  const validCitations = (sources: z.infer<typeof CitationFields>[], translated: z.infer<typeof CitationFields>[]) =>
    sources.length === translated.length && sources.every((item, i) => validCitation(item, translated[i]!));
  if (source.themes.some((t, i) => !present(t.heading, fields.themes[i]!.heading) || !present(t.summary, fields.themes[i]!.summary)
    || !validCitations(t.storyRefs, fields.themes[i]!.storyRefs))) return null;
  if (source.sections.some((s, i) => !present(s.label, fields.sections[i]!.label) || !present(s.summary, fields.sections[i]!.summary)
    || !validCitations(s.items, fields.sections[i]!.items))) return null;
  if (!validCitations(source.flashes, fields.flashes)) return null;
  if (locale && ![fields.title, fields.headline, fields.overview, fields.lead?.title, fields.lead?.leadParagraph,
    ...fields.themes.flatMap((t) => [t.heading, t.summary]), ...fields.sections.flatMap((s) => [s.label, s.summary]),
    ...[...fields.themes.flatMap((t) => t.storyRefs), ...fields.sections.flatMap((s) => s.items), ...fields.flashes].flatMap((c) => [c.title, c.summary])]
    .every((text) => text == null || translationMatchesLocale(text, locale))) return null;
  return fields;
}

function applyReportProse(content: Record<string, any>, prose: ReportProse): Record<string, any> {
  const translated = { ...content };
  for (const key of ["title", "headline", "overview"] as const) if (content[key] !== undefined) translated[key] = prose[key];
  if (content.lead) translated.lead = { ...content.lead, ...prose.lead };
  const cite = (raw: Record<string, any>, fields: z.infer<typeof CitationFields>) => ({ ...raw, title: fields.title, ...(raw.summary !== undefined ? { summary: fields.summary } : {}) });
  if (content.themes) translated.themes = content.themes.map((t: any, i: number) => ({ ...t, heading: prose.themes[i]!.heading,
    ...(t.summary !== undefined ? { summary: prose.themes[i]!.summary } : {}), storyRefs: (t.storyRefs ?? []).map((item: any, j: number) => cite(item, prose.themes[i]!.storyRefs[j]!)) }));
  if (content.sections) translated.sections = content.sections.map((s: any, i: number) => ({ ...s, label: prose.sections[i]!.label ?? s.label,
    ...(s.summary !== undefined ? { summary: prose.sections[i]!.summary } : {}), items: (s.items ?? []).map((item: any, j: number) => cite(item, prose.sections[i]!.items[j]!)) }));
  if (content.flashes) translated.flashes = content.flashes.map((item: any, i: number) => cite(item, prose.flashes[i]!));
  return translated;
}

export async function localizeReportRows<T extends ReportSource>(rows: T[], locale: Locale, db: Db = sql): Promise<T[]> {
  if (locale === "zh" || !rows.length) return rows;
  const stored = await db<Stored[]>`SELECT ref_id, locale, source_hash, fields FROM localizations
    WHERE kind = 'report' AND ref_id = ANY(${rows.map((r) => `${r.kind}:${r.key}`)}::text[]) AND locale = ${locale}`;
  const byId = new Map(stored.map((r) => [`${r.ref_id}:${r.locale}`, r]));
  const contents = rows.map((row) => {
    let content = row.content;
    const stored = byId.get(`${row.kind}:${row.key}:${locale}`);
    const fields = stored?.source_hash === reportSourceHash(row.content) ? validReportFields(stored.fields, reportProse(row.content), locale) : null;
    if (fields) content = applyReportProse(content, fields);
    return { ...content, ...(content.sections ? { sections: content.sections.map((s: any) => {
      const category = sectionCategory(s.label);
      return { ...s, label: category ? categorySection(category.key, locale) : s.label };
    }) } : {}) };
  });
  return rows.map((row, i) => ({ ...row, content: contents[i]! }));
}

/** 列表和详情中的事件引用同样使用事件译文，而不是借用某篇报道的标题。 */
export async function localizeItemStories<T extends { story_public_id: string | null; story_title: string | null }>(rows: T[], locale: Locale, db: Db = sql): Promise<T[]> {
  if (locale === "zh") return rows;
  const translated = await localizedStoryTexts(rows.flatMap((r) => r.story_public_id ? [r.story_public_id] : []), locale, db);
  return rows.map((r) => ({ ...r, story_title: (r.story_public_id && translated.get(r.story_public_id)?.title) || r.story_title }));
}
