// 监控保留北京时间，显示格式随当前语言变化。
import { addDays } from "@aihot/contracts/time";
import { createT } from "../../i18n/index";
import type { Locale } from "../../i18n/locale";

export function bjDate(iso: string): string { return iso.slice(0, 10); }
export function bjTime(iso: string, locale: Locale = "zh"): string {
  const time = iso.slice(11, 16);
  if (locale === "zh") return time;
  const number = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false });
  return time.split(":").map((part) => number.format(Number(part))).join(":");
}

export function monthDay(date: string, locale: Locale = "zh"): string {
  return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", timeZone: "Asia/Shanghai", calendar: "gregory" }).format(new Date(`${date}T00:00:00+08:00`));
}

export function dayWord(date: string, today: string, locale: Locale = "zh"): string {
  const t = createT(locale);
  if (date === today) return t("今天");
  if (date === addDays(today, 1)) return t("明天");
  if (date === addDays(today, -1)) return t("昨天");
  return monthDay(date, locale);
}

export function windowText(from: string | null, through: string | null, today: string, locale: Locale = "zh"): string {
  if (!from) return "";
  const a = `${dayWord(bjDate(from), today, locale)} ${bjTime(from, locale)}`;
  if (!through || through === from) return a;
  return bjDate(from) === bjDate(through) ? `${a}–${bjTime(through, locale)}` : `${a}–${dayWord(bjDate(through), today, locale)} ${bjTime(through, locale)}`;
}

export function durationText(ms: number, locale: Locale = "zh"): string {
  const t = createT(locale);
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (!h) return t("{count} 分钟", { count: m });
  return m ? t("{hours} 小时 {minutes} 分", { hours: h, minutes: m }) : t("{count} 小时", { count: h });
}

export function stamp(iso: string | null | undefined, locale: Locale = "zh"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai", calendar: "gregory", hourCycle: "h23" }).format(new Date(iso));
}

export function typeName(type: "direct_reset" | "reset_credit", locale: Locale = "zh"): string {
  return createT(locale)(type === "reset_credit" ? "重置卡发放" : "Codex 额度重置");
}
