// Names, dates and grouping for daily, weekly and monthly reports.
import type { ReportNavigationEntry, ReportKind } from "@aihot/contracts/site";
import { beijingWeekday } from "../../lib/format.ts";
import type { SiteLocale } from "@aihot/industry/site";
import { createT, translateKnown } from "../../i18n/index.ts";
import { stripLocale } from "../../i18n/locale.ts";

const intlLocale = (locale: SiteLocale) => ({ zh: "zh-CN", ru: "ru-RU", en: "en-US" }[locale]);
export const reportNumber = (n: number, locale: SiteLocale = "zh") => new Intl.NumberFormat(intlLocale(locale)).format(n);
export function reportDate(key: string, locale: SiteLocale, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Asia/Shanghai", calendar: "gregory", ...options }).format(new Date(`${key}T00:00:00+08:00`));
}
export function issueLabel(n: number, locale: SiteLocale = "zh") { return createT(locale)("第 {count} 期", { count: n }); }

export const KINDS: ReportKind[] = ["daily", "weekly", "monthly"];
export const KIND_PATH: Record<ReportKind, string> = { daily: "/daily", weekly: "/weekly", monthly: "/monthly" };
export const KIND_LABEL: Record<ReportKind, string> = { daily: "日报", weekly: "周报", monthly: "月报" };

export function kindFromPath(pathname: string): ReportKind {
  if (stripLocale(pathname).startsWith("/weekly")) return "weekly";
  if (stripLocale(pathname).startsWith("/monthly")) return "monthly";
  return "daily";
}

export function reportPath(kind: ReportKind, key: string): string {
  return `${KIND_PATH[kind]}/${key}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Monday and Sunday (YYYY-MM-DD) of an ISO week key such as 2026-W38. */
export function isoWeekRange(key: string): [string, string] {
  const [y, w] = key.split("-W").map(Number) as [number, number];
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (w - 1) * 7 * 86400000);
  return [ymd(monday), ymd(new Date(monday.getTime() + 6 * 86400000))];
}

/** First and last day of a month key such as 2026-08. */
export function monthRange(key: string): [string, string] {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return [`${key}-01`, ymd(new Date(Date.UTC(y, m, 0)))];
}

/** 根据刊物周期生成本地化的精选数量标题。 */
export function headline(kind: ReportKind, key: string, count: number, locale: SiteLocale = "zh"): string {
  const t = createT(locale);
  return t(kind === "daily" ? "这一天的 {count} 条编程精选" : kind === "weekly" ? "本周的 {count} 条编程精选" : "{month}的 {count} 条编程精选", { count, month: kind === "monthly" ? reportDate(`${key}-01`, locale, { month: "long" }) : "" });
}

/** "09.16" for a story inside a week or month. */
export function shortDay(iso: string, locale: SiteLocale = "zh"): string {
  if (locale !== "zh") return new Intl.DateTimeFormat(intlLocale(locale), { month: "short", day: "numeric", timeZone: "Asia/Shanghai", calendar: "gregory" }).format(new Date(iso));
  const d = new Date(Date.parse(iso) + 8 * 3600000);
  return `${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
}

/** Month-day label of a daily key: "9月26日". */
export function dayLabel(key: string, locale: SiteLocale = "zh"): string {
  if (locale !== "zh") return reportDate(key, locale, { month: "short", day: "numeric" });
  return `${Number(key.slice(5, 7))}月${Number(key.slice(8, 10))}日`;
}


export interface ArchiveGroup {
  id: string;
  label: string;
  entries: Array<ReportNavigationEntry & { short: string }>;
}

/**
 * The archive column: days grouped by month, weeks by the month their Monday falls in ("第2周"),
 * months by year. Newest first, as the index comes.
 */
export function archiveGroups(kind: ReportKind, index: ReportNavigationEntry[], locale: SiteLocale = "zh"): ArchiveGroup[] {
  const t = createT(locale);
  const month = (key: string) => locale === "zh" ? `${key.slice(0, 4)} 年 ${Number(key.slice(5))} 月` : reportDate(`${key}-01`, locale, { year: "numeric", month: "long" });
  const groups: ArchiveGroup[] = [];
  const push = (id: string, label: string, e: ReportNavigationEntry & { short: string }) => {
    const g = groups[groups.length - 1];
    if (g && g.id === id) g.entries.push(e);
    else groups.push({ id, label, entries: [e] });
  };
  if (kind === "weekly") {
    const byMonth = new Map<string, string[]>();
    for (const e of index) {
      const m = isoWeekRange(e.key)[0].slice(0, 7);
      byMonth.set(m, [...(byMonth.get(m) ?? []), e.key]);
    }
    for (const e of index) {
      const m = isoWeekRange(e.key)[0].slice(0, 7);
      const weeks = [...byMonth.get(m)!].sort();
      push(m, month(m), { ...e, short: t("第{count}周", { count: weeks.indexOf(e.key) + 1 }) });
    }
    return groups;
  }
  for (const e of index) {
    if (kind === "daily") push(e.key.slice(0, 7), month(e.key.slice(0, 7)), { ...e, short: locale === "zh" ? `${Number(e.key.slice(8, 10))} 日` : reportDate(e.key, locale, { day: "numeric" }) });
    else push(e.key.slice(0, 4), locale === "zh" ? `${e.key.slice(0, 4)} 年` : reportDate(`${e.key.slice(0, 4)}-01-01`, locale, { year: "numeric" }), { ...e, short: locale === "zh" ? `${Number(e.key.slice(5, 7))} 月` : reportDate(`${e.key}-01`, locale, { month: "long" }) });
  }
  return groups;
}

/** An issue's mark in the archive column: a large number over a small word (a month's number stands alone). */
export function archiveMark(kind: ReportKind, key: string, locale: SiteLocale = "zh"): { big: string; small: string | null } {
  if (kind === "daily") return { big: locale === "zh" ? key.slice(8, 10) : reportDate(key, locale, { day: "2-digit" }), small: locale === "zh" ? beijingWeekday(key).replace("星期", "周") : reportDate(key, locale, { weekday: "short" }) };
  if (kind === "weekly") {
    const start = isoWeekRange(key)[0];
    return { big: locale === "zh" ? key.slice(6) : reportNumber(Number(key.slice(6)), locale), small: locale === "zh" ? `${Number(start.slice(5, 7))}.${Number(start.slice(8, 10))} 起` : createT(locale)("{date} 起", { date: dayLabel(start, locale) }) };
  }
  return { big: locale === "zh" ? key.slice(5, 7) : reportNumber(Number(key.slice(5, 7)), locale), small: null };
}

/** Short chip label for the phone switcher: "今天", "9月26日", "9月第2周", "8 月". */
export function chipLabel(kind: ReportKind, key: string, index: ReportNavigationEntry[], today: string, locale: SiteLocale = "zh"): string {
  const t = createT(locale);
  if (kind === "daily") return key === today ? t("今天") : dayLabel(key, locale);
  if (kind === "monthly") return locale === "zh" ? `${Number(key.slice(5, 7))} 月` : reportDate(`${key}-01`, locale, { month: "long" });
  const group = archiveGroups("weekly", index, locale).find((g) => g.entries.some((e) => e.key === key));
  const entry = group?.entries.find((e) => e.key === key);
  return group && entry ? locale === "zh" ? `${Number(group.id.slice(5))}月${entry.short}` : `${reportDate(`${group.id}-01`, locale, { month: "short" })} · ${entry.short}` : key;
}

/** "第 N 期": the issue's place in its series, counted from the first report that exists. */
export function issueNumber(index: ReportNavigationEntry[], key: string): number | null {
  const at = index.findIndex((e) => e.key === key);
  return at < 0 ? null : index.length - at;
}

/** The masthead's date block: a large figure and two small lines beside it. */
export function dateMark(kind: ReportKind, key: string, locale: SiteLocale = "zh"): { figure: string; top: string; bottom: string } {
  if (locale !== "zh") {
    if (kind === "daily") return { figure: reportDate(key, locale, { day: "2-digit" }), top: reportDate(key, locale, { year: "numeric", month: "long" }), bottom: beijingWeekday(key, locale) };
    if (kind === "weekly") { const [a, b] = isoWeekRange(key); return { figure: reportNumber(Number(key.slice(6)), locale), top: createT(locale)("{year} 年第 {week} 周", { year: reportDate(`${key.slice(0, 4)}-01-01`, locale, { year: "numeric" }), week: Number(key.slice(6)) }), bottom: `${dayLabel(a, locale)} — ${dayLabel(b, locale)}` }; }
    return { figure: reportNumber(Number(key.slice(5, 7)), locale), top: reportDate(`${key}-01`, locale, { year: "numeric" }), bottom: reportDate(`${key}-01`, locale, { month: "long" }) };
  }
  if (kind === "daily") return { figure: key.slice(8, 10), top: `${key.slice(0, 4)} 年 ${Number(key.slice(5, 7))} 月`, bottom: beijingWeekday(key) };
  if (kind === "weekly") {
    const [a, b] = isoWeekRange(key);
    return { figure: key.slice(6), top: `${key.slice(0, 4)} 年第 ${Number(key.slice(6))} 周`, bottom: `${a.slice(5).replace("-", ".")} — ${b.slice(5).replace("-", ".")}` };
  }
  return { figure: key.slice(5, 7), top: `${key.slice(0, 4)} 年`, bottom: `${Number(key.slice(5, 7))} 月` };
}

/** When each kind comes out (F10), for the masthead. */
export const EDITION: Record<ReportKind, string> = { daily: "每天 08:00 出刊", weekly: "每周一出刊", monthly: "每月 1 日出刊" };

/** The masthead's figures, in the order a reader wants them; zero model releases is left out. */
const METRICS: Array<[key: string, unit: string]> = [
  ["totalEvents", "件大事"],
  ["totalStories", "件大事"],
  ["sourcesCount", "个来源"],
  ["firstPartyEvents", "件一手发布"],
  ["modelsReleased", "个新模型"],
  ["selectedCount", "条精选"],
  ["reportsCovered", "期日报"],
];
export function metricItems(metrics: Record<string, number>, locale: SiteLocale = "zh"): Array<{ value: number; unit: string }> {
  return METRICS.filter(([k]) => typeof metrics[k] === "number" && (k !== "modelsReleased" || metrics[k]! > 0)).map(([k, unit]) => ({ value: metrics[k]!, unit: translateKnown(locale, unit, { count: metrics[k]! }) }));
}

/** "前一日 · 9月25日", "上一期 · 第 37 周", "下一期 · 7 月". */
export function neighbourLabel(kind: ReportKind, key: string, direction: "prev" | "next", locale: SiteLocale = "zh"): string {
  const t = createT(locale);
  if (locale !== "zh") { const which = t(direction === "prev" ? "上一期" : "下一期"); return `${which} · ${kind === "daily" ? dayLabel(key, locale) : kind === "weekly" ? t("第 {count} 周", { count: Number(key.slice(6)) }) : reportDate(`${key}-01`, locale, { month: "long" })}`; }
  if (kind === "daily") return `${direction === "prev" ? "前一日" : "后一日"} · ${dayLabel(key)}`;
  const which = direction === "prev" ? "上一期" : "下一期";
  return kind === "weekly" ? `${which} · 第 ${Number(key.slice(6))} 周` : `${which} · ${Number(key.slice(5, 7))} 月`;
}

const CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
/** Page numbers as a Chinese paper prints them: 1 → 一, 12 → 十二, 20 → 二十. */
export function cnNumber(n: number): string {
  if (n <= 10) return CN[n]!;
  if (n < 20) return `十${CN[n - 10]}`;
  return `${CN[Math.floor(n / 10)]}十${n % 10 ? CN[n % 10] : ""}`;
}

/** The line above the nameplate: "2026 年 9 月 26 日 · 星期六", "2026 年第 38 周 · 09.14 — 09.20", "2026 年 8 月". */
export function dateLine(kind: ReportKind, key: string, locale: SiteLocale = "zh"): string {
  const m = dateMark(kind, key, locale);
  if (locale !== "zh" && kind === "daily") return reportDate(key, locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  if (locale !== "zh" && kind === "monthly") return reportDate(`${key}-01`, locale, { year: "numeric", month: "long" });
  if (kind === "daily") return `${m.top} ${Number(key.slice(8, 10))} 日 · ${m.bottom}`;
  return kind === "weekly" ? `${m.top} · ${m.bottom}` : `${m.top} ${m.bottom}`;
}

/** What each kind is, under its nameplate. */
export const MOTTO: Record<ReportKind, string> = { daily: "AI 编程 · 每日精选", weekly: "AI 编程 · 每周综述", monthly: "AI 编程 · 每月盘点" };

export interface PeriodCell {
  key: string | null;
  /** Hover text: "9月26日 · 第 158 期". */
  label: string;
  state: "current" | "issue" | "none" | "pad";
}

/** ISO week number of a date (YYYY-MM-DD). */
function isoWeek(day: string): number {
  const d = new Date(`${day}T00:00:00Z`);
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * 86400000);
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.floor((thursday.getTime() - jan1.getTime()) / 86400000 / 7) + 1;
}

/**
 * The dot grid beside the date in the masthead: the days of this issue's month (dailies, Monday first),
 * the weeks of its year (weeklies) or the months of its year (monthlies), each marked as this issue,
 * an issue that exists, or none.
 */
export function periodGrid(kind: ReportKind, key: string, index: ReportNavigationEntry[], locale: SiteLocale = "zh"): { title: string; note: string; columns: number; heads: string[] | null; cells: PeriodCell[] } {
  const t = createT(locale);
  const exists = new Set(index.map((e) => e.key));
  const cell = (k: string, name: string): PeriodCell => {
    const n = issueNumber(index, k);
    return { key: k, label: n ? `${name} · ${issueLabel(n, locale)}` : `${name} · ${t("未出刊")}`, state: k === key ? "current" : exists.has(k) ? "issue" : "none" };
  };
  const count = (cells: PeriodCell[]) => cells.filter((c) => c.state === "issue" || c.state === "current").length;
  const year = key.slice(0, 4);
  if (kind === "daily") {
    const m = Number(key.slice(5, 7));
    const days = new Date(Date.UTC(Number(year), m, 0)).getUTCDate();
    const lead = (new Date(Date.UTC(Number(year), m - 1, 1)).getUTCDay() + 6) % 7;
    const cells: PeriodCell[] = [
      ...Array.from({ length: lead }, (): PeriodCell => ({ key: null, label: "", state: "pad" })),
      ...Array.from({ length: days }, (_, i) => cell(`${key.slice(0, 7)}-${pad(i + 1)}`, dayLabel(`${key.slice(0, 7)}-${pad(i + 1)}`, locale))),
    ];
    return { title: locale === "zh" ? `${cnNumber(m)}月` : reportDate(`${key.slice(0, 7)}-01`, locale, { month: "long" }), note: t("本月 {count} 期", { count: count(cells) }), columns: 7, heads: locale === "zh" ? ["一", "二", "三", "四", "五", "六", "日"] : Array.from({ length: 7 }, (_, i) => reportDate(`2026-09-${pad(21 + i)}`, locale, { weekday: "narrow" })), cells };
  }
  if (kind === "weekly") {
    const weeks = isoWeek(`${year}-12-28`);
    const cells = Array.from({ length: weeks }, (_, i) => {
      const k = `${year}-W${pad(i + 1)}`;
      const [a, b] = isoWeekRange(k);
      return cell(k, locale === "zh" ? `第 ${i + 1} 周（${a.slice(5).replace("-", ".")}—${b.slice(5).replace("-", ".")}）` : `${t("第 {count} 周", { count: i + 1 })} (${dayLabel(a, locale)}—${dayLabel(b, locale)})`);
    });
    return { title: locale === "zh" ? `${year} 年` : reportDate(`${year}-01-01`, locale, { year: "numeric" }), note: t("全年 {count} 期", { count: count(cells) }), columns: 13, heads: null, cells };
  }
  const cells = Array.from({ length: 12 }, (_, i) => cell(`${year}-${pad(i + 1)}`, locale === "zh" ? `${i + 1} 月` : reportDate(`${year}-${pad(i + 1)}-01`, locale, { month: "long" })));
  return { title: locale === "zh" ? `${year} 年` : reportDate(`${year}-01-01`, locale, { year: "numeric" }), note: t("全年 {count} 期", { count: count(cells) }), columns: 6, heads: null, cells };
}
