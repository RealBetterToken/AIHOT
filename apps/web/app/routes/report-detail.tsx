import { useT, useLocale, createT, translateKnown } from "../i18n/index.ts";
import { localeFromPath, localePath, apiPath } from "../i18n/locale.ts";
import { SITE, withSubject } from "@aihot/industry/site";
import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/report-detail";
import type { ReportDetail, ReportNavigationEntry, ReportKind } from "@aihot/contracts/site";
import { apiGet, loadOr404 } from "../lib/api.server";
import { pageMeta, titled } from "../lib/seo";
import { beijingDate } from "../lib/format";
import { ReportLayout } from "../features/report/ReportLayout";
import { ReportPaper } from "../features/report/ReportPaper";
import { KIND_LABEL, kindFromPath } from "../features/report/format";

const PATTERN: Record<ReportKind, RegExp> = {
  daily: /^\d{4}-\d{2}-\d{2}$/,
  weekly: /^\d{4}-W\d{2}$/,
  monthly: /^\d{4}-\d{2}$/,
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const kind = kindFromPath(new URL(request.url).pathname);
  const key = params.key ?? "";
  if (!PATTERN[kind].test(key)) throw data({ message: "not_found" }, { status: 404 });
  const [report, { items: index }] = await Promise.all([
    loadOr404<ReportDetail>(`/api/site/reports/${kind}/${key}`, { request, signal: request.signal }),
    apiGet<{ items: ReportNavigationEntry[] }>(`/api/site/reports/${kind}/navigation/${key}`, { request, signal: request.signal }),
  ]);
  return { report, index, today: beijingDate(Date.now()) };
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const locale = localeFromPath(location.pathname);
  const t = createT(locale);
  if (!loaderData) return [{ title: titled(t("报告不存在")) }, { name: "robots", content: "noindex" }];
  const r = loaderData.report;
  return pageMeta({ locale,
    title: r.kind === "daily" ? t("{arg0} {arg1}", { arg0: withSubject(t("日报")), arg1: r.key }) : r.title.replace(`${SITE.name} `, `${SITE.subject} `),
    description: r.lead?.leadParagraph ?? r.overview?.slice(0, 150) ?? t("{arg0} {arg1} 的{arg2}。", { arg0: SITE.name, arg1: r.key, arg2: withSubject(translateKnown(locale, KIND_LABEL[r.kind])) }),
    path: `/${r.kind}/${r.key}`,
    image: `/og/reports/${r.kind}/${r.key}.png`,
    type: "article",
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=600" };
}

export default function ReportDetailPage() {
  const t = useT();
  const locale = useLocale();
  const { report, index, today } = useLoaderData<typeof loader>();
  return (
    <ReportLayout kind={report.kind} index={index} current={report.key} today={today}>
      <ReportPaper report={report} index={index} />
    </ReportLayout>
  );
}
