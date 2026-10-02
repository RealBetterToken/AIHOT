import { useT } from "../../i18n/index.ts";
import { SITE } from "@aihot/industry/site";
import type { ReportKind } from "@aihot/contracts/site";

/** 报头使用实时行业名称与语言文案，避免预生成字形残留旧行业标题。 */
export function Nameplate({ which, className = "" }: { which: ReportKind | "archive"; className?: string }) {
  const t = useT();
  const label = which === "archive" ? t("日报合订本") : t({ daily: "日报", weekly: "周报", monthly: "月报" }[which] as "日报" | "周报" | "月报");
  return (
    <span aria-hidden="true" className={`report-nameplate block font-black leading-[1.1] tracking-[-0.03em] text-ink ${className}`}>
      {which !== "archive" && <span className="block text-[22px] text-accent @[520px]:text-[28px] @[880px]:text-[36px] @[1040px]:text-[42px]">{SITE.subject}</span>}
      <span className="block text-[26px] @[520px]:text-[34px] @[880px]:text-[44px] @[1040px]:text-[50px]">{label}</span>
    </span>
  );
}
