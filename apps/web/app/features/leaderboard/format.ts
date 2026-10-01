import type { LbPrice } from "@aihot/contracts/leaderboard";
import { createT, translateKnown } from "../../i18n/index";
import type { Locale } from "../../i18n/locale";

/** 人民币报价至少保留三个有效数字，小额价格不归零。 */
export function yuan(v: number | null | undefined, locale: Locale = "zh"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = v >= 0.1 ? Number(v.toFixed(2)) : Number(v.toPrecision(3));
  return `¥${n.toLocaleString(locale, { maximumFractionDigits: 6 })}`;
}

export function listPrice(v: number | null, currency: LbPrice["currency"], locale: Locale = "zh"): string {
  if (v == null) return "—";
  return currency === "USD" ? `$${Number(v.toPrecision(6)).toLocaleString(locale, { maximumFractionDigits: 6 })}` : yuan(v, locale);
}

export function shortStamp(iso: string | null | undefined, locale: Locale = "zh"): string {
  if (!iso) return createT(locale)("待核实");
  return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai", calendar: "gregory", hourCycle: "h23" }).format(new Date(iso));
}

export function pct(weight: number, digits = 1, locale: Locale = "zh"): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(weight);
}

export function pctFixed(weight: number, locale: Locale = "zh"): string {
  return new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(weight);
}

export function tokensWan(n: number | null, locale: Locale = "zh"): string {
  if (!n) return "—";
  if (locale === "zh") return createT(locale)("{value}万", { value: Number((n / 10000).toFixed(1)) });
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function boardHref(key: string): string { return key === "overall" ? "/leaderboard" : `/leaderboard/category/${key}`; }
export function modelHref(slug: string, from?: string | null): string { return from && from !== "overall" ? `/leaderboard/${slug}?from=${from}` : `/leaderboard/${slug}`; }

/** 配置名由多个固定短语拼接，逐段翻译并保留系统和产品名称。 */
export function configurationText(value: string | null | undefined, locale: Locale): string {
  if (!value) return "—";
  const t = createT(locale);
  return value.split(" · ").map((part) => translateKnown(locale, part)).join(" · ");
}

/** 共识指数和净支持保留固定小数位，数码随界面语言变化。 */
export function decimal(value: number, digits: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function sourceAttribution(value: string, operator: string, site: string, locale: Locale): string {
  if (value.startsWith(`成绩由 ${operator} 发布，原始分数与 `)) {
    return createT(locale)("成绩由 {operator} 发布，原始分数与 {site} 共识分使用不同尺度，不能直接相加。", { operator, site });
  }
  return translateKnown(locale, value);
}
