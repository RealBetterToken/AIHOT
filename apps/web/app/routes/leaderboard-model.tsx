import { Link, LocaleAnchor } from "../lib/locale-links";
import { formatNumber, displayDate } from "../lib/format";
import { useT, useLocale, createT, useKnownT } from "../i18n/index";
import { localeFromPath, localePath } from "../i18n/locale";
import { SITE } from "@aihot/industry/site";
import { useEffect, useState, type ReactNode } from "react";
import { useLoaderData, useSearchParams } from "react-router";
import { Collapse } from "../components/ui/Presence";
import type { Route } from "./+types/leaderboard-model";
import type { LbComparison, LbEvidenceItem, LbModelDetail } from "@aihot/contracts/leaderboard";
import { LEADERBOARD_BOARD_LABELS, LEADERBOARD_PUBLIC_BOARDS } from "@aihot/contracts/taxonomy";
import { loadOr404 } from "../lib/api.server";
import { breadcrumbLd, pageMeta, siteUrl, titled } from "../lib/seo";
import { BrandMark } from "../features/leaderboard/BrandMark";
import { EvidenceBadge } from "../features/leaderboard/Evidence";
import { decimal, configurationText, boardHref, listPrice, pctFixed, shortStamp, tokensWan, yuan } from "../features/leaderboard/format";
import { IconArrowLeft, IconArrowRight, IconArrowUpRight, IconChevronDown, IconExternal } from "../components/icons";

export async function loader({ params, request }: Route.LoaderArgs) {
  return loadOr404<LbModelDetail>(`/api/site/leaderboard/models/${encodeURIComponent(params.slug)}`, { signal: request.signal, request });
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const locale = localeFromPath(location.pathname);
  const t = createT(locale);
  if (!loaderData) return [{ title: titled(t("页面不存在")) }];
  const { model } = loaderData;
  const path = `/leaderboard/${model.slug}`;
  return pageMeta({
    locale,
    title: t("{value} 排名与各榜成绩", { value: model.name }),
    description: t("查看 {value} 的 {value2} 共识分、当前排名，以及它在各家公开评测榜单中的名次和原始分数。", { value: model.name, value2: SITE.name }),
    path,
    image: "/og/pages/leaderboard.png",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: t("{value} 在 {value2} 模型榜的成绩", { value: model.name, value2: SITE.name }),
        description: t("{value} 的共识指数、分类名次与各项公开评测的原始成绩。", { value: model.name }),
        url: `${siteUrl()}${localePath(path, locale)}`,
        creator: { "@type": "Organization", name: SITE.name, url: `${siteUrl()}${localePath("/", locale)}` },
        isAccessibleForFree: true,
      },
      breadcrumbLd([
        { name: t("模型榜"), path: "/leaderboard" },
        { name: model.name, path },
      ], locale),
    ],
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=600" };
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="mono text-[11px] font-semibold tracking-[0.14em] text-accent">{children}</span>;
}

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2 text-[20px] font-bold leading-[1.5] text-ink">{title}</h2>
      <p className="mt-1 text-[13px] text-ink-3">{sub}</p>
    </>
  );
}

function Stat({ label, children, foot }: { label: string; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[11px] text-ink-4">{label}</span>
      <span className="mono mt-2 text-[20px] font-semibold leading-tight text-ink">{children}</span>
      {foot && <span className="mt-1.5 text-[12px] text-ink-3">{foot}</span>}
    </div>
  );
}

function Capability({ d, from }: { d: LbModelDetail; from: string }) {
  const t = useT();
  const knownT = useKnownT();
  const locale = useLocale();
  return (
    <section className="mt-12">
      <SectionHead eyebrow={t("能力概览")} title={t("各有所长，看得更清楚。")} sub={t("每项能力单独计算。没有足够的实测，就留空。")} />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {d.categories.map((c) => (
          <Link
            key={c.key}
            to={boardHref(c.key)}
            className={`card card-hover group flex h-full flex-col rounded-card p-4 lg:p-[22px] ${c.key === from ? "border-accent/45" : ""}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-semibold text-ink transition-colors group-hover:text-accent">{knownT(c.name)}</span>
              {c.rank !== null ? (
                <span className={`mono text-[11.5px] font-semibold ${c.onBoard ? "text-accent" : "text-ink-4"}`}>{c.onBoard ? `#${formatNumber(c.rank!, locale)}` : t("30 名之外")}</span>
              ) : (
                <span className="text-[11px] text-ink-4">{t("证据待补齐")}</span>
              )}
            </span>
            {c.score !== null ? (
              <>
                <span className="mono mt-4 text-[32px] font-medium leading-none tracking-[-0.03em] text-ink">{decimal(c.score, 1, locale)}</span>
                <span className="mt-auto pt-4 text-[12px] text-ink-3">{t("{count} 项评测支持", { count: c.sourceCount })}</span>
              </>
            ) : (
              <>
                <span className="mono mt-4 text-[32px] font-medium leading-none text-ink-4">—</span>
                <span className="mt-auto pt-4 text-[12px] text-ink-4">{t("暂无足够的可比成绩")}</span>
              </>
            )}
          </Link>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-ink-4">{t("不同分类的分数反映各自参照组中的排序支持，不能直接相加或用来比较不同能力的绝对高低。")}</p>
    </section>
  );
}

function Stability({ d }: { d: LbModelDetail }) {
  const t = useT();
  const s = d.overall.stability;
  const rank = d.overall.rank;
  if (!s || rank === null) return null;
  return (
    <section className="mt-12">
      <SectionHead eyebrow={t("理解排名")} title={t("综合名次，有多稳定？")} sub={t("依次移除一项评测或一家机构、调整单项权重与误差处理，观察排名怎样变化。")} />
      <div className="mt-5 grid gap-5 border-b border-line pb-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-10">
        <div>
          <span className="text-[12px] text-ink-4">{t("重新检查资格后的名次")}</span>
          <span className="mt-1 block text-[30px] font-bold leading-tight text-ink">{s.from === s.to ? t("第 {value} 名", { value: s.from }) : t("{value}—{value2} 名", { value: s.from, value2: s.to })}</span>
          {d.overall.confidence && (
            <span className="mt-1 block">
              <EvidenceBadge confidence={d.overall.confidence} stability={null} rank={rank} />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] leading-relaxed text-ink-3">
            {s.unavailable > 0 ? t("{value} 个情景下参评证据不足。", { value: s.unavailable }) : s.incomplete > 0 ? t("{value} 个对照未完成。", { value: s.incomplete }) : t("已完成的对照中均具备参评资格。")}
            {t("保持原候选不变时为 {from}—{to} 名。这个范围不是置信区间，也不包含从未公开的成绩。", { from: s.fixedFrom, to: s.fixedTo })}</p>
        </div>
      </div>
      {d.comparisons.length > 0 && <Comparisons d={d} />}
    </section>
  );
}

/** Net support in shared evaluations, as a signed number: positive favours this model. */
function NetValue({ net }: { net: number }) {
  const t = useT();
  const locale = useLocale();
  const v = Math.round(net * 100) / 100;
  if (v === 0) return <span className="text-[12px] text-ink-4">{t("持平")}</span>;
  return <span className={`mono text-[12.5px] font-semibold ${v > 0 ? "text-accent" : "text-amber-ink"}`}>{v > 0 ? `+${decimal(v, 2, locale)}` : `−${decimal(Math.abs(v), 2, locale)}`}</span>;
}

function Comparisons({ d }: { d: LbModelDetail }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between py-4 text-start">
        <span className="text-[13.5px] font-semibold text-ink">{t("查看与附近模型的共同证据")}</span>
        <span className={`text-[18px] leading-none text-ink-4 transition-transform duration-300 ${open ? "rotate-45" : ""}`}>
          +
        </span>
      </button>
      <Collapse open={open} duration={300}>
        <p className="text-[13px] text-ink-3">{t("净支持只看双方共同参加的评测。全局排序还需处理其他模型间的冲突，因此非相邻名次可能与单独比较不同。")}</p>
        <ul className="-mx-3 divide-y divide-line-soft pb-3 pt-2">
          {d.comparisons.map((c) => <ComparisonRow key={c.model.slug} c={c} name={d.model.name} />)}
        </ul>
      </Collapse>
    </div>
  );
}

function ComparisonRow({ c, name }: { c: LbComparison; name: string }) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const favours = c.net > 1e-9 ? t("共同证据支持本模型") : c.net < -1e-9 ? t("共同证据支持对方") : t("共同证据持平");
  return (
    <li>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 rounded-tile px-3 py-3 text-start transition-colors hover:bg-bg-sunk">
        <BrandMark brand={c.model.brand} size={26} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-ink"><bdi dir="ltr">{c.model.name}</bdi> <span className="num text-[12px] text-ink-4">#{formatNumber(c.rank, locale)}</span></span>
          <span className="text-[12px] text-ink-3">{t("{count} 项共同评测 · {support}", { count: c.sharedCount, support: favours })}</span>
        </span>
        <NetValue net={c.net} />
        <span className={`text-ink-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`}><IconChevronDown size={15} /></span>
      </button>
      <Collapse open={open} duration={300}>
        <div className="px-3 pb-4">
          <p className="text-[12.5px] leading-relaxed text-ink-3">
            {t("双方共同拥有当前榜单 {weight} 的名义票权。下表展示各项评测采用的成绩，已知误差的软化处理会影响净支持，不只数赢了几项。", { weight: pctFixed(c.sharedWeight, locale) })}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-[12.5px]">
              <thead className="text-ink-4">
                <tr className="border-b border-line">
                  <th className="py-2 text-start font-medium">{t("共同评测")}</th>
                  <th className="py-2 text-end font-medium">{name}</th>
                  <th className="py-2 text-end font-medium">{c.model.name}</th>
                  <th className="py-2 text-end font-medium">{t("票权")}</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r) => (
                  <tr key={r.sourceKey} className="border-b border-line last:border-0">
                    <td className="py-2 pe-2"><Link to={`/leaderboard/sources/${r.sourceKey}`} className="text-ink-2 hover:text-accent">{r.sourceName}</Link></td>
                    <td className="num py-2 text-end text-ink">{r.mine}</td>
                    <td className="num py-2 text-end text-ink-2">{r.theirs}</td>
                    <td className="num py-2 text-end text-ink-4">{pctFixed(r.weight, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.hasPage && (
            <Link to={`/leaderboard/${c.model.slug}`} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent">
              {t("查看 {name} 的完整证据", { name: c.model.name })}<IconArrowRight size={13} />
            </Link>
          )}
        </div>
      </Collapse>
    </li>
  );
}

function EvidenceCard({ it }: { it: LbEvidenceItem }) {
  const t = useT();
  const knownT = useKnownT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <li className="card overflow-hidden rounded-tile">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-start transition-colors hover:bg-accent-softer lg:px-5">
        <BrandMark brand={it.brand} size={28} className="max-sm:hidden" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-ink">{it.sourceName}</span>
          <small className="text-[11px] text-ink-4">{knownT(it.usage)}</small>
        </span>
        <span className="text-end">
          <span className="mono block text-[19px] font-medium leading-tight text-ink">{it.display}</span>
          {it.displayNote && <span className="block text-[11px] text-ink-4">{knownT(it.displayNote)}</span>}
        </span>
        <span className={`grid size-6 shrink-0 place-items-center text-[17px] leading-none text-ink-4 transition-transform duration-300 ${open ? "rotate-45" : ""}`}>
          +
        </span>
      </button>
      <Collapse open={open} duration={300}>
        <dl className="grid gap-3 border-t border-line-soft px-4 py-4 text-[12.5px] sm:grid-cols-2 lg:px-5">
          <div>
            <dt className="text-ink-4">{t("原榜型号")}</dt>
            <dd className="mt-0.5 break-all font-mono text-[12px] text-ink-2"><bdi dir="ltr">{it.sourceModelName ?? "—"}</bdi>{it.sourceRank !== null && <span className="ms-1.5 font-sans text-ink-4">{t("原榜第 {value} 名", { value: it.sourceRank })}</span>}</dd>
          </div>
          <div>
            <dt className="text-ink-4">{t("代表配置")}</dt>
            <dd className="mt-0.5 text-ink-2">{configurationText(it.configurationLabel, locale)}</dd>
          </div>
          {it.selectionReason && <p className="text-ink-3 sm:col-span-2">{knownT(it.selectionReason)}</p>}
          <div className="sm:col-span-2">
            <dt className="text-ink-4">{t("本轮采用记录")}</dt>
            <dd className="num mt-0.5 text-ink-2">
              {t("来源数据")}{shortStamp(it.upstreamAt, locale)} {t("· 核验")}{shortStamp(it.verifiedAt, locale)} · {it.measuredAt ? t("实测 {value}", { value: shortStamp(it.measuredAt, locale) }) : t("实测日期未公开")}
              {it.carriedForward && t(" · 沿用最近一次已核验记录")}
            </dd>
          </div>
          {it.components.length > 0 && (
            <div className="sm:col-span-2">
              {it.componentsNote && <p className="text-ink-3">{knownT(it.componentsNote)}</p>}
              <div className="mt-2 flex gap-2">
                {it.components.map((c) => (
                  <span key={knownT(c.label)} className="rounded-control bg-bg-sunk px-3 py-1.5">
                    <span className="block text-[11px] text-ink-4">{knownT(c.label)}</span>
                    <span className="num text-[14px] font-semibold text-ink">{c.display}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-4 sm:col-span-2">
            <Link to={`/leaderboard/sources/${it.sourceKey}`} className="inline-flex items-center gap-1 font-medium text-accent">{t("查看这项评测")}<IconArrowRight size={13} /></Link>
            {it.officialUrl && (
              <LocaleAnchor href={it.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink-3 hover:text-accent">{t("官方来源")}<IconExternal size={12} /></LocaleAnchor>
            )}
          </div>
        </dl>
      </Collapse>
    </li>
  );
}

export default function LeaderboardModelPage() {
  const t = useT();
  const knownT = useKnownT();
  const locale = useLocale();
  const d = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  // The server page is shared by every ?from= (a CDN caches it once), so the board to return
  // to is applied after hydration; server HTML and the first client render both say "总榜".
  const [fromParam, setFromParam] = useState<string | null>(null);
  useEffect(() => setFromParam(params.get("from")), [params]);
  const from = fromParam && (LEADERBOARD_PUBLIC_BOARDS as readonly string[]).includes(fromParam) ? fromParam : "overall";
  const { model, price, overall } = d;
  const withScores = d.categories.filter((c) => c.score !== null).length;
  return (
    <div className="pb-12">
      <Link to={boardHref(from)} className="mt-4 inline-flex items-center gap-1.5 py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:mt-0">
        <IconArrowLeft size={14} /> {t("返回{name}榜", { name: knownT(LEADERBOARD_BOARD_LABELS[from as keyof typeof LEADERBOARD_BOARD_LABELS]) })}</Link>

      <header className="mt-5 flex flex-col gap-5 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4">
          <BrandMark brand={model.brand} size={52} />
          <div className="min-w-0">
            <h1 className="text-[24px] font-semibold leading-[1.3] tracking-[-0.02em] text-ink"><bdi dir="ltr">{model.name}</bdi></h1>
            <p className="num mt-1 text-[12.5px] text-ink-3">
              {model.provider ?? "—"} · {model.releasedAt ? t("{value} 发布", { value: displayDate(model.releasedAt, locale, { year: "numeric", month: "short", day: "numeric" }) }) : t("发布日期待核实")} · {shortStamp(d.run.generatedAt, locale)} {t("更新")}</p>
          </div>
        </div>
        <div className="sm:text-end">
          <span className="block text-[12px] text-ink-4">{t("综合共识指数")}</span>
          <strong className="mono block text-[48px] font-medium leading-[1.25] tracking-[-0.055em] text-accent lg:text-[55px]">{overall.score !== null ? decimal(overall.score, 1, locale) : "—"}</strong>
          <b className={`text-[12px] font-medium ${overall.onBoard ? "text-ink-3" : "text-ink-4"}`}>
            {overall.rank === null ? t("未进入综合榜") : overall.onBoard ? t("综合榜第 {value} 名", { value: overall.rank }) : t("综合榜前 30 名之外")}
          </b>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-x-4 gap-y-6 border-y border-line py-6 lg:grid-cols-4" aria-label={t("模型概览")}>
        <Stat label={t("分类成绩")}>
          {formatNumber(withScores, locale)}
          <small className="ms-1 font-sans text-[11px] font-normal text-ink-4">{t("/ 4 项分类")}</small>
        </Stat>
        <Stat label={t("已有成绩")}>
          {formatNumber(d.metricCount, locale)}
          <small className="ms-1 font-sans text-[11px] font-normal text-ink-4">{t("项评测", { count: d.metricCount })}</small>
        </Stat>
        <Stat label={t("上下文窗口")}>
          {tokensWan(model.contextWindowTokens, locale)}
          <small className="ms-1 font-sans text-[11px] font-normal text-ink-4">Token</small>
        </Stat>
        <Stat
          label={t("API 输入 / 输出 · 每百万 Token")}
          foot={
            price ? (
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                {price.cachedCny !== null && <span className="num">{t("缓存")}{yuan(price.cachedCny, locale)}</span>}
                {price.currency === "USD" && (
                  <span className="num text-ink-4">
                    {t("原价")}{listPrice(price.input, "USD", locale)} / {listPrice(price.output, "USD", locale)}
                  </span>
                )}
                {price.officialUrl && (
                  <LocaleAnchor href={price.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:text-accent-ink">
                    {t("厂商官方价格")}<IconArrowUpRight size={12} />
                  </LocaleAnchor>
                )}
              </span>
            ) : (
              t("尚未核到厂商官网价格")
            )
          }
        >
          {price ? `${yuan(price.inputCny, locale)} / ${yuan(price.outputCny, locale)}` : <span className="font-sans text-[15px] font-normal text-ink-4">{t("待核验")}</span>}
        </Stat>
      </section>

      <Capability d={d} from={from} />
      <Stability d={d} />

      <section className="mt-12">
        <SectionHead eyebrow={t("分数背后")} title={t("每一项成绩，都有来处。")} sub={t("下面是该模型的公开汇总成绩。展开可查看运行配置与采用方式。")} />
        {d.evidence.map((g) => (
          <div key={g.key} className="mt-6">
            <h3 className="flex items-baseline gap-2 text-[14px] font-semibold text-ink">
              {knownT(g.name)}
              <span className="num text-[11.5px] font-normal text-ink-4">{t("{count} 项", { count: g.items.length })}</span>
            </h3>
            <ul className="mt-2.5 space-y-2">
              {g.items.map((it) => (
                <EvidenceCard key={it.sourceKey} it={it} />
              ))}
            </ul>
          </div>
        ))}
        {d.unmeasured.length > 0 && (
          <div className="mt-6">
            <h3 className="text-[14px] font-semibold text-ink">{t("没有测到的计分评测")}</h3>
            <p className="mt-1 text-[12.5px] text-ink-3">{t("这些评测没有公开该模型的成绩，缺测不记零分。")}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {d.unmeasured.map((u) => (
                <Link key={u.key} to={`/leaderboard/sources/${u.key}`} className="chip">
                  {knownT(u.name)}
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="text-[15px] font-semibold text-ink">{t("还有一些未知")}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{t("缺失的评测不会记成零分。模型的名次会随新证据变化，分数相近时不宜过度解读细小差距。")}</p>
        <Link to="/leaderboard/rules" className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-ink">
          {t("了解计算方法 →")}</Link>
      </section>
    </div>
  );
}
