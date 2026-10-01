import { Link, LocaleAnchor } from "../../lib/locale-links";
import { useT, useLocale, createT, translateKnown } from "../../i18n/index.ts";
import { localeFromPath, localePath, apiPath } from "../../i18n/locale.ts";
// Moving between reports: the archive column on desktop, a tab row and recent-issue chips on phones.
import { useEffect, useState } from "react";

import type { ReportNavigationEntry, ReportKind } from "@aihot/contracts/site";
import { PillTabs } from "../../components/ui/Tabs";
import { IconChevronRight } from "../../components/icons";
import { KINDS, KIND_LABEL, KIND_PATH, archiveGroups, archiveMark, chipLabel, reportPath, reportNumber } from "./format";

/** 日报 / 周报 / 月报 as the site's pill switch, spread across the column. */
function KindSwitch({ kind, layoutId = "report-kind" }: { kind: ReportKind; layoutId?: string }) {
  const t = useT();
  const locale = useLocale();
  const labels = { daily: t("日刊短标签"), weekly: t("周刊短标签"), monthly: t("月刊短标签") };
  return <PillTabs fill layoutId={layoutId} label={t("切换日报、周报、月报")} active={kind} items={KINDS.map((k) => ({ key: k, label: labels[k], to: KIND_PATH[k] }))} />;
}

/** Desktop archive column: every issue of this kind, grouped, the current one highlighted. */
export function ReportArchive({ kind, index, current }: { kind: ReportKind; index: ReportNavigationEntry[]; current: string | null }) {
  const t = useT();
  const locale = useLocale();
  const groups = archiveGroups(kind, index, locale);
  const openId = groups.find((g) => g.entries.some((e) => e.key === current))?.id ?? groups[0]?.id;
  return (
    <aside className="sticky top-0 hidden h-dvh w-[280px] shrink-0 flex-col border-e border-line bg-[color-mix(in_srgb,var(--sidebar)_50%,var(--surface))] ps-5 pe-3 lg:flex dark:bg-[color-mix(in_srgb,var(--sidebar)_50%,var(--bg))]">
      <div className="pb-4 pt-8">
        <KindSwitch kind={kind} />
      </div>
      <div className="border-b border-line-strong pb-2 ps-1 text-[11.5px] font-semibold tracking-[0.3em] text-ink">{t("往期")}</div>
      <nav aria-label={t("{arg0}历史", { arg0: translateKnown(locale, KIND_LABEL[kind]) })} className="scrollbar-thin -me-3 flex-1 overflow-y-auto pb-6 pe-3">
        {groups.map((g) => (
          <ArchiveGroup key={g.id} g={g} kind={kind} current={current} initiallyOpen={g.id === openId} />
        ))}
      </nav>
      {kind === "daily" && (
        <Link to="/daily/archive" className="flex h-12 shrink-0 items-center justify-between border-t border-line ps-1 pe-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:text-accent">{t("日报合订本")}<IconChevronRight size={14} className="rtl:-scale-x-100" />
        </Link>
      )}
    </aside>
  );
}

/** Closed daily months keep only keys; titles load when opened, and the full archive is SSR. */
function ArchiveGroup({ g, kind, current, initiallyOpen }: {
  g: ReturnType<typeof archiveGroups>[number]; kind: ReportKind; current: string | null; initiallyOpen: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => setOpen(initiallyOpen), [initiallyOpen]);
  const [loaded, setLoaded] = useState<ReportNavigationEntry[] | null>(null);
  useEffect(() => {
    if (!open || loaded || kind !== "daily" || !g.entries.some((e) => e.title === undefined)) return;
    const controller = new AbortController();
    fetch(apiPath(`/api/site/reports/daily/months/${g.id}`, locale), { signal: controller.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { items: ReportNavigationEntry[] } | null) => { if (data && !controller.signal.aborted) setLoaded(data.items); })
      .catch(() => {});
    return () => controller.abort();
  }, [open, kind, g.id, loaded, locale]);
  const entries = loaded ?? g.entries;
  const mark = (key: string) => archiveMark(kind, key, locale);
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="disclosure group/month border-b border-line">
      <summary className="flex h-11 items-center gap-1.5 ps-1 pe-1.5 text-[13px] text-ink transition-colors hover:text-accent">
        <IconChevronRight size={14} className="rtl:-scale-x-100 text-ink-4 transition-transform duration-200 group-open/month:rotate-90 rtl:group-open/month:-rotate-90" />
        <span className="flex-1 font-semibold">{g.label}</span>
        <span className="num text-[11.5px] text-ink-4">{reportNumber(g.entries.length, locale)}</span>
      </summary>
      {(kind !== "daily" || open) && <ul className="space-y-0.5 pb-3">
        {entries.map((e) => {
          const on = e.key === current;
          return (
            <li key={e.key}>
              <Link
                to={reportPath(kind, e.key)}
                aria-current={on ? "page" : undefined}
                title={e.title ?? undefined}
                prefetch="intent"
                className={`group flex gap-3 rounded-tile py-2.5 ps-2.5 pe-2 transition-colors ${on ? "bg-accent-soft" : "hover:bg-bg-sunk"}`}
              >
                <span className="flex w-8 shrink-0 flex-col items-center">
                  <span className={`num text-[19px] font-black leading-none tracking-[-0.03em] ${on ? "text-accent" : "text-ink"}`}>{mark(e.key).big}</span>
                  {mark(e.key).small && <span className="mt-1 whitespace-nowrap text-[10px] leading-none text-ink-4">{mark(e.key).small}</span>}
                </span>
                <span className={`line-clamp-2 min-w-0 text-[12.5px] leading-[18px] transition-colors ${on ? "font-semibold text-ink" : "text-ink-2 group-hover:text-ink"}`}>{e.title ?? `${translateKnown(locale, KIND_LABEL[kind])} ${e.key}`}</span>
              </Link>
            </li>
          );
        })}
      </ul>}
      {kind === "daily" && !open && <noscript><LocaleAnchor href="/daily/archive">{t("查看完整日报归档")}</LocaleAnchor></noscript>}
    </details>
  );
}

/** Phone header: kind tabs, then the three latest issues and a way further back. */
export function ReportPhoneNav({ kind, index, current, today }: { kind: ReportKind; index: ReportNavigationEntry[]; current: string | null; today: string }) {
  const t = useT();
  const locale = useLocale();
  const recent = index.slice(0, 3);
  const earlier = kind === "daily" ? "/daily/archive" : "#report-history";
  const chip = "inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-[13px] transition-colors";
  return (
    <div className="pt-3 lg:hidden">
      <KindSwitch kind={kind} layoutId="report-kind-phone" />
      {recent.length > 0 && (
        <div className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {recent.map((e) => {
            const on = e.key === current;
            return (
              <Link key={e.key} to={reportPath(kind, e.key)} aria-current={on ? "page" : undefined} className={`${chip} ${on ? "border-ink bg-ink font-semibold text-bg" : "border-line-strong bg-surface text-ink-2 active:bg-bg-sunk"}`}>
                {chipLabel(kind, e.key, index, today, locale)}
              </Link>
            );
          })}
          {index.length > 3 && (
            <Link to={earlier} className={`${chip} border-line-strong bg-surface text-ink-2 active:bg-bg-sunk`}>{t("更早")}</Link>
          )}
        </div>
      )}
    </div>
  );
}
