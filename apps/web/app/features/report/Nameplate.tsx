import { useLocale, useT, translateKnown } from "../../i18n/index.ts";
import { SITE, withSubject } from "@aihot/industry/site";
// The report nameplates (industry/brand/nameplates/, made by scripts/nameplates.ts from the pack's
// subject word). Each logotype is cached on its own; the two paths take the theme's ink and accent.
import daily from "@aihot/industry/brand/nameplates/daily.svg?url&no-inline";
import weekly from "@aihot/industry/brand/nameplates/weekly.svg?url&no-inline";
import monthly from "@aihot/industry/brand/nameplates/monthly.svg?url&no-inline";
import archive from "@aihot/industry/brand/nameplates/archive.svg?url&no-inline";
import viewBoxes from "@aihot/industry/brand/nameplates/index.json";

const NAMEPLATES = {
  daily: { url: daily, viewBox: viewBoxes.daily },
  weekly: { url: weekly, viewBox: viewBoxes.weekly },
  monthly: { url: monthly, viewBox: viewBoxes.monthly },
  archive: { url: archive, viewBox: viewBoxes.archive },
} as const;

export function Nameplate({ which, className = "" }: { which: keyof typeof NAMEPLATES; className?: string }) {
  const locale = useLocale();
  const t = useT();
  const n = NAMEPLATES[which];
  if (locale !== "zh") return <span aria-hidden="true" className={`report-nameplate text-[26px] @[520px]:text-[34px] @[880px]:text-[44px] @[1040px]:text-[50px] font-black leading-[1.05] tracking-[-0.03em] text-ink ${className}`}>{which === "archive" ? t("日报合订本") : withSubject(translateKnown(locale, { daily: "日报", weekly: "周报", monthly: "月报" }[which]))}</span>;
  return (
    <svg viewBox={n.viewBox} className={className} aria-hidden="true" focusable="false">
      <use href={`${n.url}#accent`} className="fill-accent" />
      <use href={`${n.url}#ink`} className="fill-ink" />
    </svg>
  );
}
