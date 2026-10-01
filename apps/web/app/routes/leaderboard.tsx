import { Link } from "../lib/locale-links";
import { useT, useLocale, createT, useKnownT, translateKnown } from "../i18n/index";
import { localeFromPath, localePath } from "../i18n/locale";
import { SITE } from "@aihot/industry/site";
import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/leaderboard";
import type { LbBoardResponse } from "@aihot/contracts/leaderboard";
import { loadOr404 } from "../lib/api.server";
import { breadcrumbLd, pageMeta, siteUrl, titled } from "../lib/seo";
import { BoardTable } from "../features/leaderboard/BoardTable";
import { Podium } from "../features/leaderboard/Podium";
import { IconInfo } from "../components/icons";
import { modelHref, shortStamp } from "../features/leaderboard/format";
import { useEntrance } from "../lib/hydration";

const CATEGORY_KEYS = new Set(["coding", "reasoning", "knowledge", "professional"]);

export async function loader({ params, request }: Route.LoaderArgs) {
  const key = params.key ?? "overall";
  if (params.key !== undefined && !CATEGORY_KEYS.has(params.key)) throw data({ message: "not_found" }, { status: 404 });
  return loadOr404<LbBoardResponse>(`/api/site/leaderboard/boards/${key}`, { signal: request.signal, request });
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const locale = localeFromPath(location.pathname);
  const t = createT(locale);
  const knownT = (value: string) => translateKnown(locale, value);
  if (!loaderData) return [{ title: titled(t("页面不存在")) }];
  const { board, entries } = loaderData;
  const path = board.key === "overall" ? "/leaderboard" : `/leaderboard/category/${board.key}`;
  return pageMeta({
    locale,
    title: t("{name}模型排行榜 · {site}", { name: knownT(board.name), site: SITE.name }),
    rawTitle: true,
    description: board.key === "overall" ? t("汇总多家公开模型评测榜单，给出 {site} 共识分、评测完整度、上线日期与 API 参考价格。", { site: SITE.name }) : knownT(board.description),
    path,
    image: "/og/pages/leaderboard.png",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: board.key === "overall" ? t("{value} 大模型综合榜", { value: SITE.name }) : t("{value} {value2}模型榜", { value: SITE.name, value2: knownT(board.name) }),
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        numberOfItems: entries.length,
        itemListElement: entries.map((e) => ({ "@type": "ListItem", position: e.rank, name: e.model.name, url: `${siteUrl()}${localePath(modelHref(e.model.slug), locale)}` })),
      },
      breadcrumbLd(
        board.key === "overall"
          ? [{ name: t("模型榜"), path: "/leaderboard" }]
          : [{ name: t("模型榜"), path: "/leaderboard" }, { name: t("{value}榜", { value: knownT(board.name) }), path }],
        locale),
    ],
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=600" };
}

export default function LeaderboardPage() {
  const t = useT();
  const knownT = useKnownT();
  const locale = useLocale();
  const { board, entries, run } = useLoaderData<typeof loader>();
  const entrance = useEntrance();
  return (
    <div key={board.key} className={entrance ? "animate-fade-up" : undefined}>
      <div className="mt-3 flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-[13.5px] text-ink-2">{knownT(board.description)}</p>
        <p className="num text-[12px] text-ink-4">
          {t("{count} 项评测", { count: board.sourceCount })}<span className="mx-2">·</span>
          {t("{count} 家机构", { count: board.operatorCount })}<span className="mx-2">·</span>
          {shortStamp(run.generatedAt, locale)} {t("更新")}</p>
      </div>

      <Podium entries={entries} board={board.key} />

      <section className="card mt-3 overflow-hidden" aria-labelledby="lb-board-title">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-[22px]">
          <h2 id="lb-board-title" className="text-[16px] font-bold text-ink">
            {board.key === "overall" ? t("综合榜") : t("{value}榜", { value: knownT(board.name) })}
            <span className="mono ms-2 text-[11px] font-normal tracking-wide text-ink-4">{t("前 {count} 名", { count: entries.length })}</span>
          </h2>
          <span className="text-end text-[12px] text-ink-4">{t("按多项公开评测的共同证据排名")}</span>
        </div>
        <BoardTable entries={entries} board={board.key} />
        <div className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-ink-4 lg:px-[22px]">
          <p>{t("每个榜单最多展示 30 个模型")}</p>
          <p>{t("共识指数不是正确率；同分仍按共同证据确定的名次展示。")}</p>
        </div>
      </section>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            <IconInfo size={16} className="text-accent" />
            {t("如何看这张榜")}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{knownT(board.howToRead)}{t("价格不参与排名，缺测不记零分，指数不是正确率。")}</p>
          <Link to="/leaderboard/rules" className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:text-accent-ink">
            {t("了解计算方法 →")}</Link>
        </section>
        <section className="card p-5">
          <h2 className="text-[14px] font-semibold text-ink">{t("关于价格")}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
            {t("API 价格来自厂商官网，按每百万 Token 展示。")}{run.fx ? t("美元报价按 {value} 汇率折算成人民币。", { value: run.fx.asOf }) : ""}{t("缓存价格指命中后的输入价格，缓存写入、存储及订阅费用另计。")}</p>
        </section>
      </div>
    </div>
  );
}
