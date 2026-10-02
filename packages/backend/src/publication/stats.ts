// 关于页的统计缓存十分钟；最近精选单独读取，避免标题切换语言或撤回后被统计缓存阻挡。
import type { SiteStats } from "@aihot/contracts/site";
import { DEFAULT_LOCALE, type Locale } from "@aihot/contracts/locale";
import { sql } from "../db.ts";
import { cached } from "../lib/cache.ts";
import { selectedCondition } from "./items.ts";
import { localizeArticles } from "./localized.ts";

export type { SiteStats };

/** 关于页信源动画最多展示的入口数。 */
const SAMPLE = 180;

const stats = cached(() => querySiteStats(new Date()), { freshMs: 10 * 60_000, maxStaleMs: 60 * 60_000 });

export async function loadSiteStats(locale: Locale = DEFAULT_LOCALE): Promise<SiteStats> {
  const [counts, latest] = await Promise.all([stats.get(), loadLatest(locale)]);
  return { ...counts, latest };
}

async function loadLatest(locale: Locale): Promise<SiteStats["latest"]> {
  const rows = await sql<{ id: string; title: string; summary: string | null; reason: string | null; source: string }[]>`
    SELECT p.article_id AS id, p.title, p.summary, p.reason, s.name AS source
    FROM publications p JOIN sources s ON s.id = p.source_id
    WHERE ${selectedCondition(new Date())} ORDER BY p.timeline_at DESC LIMIT 8`;
  return (await localizeArticles(rows, locale)).map((item) => ({
    id: item.id, title: item.title, source: item.source, textLocale: item.text_locale,
  }));
}

async function querySiteStats(now: Date): Promise<SiteStats> {
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  const [[row], kinds, sample] = await Promise.all([
    sql<Array<Omit<SiteStats, "sourceKinds" | "day" | "sampleSources" | "latest"> & { collected: number; selectedDay: number }>>`
      SELECT (SELECT count(*) FROM sources WHERE enabled)::int AS sources,
             (SELECT count(*) FROM sources WHERE enabled AND participation_mode = 'hot_signal')::int AS "heatOnlySources",
             (SELECT count(*) FROM publications p WHERE p.visibility <> 'withdrawn')::int AS items,
             (SELECT count(*) FROM publications p WHERE ${selectedCondition(now)})::int AS selected,
             (SELECT count(*) FROM reports WHERE kind = 'daily')::int AS dailies,
             (SELECT count(*) FROM publications p WHERE p.visibility <> 'withdrawn' AND p.discovered_at > ${dayAgo})::int AS collected,
             (SELECT count(*) FROM publications p WHERE ${selectedCondition(now)} AND p.timeline_at > ${dayAgo})::int AS "selectedDay"`,
    sql<{ kind: string; n: number }[]>`SELECT kind, count(*)::int AS n FROM sources WHERE enabled GROUP BY kind`,
    // 每天使用固定顺序，让连续访问的信源动画保持稳定。
    sql<{ name: string; kind: string; heat_only: boolean }[]>`
      SELECT name, kind, participation_mode = 'hot_signal' AS heat_only FROM sources WHERE enabled
      ORDER BY md5(id::text || ${now.toISOString().slice(0, 10)}) LIMIT ${SAMPLE}`,
  ]);
  const { collected, selectedDay, ...totals } = row!;
  const value: SiteStats = {
    ...totals,
    sourceKinds: Object.fromEntries(kinds.map((k) => [k.kind, k.n])),
    day: { collected, selected: selectedDay },
    sampleSources: sample.map((s) => ({ name: s.name, kind: s.kind, heatOnly: s.heat_only })),
    latest: [],
  };
  return value;
}
