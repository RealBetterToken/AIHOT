import { useLocale, translateKnown } from "../../i18n/index.ts";
import { beijingWeekday } from "../../lib/format.ts";

/** Release notes carry a little Markdown: **bold** runs. */
export function Inline({ text }: { text: string }) {
  const locale = useLocale();
  return <>{translateKnown(locale, text).split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i} className="font-semibold text-ink-2">{part}</b> : part))}</>;
}

export function dateHeading(date: string, locale: "zh" | "ru" | "en" = "zh"): { label: string; weekday: string } {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return { label: locale === "zh" ? `${y} 年 ${m} 月 ${d} 日` : new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", calendar: "gregory", timeZone: "Asia/Shanghai" }).format(new Date(`${date}T00:00:00+08:00`)), weekday: beijingWeekday(date, locale).replace("星期", "周") };
}
