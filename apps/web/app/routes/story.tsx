import { Link } from "../lib/locale-links";
import { redirect, useLoaderData, data as routeData } from "react-router";
import { HeatChart } from "../features/story/HeatChart";
import { Badge, SelectedBadge } from "../components/ui/Badge";
import { PillTabs } from "../components/ui/Tabs";
import { Select } from "../components/ui/Controls";
import { IconArrowLeft, IconChevronRight, IconClock, IconDoc, IconUsers } from "../components/icons";
import { type Locale, apiPath, localeFromPath, localePath } from "../i18n/locale";
import { createT, useT, useLocale } from "../i18n/index";
import { SITE } from "@aihot/industry/site";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Route } from "./+types/story";
import type { StoryDetail, StoryReportView } from "@aihot/contracts/site";
import { breadcrumbLd, pageMeta, titled } from "../lib/seo";
import { beijingDate, beijingTime, monthDayTime, relativeTime, shortSourceName, displayDate } from "../lib/format";
export async function loader({ params, request }: Route.LoaderArgs) {
  const res = await fetch(`${process.env.API_BASE_URL || "http://127.0.0.1:3001"}${apiPath(`/api/site/stories/${encodeURIComponent(params.publicId)}`, localeFromPath(request.url))}`, { redirect: "manual", signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]) });
  if (res.status === 308) {
    const target = (await res.json()) as { mergedInto: string };
    throw redirect(localePath(`/story/${target.mergedInto}`, localeFromPath(request.url)), 308);
  }
  if (res.status === 404) throw routeData({ message: "not_found" }, { status: 404 });
  if (!res.ok) throw routeData({ message: "unavailable" }, { status: 503 });
  return { story: (await res.json()) as StoryDetail };
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const locale = localeFromPath(location.pathname);
  const t = createT(locale);
  if (!loaderData) return [{ title: titled(t("事件不存在")) }, { name: "robots", content: "noindex" }];
  const s = loaderData.story;
  return pageMeta({ locale,
    title: s.title,
    description: (s.digest ?? s.summary)?.slice(0, 150) ?? t("{sources} 个报道来源 {reports} 篇报道，完整时间线与最新进展。", { sources: s.sourceCount, reports: s.reportCount }),
    path: `/story/${s.publicId}`,
    image: `/og/stories/${s.publicId}.png`,
    type: "article",
    jsonLd: breadcrumbLd([{ name: SITE.name, path: "/" }, { name: t("热点榜"), path: "/hot" }, { name: s.title, path: `/story/${s.publicId}` }], locale),
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=120" };
}

const STATUS = {
  active: { label: "持续更新", tone: "hot" },
  watching: { label: "观察中", tone: "amber" },
  settled: { label: "历史事件", tone: "neutral" },
} as const;

// Section anchors keep the old page's ids so shared links still land in the right place.
const SECTIONS = { overview: "event-overview", reports: "event-reports", heat: "event-heat" } as const;
type SectionKey = keyof typeof SECTIONS;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** A main-column card: 17px title, 24px padding. */
function Panel({ id, title, sub, right, children, className = "" }: { id?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`card scroll-mt-[64px] p-5 lg:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-[650] leading-[1.5] text-ink">{title}</h2>
          {sub && <p className="mt-0.5 text-[12.5px] text-ink-4">{sub}</p>}
        </div>
        {right && <div className="shrink-0 text-[11.5px] text-ink-4">{right}</div>}
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

/** A rail card: 14px title, 22px padding. */
function RailCard({ title, right, children, className = "" }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 lg:p-[22px] ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-[650] text-ink">{title}</h2>
        {right && <span className="num text-[11.5px] text-ink-4">{right}</span>}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Highlights the section nav entry whose section is under the sticky bar. */
function useActiveSection(keys: SectionKey[]): [SectionKey, (k: SectionKey) => void] {
  const [active, setActive] = useState<SectionKey>("overview");
  useEffect(() => {
    const els = keys.map((k) => document.getElementById(SECTIONS[k])).filter((e): e is HTMLElement => !!e);
    const onScroll = () => {
      let cur: SectionKey = keys[0]!;
      for (const [i, el] of els.entries()) if (el.getBoundingClientRect().top <= 96) cur = keys[i]!;
      // The last section may never reach the bar; at the bottom of the page it is the one being read.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = keys[keys.length - 1]!;
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [keys.join()]);
  const go = (k: SectionKey) => {
    const el = document.getElementById(SECTIONS[k]);
    if (!el) return;
    el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    history.replaceState(history.state, "", `#${SECTIONS[k]}`);
  };
  return [active, go];
}

function dayLabelOf(day: string, locale: Locale): string {
  return displayDate(day, locale, { month: "numeric", day: "numeric" });
}

/** One report on the story timeline: time, source and marks, title, a summary that opens on demand. */
function TimelineRow({ r }: { r: StoryReportView }) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [r.summary, open]);
  return (
    <li className="grid gap-x-3 border-b border-line-soft py-4 last:border-b-0 lg:grid-cols-[48px_minmax(0,1fr)]">
      <time dateTime={r.publishedAt} className="mono text-[12px] leading-[20px] text-ink-4">
        {beijingTime(r.publishedAt, locale)}
      </time>
      <div className="min-w-0">
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] leading-[20px] text-ink-4 lg:mt-0">
          <span className="min-w-0 truncate">{r.source.name.replace(/（RSS）|（网页）|（API）/g, "")}</span>
          {r.selected && <SelectedBadge />}
        </div>
        <Link to={`/items/${r.id}`} prefetch="intent" className="mt-1 block text-[16px] font-[650] leading-[1.6] text-ink transition-colors hover:text-accent lg:text-[15.5px]">
          {r.title}
        </Link>
        {r.summary && (
          <>
            <p ref={ref} className={`mt-1 text-[14px] leading-[1.75] text-ink-3 ${open ? "" : "line-clamp-2"}`}>
              {r.summary}
            </p>
            {(clamped || open) && (
              <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1 text-[12.5px] text-note transition-colors hover:text-accent">
                {open ? t("收起摘要") : t("展开摘要")}
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

type Filter = "all" | "official" | "selected";

export default function StoryPage() {
  const t = useT();
  const locale = useLocale();
  const { story } = useLoaderData<typeof loader>();
  const [filter, setFilter] = useState<Filter>("all");
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const status = STATUS[story.status];
  // A settled story nobody watched (history pages) has no heat to explain or chart.
  const observed = story.status !== "settled" || story.heat.length > 0 || story.whyHot.participants48h > 0 || story.whyHot.rank !== null;
  const sectionKeys: SectionKey[] = observed ? ["overview", "reports", "heat"] : ["overview", "reports"];
  const [activeSection, goSection] = useActiveSection(sectionKeys);
  const counts = {
    all: story.timeline.length,
    official: story.timeline.filter((r) => r.source.firstParty).length,
    selected: story.timeline.filter((r) => r.selected).length,
  };
  const days = useMemo(() => {
    const list = story.timeline.filter((r) => (filter === "official" ? r.source.firstParty : filter === "selected" ? r.selected : true));
    const sorted = [...list].sort((a, b) => (order === "desc" ? Date.parse(b.publishedAt) - Date.parse(a.publishedAt) : Date.parse(a.publishedAt) - Date.parse(b.publishedAt)));
    const out: Array<{ day: string; rows: StoryReportView[] }> = [];
    for (const r of sorted) {
      const d = beijingDate(r.publishedAt);
      const last = out[out.length - 1];
      if (last && last.day === d) last.rows.push(r);
      else out.push({ day: d, rows: [r] });
    }
    return out;
  }, [story.timeline, filter, order]);
  const newest = story.timeline.reduce<StoryReportView | null>((a, b) => (!a || Date.parse(b.publishedAt) > Date.parse(a.publishedAt) ? b : a), null);
  const overview = story.digest
    ? { label: t("AI 综述"), text: story.digest, note: story.digestUpdatedAt ? t("AI 根据报道生成 · {time}更新", { time: relativeTime(story.digestUpdatedAt, Date.now(), locale) }) : t("AI 根据报道生成") }
    : story.summary
      ? { label: t("事实说明"), text: story.summary, note: null }
      : story.excerpt
        ? { label: t("报道摘要"), text: story.excerpt.text, note: t("摘自 {name}", { name: story.excerpt.sourceName }) }
        : null;
  const showOfficial = () => {
    setFilter("official");
    goSection("reports");
  };

  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-10">
      <nav aria-label={t("位置")} className="flex items-center gap-2.5 pb-4 pt-5 text-[12px] text-ink-4 lg:pb-5 lg:pt-4">
        <Link to="/hot" className="inline-flex items-center gap-1.5 transition-colors hover:text-ink">
          <IconArrowLeft size={15}  /> {t("热点榜")}
        </Link>
        <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
        <span>{t("事件详情")}</span>
      </nav>

      <header className="max-w-[960px]">
        <div className="flex items-center gap-2 text-[12px] text-ink-4">
          {t("热点事件")}
          <Badge tone={status.tone}>{t(status.label)}</Badge>
        </div>
        <h1 className="mt-2.5 text-[27px] font-bold leading-[1.5] tracking-[-0.01em] text-ink lg:mt-3 lg:text-[36px] lg:font-[730]">{story.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <IconDoc size={15} className="text-ink-4" />
            {t("{count} 篇报道", { count: story.reportCount })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconUsers size={15} className="text-ink-4" />
            {t("{count} 个报道来源", { count: story.sourceCount })}
          </span>
          {story.latestAt && (
            <span className="inline-flex items-center gap-1.5" suppressHydrationWarning>
              <IconClock size={15} className="text-ink-4" />
              {t("{time}更新", { time: relativeTime(story.latestAt, Date.now(), locale) })}
            </span>
          )}
        </div>
      </header>

      <div className="sticky top-0 z-20 -mx-4 mt-5 bg-bg/90 px-4 py-2 backdrop-blur-md lg:mx-0 lg:px-0">
        <PillTabs
          size="sm"
          layoutId="story-sections"
          label={t("事件内容导航")}
          active={activeSection}
          onSelect={(k) => goSection(k as SectionKey)}
          items={[
            { key: "overview", label: t("事件概览") },
            { key: "reports", label: t("报道时间线"), count: story.reportCount },
            ...(observed ? [{ key: "heat", label: t("热度走势") }] : []),
          ]}
        />
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* On phones the main column dissolves so the rail's cards can sit between its sections. */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <Panel id={SECTIONS.overview} title={t("先了解这件事")} right={overview?.label} className="order-1">
            {overview ? (
              <>
                <p className="whitespace-pre-line text-[15px] leading-[1.85] text-ink-2">{overview.text}</p>
                {overview.note && (
                  <p className="mt-2 text-[12px] text-ink-4" suppressHydrationWarning>
                    {overview.note}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[13.5px] text-ink-4">{t("还没有综述，先看下面的报道时间线。")}</p>
            )}
            {story.latest && (
              <div className="-mx-5 mt-5 border-t border-line-soft px-5 pt-4 lg:-mx-6 lg:px-6">
                <div className="flex items-center gap-2.5 text-[12px]">
                  <span className="font-semibold text-ink">{t("最新进展")}</span>
                  {story.latestAt && <span className="num text-ink-4">{monthDayTime(story.latestAt, locale)}</span>}
                </div>
                {newest ? (
                  <Link to={`/items/${newest.id}`} className="group mt-1.5 inline text-[14px] leading-[1.7] text-ink-2 transition-colors hover:text-accent">
                    {story.latest}
                    <IconChevronRight size={14} className="ms-0.5 inline -translate-y-px text-ink-4 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                  </Link>
                ) : (
                  <p className="mt-1.5 text-[14px] leading-[1.7] text-ink-2">{story.latest}</p>
                )}
              </div>
            )}
          </Panel>

          {story.developments.length > 1 && (
            <Panel title={t("事件进展")} right={t("{count} 个进展", { count: story.developments.length })} className="order-3">
              <ol className="relative space-y-4 ps-5 before:absolute before:bottom-2 before:start-[3px] before:top-2 before:w-px before:bg-line">
                {story.developments.map((d, i) => (
                  <li key={d.factId} className="relative">
                    <span className={`absolute -start-5 top-[7px] size-[7px] rounded-full ring-4 ring-surface ${i === 0 ? "bg-accent" : "bg-line-strong"}`} aria-hidden="true" />
                    <div className="num text-[12px] text-ink-4">
                      {monthDayTime(d.firstReportAt, locale)} · {t("{count} 篇报道", { count: d.reportCount })}
                    </div>
                    <Link to={`/items/${d.representative.id}`} className="mt-0.5 block text-[15px] font-semibold leading-snug text-ink transition-colors hover:text-accent">
                      {d.title}
                    </Link>
                    <div className="mt-0.5 truncate text-[12.5px] text-ink-4">
                      {shortSourceName(d.representative.source.name)}：{d.representative.title}
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          <Panel
            id={SECTIONS.reports}
            title={t("报道时间线")}
            sub={t("沿着报道，了解事件的不同侧面。")}
            className="order-4"
            right={
              <Select value={order} onChange={(e) => setOrder(e.target.value as "desc" | "asc")} aria-label={t("排序")}>
                <option value="desc">{t("最新在前")}</option>
                <option value="asc">{t("最早在前")}</option>
              </Select>
            }
          >
            <PillTabs
              size="xs"
              layoutId="story-report-filter"
              label={t("报道筛选")}
              active={filter}
              onSelect={(k) => setFilter(k as Filter)}
              items={[
                { key: "all", label: t("全部报道"), count: counts.all },
                { key: "official", label: t("官方一手"), count: counts.official },
                { key: "selected", label: t("精选报道"), count: counts.selected },
              ]}
            />
            {days.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-ink-4">{t("这个筛选下没有报道。")}</p>
            ) : (
              days.map(({ day, rows }) => (
                <div key={day}>
                  <div className="pb-0.5 pt-5 text-[14px] font-semibold text-ink">{dayLabelOf(day, locale)}</div>
                  <ol>
                    {rows.map((r) => (
                      <TimelineRow key={r.id} r={r} />
                    ))}
                  </ol>
                </div>
              ))
            )}
            {story.reportCount > story.timeline.length && (
              <p className="pt-3 text-center text-[12px] text-ink-4">
                {t("显示最近 {shown} 篇，共 {total} 篇报道。", { shown: story.timeline.length, total: story.reportCount })}
              </p>
            )}
          </Panel>

          {observed && (
            <Panel id={SECTIONS.heat} title={t("本事件热度走势")} className="order-5">
              <HeatChart points={story.heat} />
            </Panel>
          )}

          {story.related.length > 0 && (
            <Panel title={t("关联事件")} className="order-6">
              <ul className="-my-1 divide-y divide-line-soft">
                {story.related.map((r) => (
                  <li key={r.publicId}>
                    <Link to={`/story/${r.publicId}`} className="group flex items-baseline gap-3 py-3">
                      <span className="shrink-0 text-[12px] text-ink-4">{r.relation === "storyline" ? t("同一故事线") : t("相关事件")}</span>
                      <span className="min-w-0 flex-1 text-[14.5px] font-medium text-ink-2 transition-colors group-hover:text-accent">{r.title}</span>
                      <IconChevronRight size={14} className="shrink-0 self-center text-ink-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="order-2 flex min-w-0 flex-col gap-4 lg:order-none lg:gap-5">
          {observed && (
            <RailCard title={t("为什么热")}>
              <p className="text-[12.5px] leading-[1.75] text-ink-3">
                {t("过去 48 小时，已观察到 {participants} 个独立主体参与讨论或报道，最近 6 小时新增 {new} 个。", { participants: story.whyHot.participants48h, new: story.whyHot.newParticipants6h })}
              </p>
              {!story.whyHot.observationComplete && <p className="mt-2 text-[12px] leading-relaxed text-ink-4">{t("部分信源观测不完整，以上仅为已观察到的参与。")}</p>}
              <p className="mt-2 text-[12px] text-ink-4">
                {t("{count} 篇近期报道", { count: story.whyHot.recentReports24h })}
                {story.whyHot.rank && (
                  <>
                    <span className="mx-1">·</span>
                    <Link to="/hot" className="text-accent hover:underline">
                      {t("热点榜第 {rank} 名", { rank: story.whyHot.rank })}
                    </Link>
                  </>
                )}
              </p>
            </RailCard>
          )}
          {story.officialReports.length > 0 && (
            <RailCard title={t("官方一手")} right={t("{count} 篇报道", { count: counts.official || story.officialReports.length })}>
              <p className="text-[12px] text-ink-4">{t("直接了解当事方的说法")}</p>
              <ul className="mt-1 divide-y divide-line-soft">
                {story.officialReports.slice(0, 5).map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="truncate text-[11.5px] text-ink-4">{r.source.name}</div>
                    <Link to={`/items/${r.id}`} className="group mt-1 block text-[13.5px] font-semibold leading-[1.6] text-ink transition-colors hover:text-accent">
                      {r.title}
                      <IconChevronRight size={13} className="ms-0.5 inline -translate-y-px text-ink-4 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
              {counts.official > 0 && (
                <button type="button" onClick={showOfficial} className="text-[12px] text-ink-4 transition-colors hover:text-accent">
                  {t("在时间线筛选全部官方报道")}
                </button>
              )}
            </RailCard>
          )}
          <RailCard title={t("事件记录")} className="hidden lg:block">
            <dl className="space-y-2 text-[12.5px]">
              {story.firstReportAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-4">{t("最早报道")}</dt>
                  <dd className="num text-ink-2">
                    <time dateTime={story.firstReportAt}>{monthDayTime(story.firstReportAt, locale)}</time>
                  </dd>
                </div>
              )}
              {story.latestAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-4">{t("最近更新")}</dt>
                  <dd className="num text-ink-2">
                    <time dateTime={story.latestAt}>{monthDayTime(story.latestAt, locale)}</time>
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-3 border-t border-line-soft pt-3 text-[12px] leading-relaxed text-ink-4">{t("同一事件的报道集中在这里，新的进展会继续补充。")}</p>
          </RailCard>
        </aside>
      </div>
    </div>
  );
}
