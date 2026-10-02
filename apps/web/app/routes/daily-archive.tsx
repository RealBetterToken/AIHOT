import { Link } from "../lib/locale-links";
import { useT, useLocale, createT } from "../i18n/index.ts";
import { localeFromPath, localePath, apiPath } from "../i18n/locale.ts";
import { SITE, withSubject } from "@aihot/industry/site";
import { useLoaderData } from "react-router";
import type { ReportIndexEntry } from "@aihot/contracts/site";
import { apiGet } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { beijingDate, beijingWeekday } from "../lib/format";
import { ReportLayout } from "../features/report/ReportLayout";
import { archiveGroups, reportNumber, reportDate } from "../features/report/format";
import { Rows, SectionPage } from "../features/report/ReportPaper";
import { Nameplate } from "../features/report/Nameplate";

export async function loader({ request }: { request: Request }) {
  const { items: index } = await apiGet<{ items: ReportIndexEntry[] }>("/api/site/reports/daily", { request, signal: request.signal });
  return { index, today: beijingDate(Date.now()) };
}

export function meta({ location }: { location: { pathname: string } }) {
  const locale = localeFromPath(location.pathname);
  const t = createT(locale);
  return pageMeta({ locale, title: t("{arg0} · 历史存档", { arg0: withSubject(t("日报")) }), description: t("{arg0} 历史日报，按日期归档。", { arg0: SITE.name }), path: "/daily/archive", image: "/og/pages/daily.png" });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=300" };
}

export default function DailyArchive() {
  const t = useT();
  const locale = useLocale();
  const { index, today } = useLoaderData<typeof loader>();
  const months = archiveGroups("daily", index, locale);
  return (
    <ReportLayout kind="daily" index={index} current={null} today={today}>
      <div className="@container">
        <header className="pt-5 lg:pt-0">
          <div className="flex items-center justify-between gap-4 text-[12px] text-ink-4">
            <span>{SITE.name} · {withSubject(t("日报"))}</span>
            <span>{t("共 {count} 期", { count: index.length })}</span>
          </div>
          <div className="py-6 @[880px]:py-8">
            <h1 id="report-start">
              <span className="sr-only">{t("日报合订本")}</span>
              <Nameplate which="archive" />
            </h1>
          </div>
          <div aria-hidden="true" className="border-t border-line-strong" />
        </header>
        {months.map((m) => (
          <SectionPage key={m.id} id={`m-${m.id}`} label={m.label}>
            <Rows items={m.entries}>
              {(e, cell) => (
                <Link key={e.key} to={`/daily/${e.key}`} prefetch="intent" className={`group flex gap-4 py-4 ${cell}`}>
                  <span className="flex w-9 shrink-0 flex-col items-center">
                    <span className="num text-[24px] font-black leading-none tracking-[-0.03em] text-ink transition-colors group-hover:text-accent">{locale === "zh" ? e.key.slice(8, 10) : reportNumber(Number(e.key.slice(8, 10)), locale)}</span>
                    <span className="mt-1.5 text-[10.5px] leading-none text-ink-4">{locale === "zh" ? beijingWeekday(e.key).replace("星期", "周") : reportDate(e.key, locale, { weekday: "short" })}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold leading-[1.55] text-ink transition-colors group-hover:text-accent">{e.title ?? t("{arg0} {arg1}", { arg0: withSubject(t("日报")), arg1: e.key })}</span>
                    <span className="mt-1 block text-[12px] text-ink-4">
                      {t("共 {count} 件大事", { count: e.count ?? 0 })}</span>
                  </span>
                </Link>
              )}
            </Rows>
          </SectionPage>
        ))}
      </div>
    </ReportLayout>
  );
}
