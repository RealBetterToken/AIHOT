import { Link, LocaleAnchor } from "../lib/locale-links";
import { formatNumber } from "../lib/format";
import { useT, useLocale, createT, useKnownT } from "../i18n/index";
import { localeFromPath } from "../i18n/locale";
import { SITE } from "@aihot/industry/site";
import { useLoaderData } from "react-router";
import type { LbSourcesResponse } from "@aihot/contracts/leaderboard";
import { loadOr404 } from "../lib/api.server";
import { breadcrumbLd, pageMeta } from "../lib/seo";
import { BrandMark } from "../features/leaderboard/BrandMark";
import { StatusChip } from "../features/leaderboard/StatusChip";
import { pct } from "../features/leaderboard/format";
import { IconArrowLeft, IconArrowUpRight } from "../components/icons";

export async function loader({ request }: { request: Request }) {
  return loadOr404<LbSourcesResponse>("/api/site/leaderboard/sources", { signal: request.signal, request });
}

export function meta({ location }: { location: { pathname: string } }) {
  const locale = localeFromPath(location.pathname);
  const t = createT(locale);
  return pageMeta({
    locale,
    title: t("评测来源"),
    description: t("了解 {value} 采用和观察中的评测来源、方法与数据进展。", { value: SITE.name }),
    path: "/leaderboard/sources",
    image: "/og/pages/leaderboard.png",
    jsonLd: breadcrumbLd([
      { name: t("模型榜"), path: "/leaderboard" },
      { name: t("评测来源"), path: "/leaderboard/sources" },
    ], locale),
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900" };
}

export default function LeaderboardSourcesPage() {
  const t = useT();
  const knownT = useKnownT();
  const locale = useLocale();
  const { groups, rankedCount, totalCount } = useLoaderData<typeof loader>();
  return (
    <div className="pb-12">
      <Link to="/leaderboard" className="mt-4 inline-flex items-center gap-1.5 py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:mt-0">
        <IconArrowLeft size={14} /> {t("返回模型榜")}</Link>
      <header className="pb-2 pt-3">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">{t("评测来源")}</h1>
        <p className="mt-1.5 text-[13px] text-ink-3">{t("每个来源测什么、怎样更新、是否进入排名，都可以在这里找到。")}</p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-baseline gap-6">
            <span className="flex items-baseline gap-1.5">
              <span className="mono text-[24px] font-semibold text-ink">{formatNumber(rankedCount, locale)}</span>
              <span className="text-[12px] text-ink-4">{t("本轮参与排名")}</span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="mono text-[24px] font-semibold text-ink">{formatNumber(totalCount, locale)}</span>
              <span className="text-[12px] text-ink-4">{t("已审查来源与专项")}</span>
            </span>
          </div>
          <Link to="/leaderboard/rules" className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-accent">
            {t("排名怎么算")}<IconArrowUpRight size={14} />
          </Link>
        </div>
      </header>

      <nav aria-label={t("来源分组")} className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
        {groups.map((g) => (
          <LocaleAnchor
            key={g.key}
            href={`#${g.key}`}
            className="inline-flex h-8 shrink-0 items-center rounded-full border border-line bg-surface px-3 text-[12.5px] text-ink-3 transition-colors hover:border-line-strong hover:text-accent"
          >
            {knownT(g.name)}
          </LocaleAnchor>
        ))}
      </nav>

      {groups.map((g) => (
        <section key={g.key} id={g.key} className="scroll-mt-6 pt-10">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[17px] font-bold text-ink">{knownT(g.name)}</h2>
            <span className="mono text-[12px] text-ink-4">{formatNumber(g.sources.length, locale)}</span>
            <p className="text-[12.5px] text-ink-4">{knownT(g.blurb)}</p>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.sources.map((s) => (
              <li key={s.key}>
                <Link to={`/leaderboard/sources/${s.key}`} className="card card-hover group flex h-full flex-col p-5">
                  <span className="flex items-start justify-between gap-3">
                    <BrandMark brand={s.brand} size={30} />
                    <StatusChip status={s.status} />
                  </span>
                  <span className="mt-3.5 text-[15px] font-bold leading-snug text-ink transition-colors group-hover:text-accent">{knownT(s.name)}</span>
                  <span className="mt-1.5 line-clamp-3 flex-1 text-[12.5px] leading-[1.7] text-ink-3">{knownT(s.description)}</span>
                  <span className="mt-4 flex items-center justify-between gap-3 text-[11.5px] text-ink-4">
                    <span className="min-w-0 truncate">{s.operator}</span>
                    <span className="flex shrink-0 items-center gap-2.5">
                      {s.budget !== null && <span className="num">{t("证据预算")}{pct(s.budget, 1, locale)}</span>}
                      <IconArrowUpRight size={13} className="transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-10 border-t border-line pt-5 text-[12px] leading-relaxed text-ink-4">
        {t("“观察中”表示仍在核对数据、运行条件或使用边界，不参与综合榜和分类榜。同一评测的重复抓取和展示切片不会增加票权；不同评测之间的题库重叠仍需持续核对。")}</p>
    </div>
  );
}
