import { beijingDate, beijingTime as rawTime, beijingWeekday } from "@aihot/contracts/time";
import { createT } from "../i18n/translator.ts";
import { INTL_LOCALE, type Locale } from "../i18n/locale.ts";

export { beijingDate, beijingWeekday };

export function formatNumber(value: number, locale: Locale = "zh", options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], options).format(value);
}

export function displayDate(date: string | Date | number, locale: Locale = "zh", options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" }): string {
  const instant = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00+08:00` : date;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: "Asia/Shanghai", calendar: "gregory", ...options }).format(new Date(instant));
}

export function beijingTime(instant: Date | string | number, locale: Locale = "zh"): string {
  return locale === "zh" ? rawTime(instant) : displayDate(instant, locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function dayLabel(date: string, today: string, locale: Locale = "zh"): string {
  const t = createT(locale);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const base = locale === "zh" ? `${m}月${d}日` : displayDate(date, locale);
  if (date === today) return `${t("今天")} · ${base}`;
  const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
  if (diff === 1) return `${t("昨天")} · ${base}`;
  if (y !== Number(today.slice(0, 4))) return locale === "zh" ? `${y}年${base}` : displayDate(date, locale, { year: "numeric", month: "long", day: "numeric" });
  return base;
}

export function relativeTime(iso: string, now = Date.now(), locale: Locale = "zh"): string {
  const t = Date.parse(iso);
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return createT(locale)("刚刚");
  const relative = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: "always" });
  const m = Math.round(s / 60);
  if (m < 60) return relative.format(-m, "minute");
  const h = Math.round(m / 60);
  if (h < 24) return relative.format(-h, "hour");
  const d = Math.round(h / 24);
  if (d < 30) return relative.format(-d, "day");
  return displayDate(iso, locale, { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function fullDateTime(iso: string, locale: Locale = "zh"): string {
  return locale === "zh" ? `${beijingDate(iso)} ${rawTime(iso)}` : displayDate(iso, locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** "9月24日 10:51" (Beijing), for lists that span days. */
export function monthDayTime(iso: string, locale: Locale = "zh"): string {
  if (locale !== "zh") return displayDate(iso, locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const [, m, d] = beijingDate(iso).split("-").map(Number) as [number, number, number];
  return `${m}月${d}日 ${beijingTime(iso)}`;
}

/** "X：Ethan Mollick (@emollick)" → "Ethan Mollick"; other sources keep their name. */
export function shortSourceName(name: string): string {
  const m = /^X[:：]\s*(.+?)\s*\(@[^)]+\)\s*$/.exec(name);
  if (m) return m[1]!.replace(/（.*?）/g, "").trim();
  return name.replace(/（RSS）|（网页）|（API）/g, "").trim();
}

export function sourceInitial(name: string): string {
  const s = shortSourceName(name).replace(/^[^\p{L}\p{N}]+/u, "");
  return (s[0] ?? "A").toUpperCase();
}
