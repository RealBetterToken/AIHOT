import { beijingTime } from "../lib/format";
import { Link, LocaleAnchor } from "../lib/locale-links";
import { useT, useLocale, createT, translateKnown } from "../i18n/index.ts";
import { localeFromPath, localePath, apiPath } from "../i18n/locale.ts";
import { SITE, withSubject } from "@aihot/industry/site";
import { Fragment, useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import { apiGet } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { setChangelogSeen } from "../lib/local-state";
import { AsideCard, ReadingLayout } from "../components/ui/Page";
import { IconChevronRight } from "../components/icons";
import { Inline, dateHeading } from "../features/changelog/text";
import type { ChangelogData, ChangelogRelease as Release } from "@aihot/contracts/changelog";

/** Shared caches may keep this page for five minutes. */
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

export async function loader({ request }: { request: Request }) {
  return apiGet<ChangelogData>("/api/site/changelog", { request, signal: request.signal });
}

export function meta({ location }: { location: { pathname: string } }) {
  const locale = localeFromPath(location.pathname);
  const t = createT(locale);
  return pageMeta({ locale, title: t("更新日志"), description: t("{arg0} 的功能更新、优化、公告与下线记录。", { arg0: SITE.name }), path: "/changelog", image: "/og/pages/changelog.png" });
}

const KIND_DOT: Record<Release["kind"], string> = {
  更新: "bg-accent",
  优化: "bg-ok",
  公告: "bg-amber",
  下线: "bg-ink-4",
};

const KINDS = Object.keys(KIND_DOT) as Release["kind"][];

function ReleaseBody({ lines }: { lines: string[] }) {
  const t = useT();
  const locale = useLocale();
  const blocks: Array<string | string[]> = [];
  for (const line of lines) {
    const last = blocks.at(-1);
    if (!line.startsWith("- ")) blocks.push(line);
    else if (Array.isArray(last)) last.push(line.slice(2));
    else blocks.push([line.slice(2)]);
  }
  const text = "mt-2 max-w-[52em] text-[13.5px] leading-[1.8] text-ink-3";
  return blocks.map((b, i) =>
    Array.isArray(b) ? (
      <ul key={i} className={`${text} space-y-1`}>
        {b.map((li, j) => (
          <li key={j} className="flex gap-2">
            <span className="mt-[11px] size-1 shrink-0 rounded-full bg-ink-4" aria-hidden="true" />
            <span>
              <Inline text={li} />
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <p key={i} className={text}>
        <Inline text={b} />
      </p>
    ),
  );
}

export default function ChangelogPage() {
  const t = useT();
  const locale = useLocale();
  const data = useLoaderData<typeof loader>();
  useEffect(() => setChangelogSeen(data.latestVersion), [data.latestVersion]);
  const [kind, setKind] = useState<Release["kind"] | null>(null);
  const groups = new Map<string, Release[]>();
  for (const r of data.releases) if (!kind || r.kind === kind) groups.set(r.date, [...(groups.get(r.date) ?? []), r]);
  // Month → the newest date shown in it (the jump target) and how many entries it holds.
  const months = new Map<string, { first: string; count: number }>();
  for (const [date, releases] of groups) {
    const month = months.get(date.slice(0, 7)) ?? { first: date, count: 0 };
    month.count += releases.length;
    months.set(date.slice(0, 7), month);
  }

  const aside = (
    <>
      <AsideCard title={t("按类型看")} className="hidden lg:block">
        <div className="-mx-2 -mb-1">
          {[null, ...KINDS].map((k) => (
            <button
              key={k ?? "all"}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`flex w-full items-center gap-2.5 rounded-control px-2 py-2 text-start text-[13.5px] transition-colors ${kind === k ? "bg-bg-sunk font-medium text-ink dark:bg-bg-muted/60" : "text-ink-2 hover:bg-bg-sunk hover:text-ink"}`}
            >
              <span className={`size-1.5 rounded-full ${k ? KIND_DOT[k] : "bg-ink-2"}`} aria-hidden="true" />
              <span className="flex-1">{k ? translateKnown(locale, k) : t("全部")}</span>
              <span className="num text-[12px] text-ink-4">{new Intl.NumberFormat(locale).format(k ? data.releases.filter((r) => r.kind === k).length : data.releases.length)}</span>
            </button>
          ))}
        </div>
      </AsideCard>
      <AsideCard title={t("按月份")} className="hidden lg:block">
        <nav aria-label={t("按月份")} className="-mx-2 -mb-1">
          {[...months.entries()].map(([month, m]) => {
            const [y, mo] = month.split("-").map(Number) as [number, number];
            return (
              <LocaleAnchor key={month} href={`#d-${m.first}`} className="flex items-center justify-between rounded-control px-2 py-2 text-[13.5px] text-ink-2 transition-colors hover:bg-bg-sunk hover:text-ink">
                {new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", calendar: "gregory", timeZone: "Asia/Shanghai" }).format(new Date(`${month}-01T00:00:00+08:00`))}<span className="num text-[12px] text-ink-4">{t("{count} 条", { count: m.count })}</span>
              </LocaleAnchor>
            );
          })}
        </nav>
      </AsideCard>
      <AsideCard title={t("有想法或遇到问题")}>
        <p className="text-[13px] leading-[1.75] text-ink-3">{t("想要的功能、用着不顺的地方，都可以在反馈页告诉我们。")}</p>
        <Link to="/feedback" prefetch="intent" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">{t("去反馈")}<IconChevronRight size={14} className="rtl:-scale-x-100" />
        </Link>
      </AsideCard>
    </>
  );

  return (
    <ReadingLayout aside={aside}>
      <header className="pb-6">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">{t("更新日志")}</h1>
        <p className="mt-1.5 text-[13px] text-ink-3">{t("新功能、调整、下线，都写在这里。")}</p>
      </header>
      <div className="space-y-4">
        {[...groups.entries()].map(([date, releases]) => {
          const h = dateHeading(date, locale);
          const plain = releases;
          return (
            <Fragment key={date}>
              {plain.length > 0 && (
                <section id={`d-${date}`} className="card scroll-mt-6 px-5 lg:px-7">
                  <h2 className="flex items-baseline gap-3 border-b border-line-soft py-4">
                    <time dateTime={date} className="text-[18px] font-bold text-ink">
                      {h.label}
                    </time>
                    <span className="text-[12px] text-ink-4">{h.weekday}</span>
                  </h2>
                  <ol>
                    {plain.map((r) => (
                      <li key={`${r.date}-${beijingTime(`${r.date}T${r.time}:00+08:00`, locale)}-${r.title}`} className="grid gap-x-8 gap-y-2 border-b border-line-soft py-5 last:border-b-0 sm:grid-cols-[88px_minmax(0,1fr)]">
                        <div className="flex items-center gap-3 sm:block">
                          <span className="mono block text-[12.5px] text-ink-3">{beijingTime(`${r.date}T${r.time}:00+08:00`, locale)}</span>
                          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-4 sm:mt-1.5">
                            <span className={`size-1.5 rounded-full ${KIND_DOT[r.kind]}`} aria-hidden="true" />
                            {translateKnown(locale, r.kind)}
                          </span>
                        </div>
                        <article className="min-w-0 sm:border-s sm:border-line sm:ps-8">
                          <h3 className="text-[15px] font-bold leading-snug text-ink">{translateKnown(locale, r.translations?.[locale]?.title ?? r.title)}</h3>
                          <ReleaseBody lines={r.translations?.[locale]?.body ?? r.body} />
                        </article>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </Fragment>
          );
        })}
      </div>
    </ReadingLayout>
  );
}
