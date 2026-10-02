import { useT, useLocale, createT, translateKnown } from "../i18n/index.ts";
import { localeFromPath, localePath, apiPath } from "../i18n/locale.ts";
import { SITE, withSubject } from "@aihot/industry/site";
import { useLoaderData } from "react-router";
import type { Route } from "./+types/report-latest";
import type { ReportDetail, ReportNavigationEntry } from "@aihot/contracts/site";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { beijingDate } from "../lib/format";
import { EmptyState } from "../components/ui/Page";
import { ReportLayout } from "../features/report/ReportLayout";
import { ReportPaper } from "../features/report/ReportPaper";
import { KIND_LABEL, kindFromPath } from "../features/report/format";

export async function loader({ request }: Route.LoaderArgs) {
  const kind = kindFromPath(new URL(request.url).pathname);
  const { index, report } = await loadOr404<{ index: ReportNavigationEntry[]; report: ReportDetail | null }>(`/api/site/reports/${kind}/latest-page`, { request, signal: request.signal });
  return { kind, report, index, today: beijingDate(Date.now()) };
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const locale = localeFromPath(location.pathname);
  const t = createT(locale);
  const kind = loaderData?.kind ?? "daily";
  return pageMeta({ locale,
    title: withSubject(translateKnown(locale, KIND_LABEL[kind])),
    description: kind === "daily" ? t("{arg0} 每天 08:00（北京时间）发布的{arg1}。", { arg0: SITE.name, arg1: withSubject(t("日报")) }) : kind === "weekly" ? t("每周综合回顾。") : t("每月盘点。"),
    path: location.pathname,
    image: `/og/pages/${kind}.png`,
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=300" };
}

export default function ReportLatestPage() {
  const t = useT();
  const locale = useLocale();
  const { kind, report, index, today } = useLoaderData<typeof loader>();
  return (
    <ReportLayout kind={kind} index={index} current={report?.key ?? null} today={today}>
      {report ? <ReportPaper report={report} index={index} /> : <EmptyState title={t("还没有发布{report}", { report: withSubject(translateKnown(locale, KIND_LABEL[kind])) })}>{t("第一期发布后会出现在这里。")}</EmptyState>}
    </ReportLayout>
  );
}
