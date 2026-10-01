import { Link } from "../../lib/locale-links";
import { displayDate } from "../../lib/format";
import { useT, useLocale, useKnownT } from "../../i18n/index";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { LbBoardEntry } from "@aihot/contracts/leaderboard";
import { LB_CONFIDENCE_LABELS } from "@aihot/contracts/leaderboard";
import { BrandMark } from "./BrandMark";
import { EvidenceBadge } from "./Evidence";
import { decimal, modelHref, yuan } from "./format";

type SortKey = "rank" | "released" | "coverage" | "cached" | "input" | "output";

function sortValue(e: LbBoardEntry, key: SortKey): number | null {
  switch (key) {
    case "rank":
      return e.rank;
    case "released":
      return e.model.releasedAt ? -Date.parse(e.model.releasedAt) : null;
    case "coverage":
      return -(e.coverage * 1000 + e.sourceCount);
    case "cached":
      return e.price?.cachedCny ?? null;
    case "input":
      return e.price?.inputCny ?? null;
    case "output":
      return e.price?.outputCny ?? null;
  }
}

function sorted(entries: LbBoardEntry[], key: SortKey, dir: 1 | -1) {
  return [...entries].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null && vb === null) return a.rank - b.rank;
    if (va === null) return 1; // unknown prices and dates always sink
    if (vb === null) return -1;
    return (va - vb) * dir || a.rank - b.rank;
  });
}

/** The top three sit on a small tinted plate; the rest are plain numbers. */
function Rank({ rank }: { rank: number }) {
  const locale = useLocale();
  const n = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false }).format(rank);
  if (rank <= 3) {
    return <span className="mono inline-flex h-7 w-[26px] items-center justify-center rounded-full bg-accent/[0.06] text-[13px] font-bold text-accent">{n}</span>;
  }
  return <span className="mono text-[13px] text-ink-4">{n}</span>;
}

function SortHeader({ k, children, sort, dir, onSort, align = "left", className = "" }: { k: SortKey; children: ReactNode; sort: SortKey; dir: 1 | -1; onSort: (k: SortKey) => void; align?: "left" | "right"; className?: string }) {
  const active = sort === k;
  return (
    <th scope="col" aria-sort={active ? (dir === 1 ? "ascending" : "descending") : "none"} className={`px-3 py-2.5 font-medium ${align === "right" ? "text-end" : "text-start"} ${className}`}>
      <button type="button" onClick={() => onSort(k)} className={`group/sort inline-flex items-start gap-1 text-start transition-colors hover:text-ink ${active ? "text-accent" : ""}`}>
        <span>{children}</span>
        <span className={`mt-[3px] text-[9px] transition ${active ? "opacity-100" : "opacity-0 group-hover/sort:opacity-40"} ${active && dir === -1 ? "rotate-180" : ""}`} aria-hidden="true">
          ▲
        </span>
      </button>
    </th>
  );
}

export function BoardTable({ entries, board }: { entries: LbBoardEntry[]; board: string }) {
  const t = useT();
  const knownT = useKnownT();
  const locale = useLocale();
  const unit = <span className="block text-[10.5px] font-normal text-ink-4">{t("人民币 / 百万 Token")}</span>;
  const [sort, setSort] = useState<SortKey>("rank");
  const [dir, setDir] = useState<1 | -1>(1);
  const rows = useMemo(() => sorted(entries, sort, dir), [entries, sort, dir]);
  // Re-sorting moves each row from where it was to its new place (FLIP), as rows keep their key.
  const body = useRef<HTMLTableSectionElement>(null);
  const tops = useRef(new Map<string, number>());
  const order = rows.map((e) => e.model.slug).join(",");
  useLayoutEffect(() => {
    if (!body.current) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    for (const row of Array.from(body.current.rows)) {
      const key = row.dataset.slug ?? "";
      const prev = tops.current.get(key);
      next.set(key, row.offsetTop);
      if (prev !== undefined && prev !== row.offsetTop && !reduce && row.animate) {
        row.animate([{ transform: `translateY(${prev - row.offsetTop}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(0.25, 1, 0.5, 1)" });
      }
    }
    tops.current = next;
  }, [order]);
  const onSort = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSort(k);
      setDir(1);
    }
  };
  // No official price yet reads "待核验"; a price without that tier (no cache pricing) reads "—".
  const price = (e: LbBoardEntry, v: number | null | undefined) =>
    !e.price ? <span className="text-[12px] text-ink-4">{t("待核验")}</span> : v == null ? <span className="text-ink-4">—</span> : yuan(v, locale);

  return (
    <table className="w-full border-collapse text-[14px]">
      <caption className="sr-only">{t("可按列重排的前 {count} 名模型", { count: entries.length })}</caption>
      <thead className="bg-[rgba(28,39,51,0.04)] text-[12px] text-ink-4 dark:bg-white/[0.03]">
        <tr className="border-y border-line">
          <th scope="col" className="w-[44px] py-2.5 ps-4 pe-1 text-start font-medium lg:w-[68px] lg:ps-[22px] lg:pe-3">
            <button type="button" onClick={() => onSort("rank")} className={`transition-colors hover:text-ink ${sort === "rank" ? "text-accent" : ""}`}>
              {t("排名")}</button>
          </th>
          <th scope="col" className="px-2 py-2.5 text-start font-medium lg:px-3">{t("模型")}</th>
          <SortHeader k="released" sort={sort} dir={dir} onSort={onSort} className="hidden lg:table-cell">{t("上线日期")}</SortHeader>
          <SortHeader k="coverage" sort={sort} dir={dir} onSort={onSort} className="hidden lg:table-cell">{t("评测证据")}</SortHeader>
          <SortHeader k="cached" sort={sort} dir={dir} onSort={onSort} className="hidden lg:table-cell">{t("缓存价格")}{unit}</SortHeader>
          <SortHeader k="input" sort={sort} dir={dir} onSort={onSort} className="hidden lg:table-cell">{t("输入价格")}{unit}</SortHeader>
          <SortHeader k="output" sort={sort} dir={dir} onSort={onSort} className="hidden lg:table-cell">{t("输出价格")}{unit}</SortHeader>
          <th scope="col" className="py-2.5 ps-2 pe-4 text-end font-medium lg:ps-3 lg:pe-[22px]">
            <button
              type="button"
              onClick={() => onSort("rank")}
              title={t("共识指数把支持原排名的证据差异换算为 0—100，不是正确率。")}
              className={`inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-ink ${sort === "rank" ? "text-accent" : ""}`}
            >
              {t("共识指数")}<span className="inline-flex size-3.5 items-center justify-center rounded-full border border-current text-[9px] leading-none">i</span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody ref={body}>
        {rows.map((e) => (
          <tr key={e.model.slug} data-slug={e.model.slug} className="group relative border-b border-line last:border-b-0 transition-colors hover:bg-accent-softer">
            <td className="py-3 ps-4 pe-1 align-middle lg:ps-[22px] lg:pe-3">
              <Rank rank={e.rank} />
            </td>
            <td className="px-2 py-3 lg:px-3">
              <Link to={modelHref(e.model.slug, board)} prefetch="intent" className="block after:absolute after:inset-0 after:content-['']">
                <span className="flex items-center gap-3">
                  <BrandMark brand={e.model.brand} size={32} />
                  <span className="min-w-0">
                    <strong className="block text-[15px] font-[650] leading-[21px] text-ink transition-colors group-hover:text-accent"><bdi dir="ltr">{e.model.name}</bdi></strong>
                    <small className="block text-[12px] leading-[18px] text-ink-4">{e.model.provider ?? "—"}</small>
                  </span>
                </span>
                {/* Phones: the desktop columns as three short lines under the whole name block. */}
                <span className="mt-1.5 block text-[12px] leading-[1.7] text-ink-3 lg:hidden">
                  <span className="block">
                    {t("上线")}<span className="num">{e.model.releasedAt ? displayDate(e.model.releasedAt, locale, { year: "numeric", month: "short", day: "numeric" }) : "—"}</span> · {knownT(LB_CONFIDENCE_LABELS[e.confidence])}
                  </span>
                  <span className="block">
                    {t("缓存输入")}<span className="num">{e.price ? yuan(e.price.cachedCny, locale) : "—"}</span>
                  </span>
                  <span className="block">
                    {t("输入")}<span className="num">{e.price ? yuan(e.price.inputCny, locale) : "—"}</span> {t("· 输出")}<span className="num">{e.price ? yuan(e.price.outputCny, locale) : "—"}</span>
                  </span>
                </span>
              </Link>
            </td>
            <td className="mono hidden px-3 py-3 text-[12px] text-ink-3 lg:table-cell">
              <time dateTime={e.model.releasedAt ?? undefined}>{e.model.releasedAt ? displayDate(e.model.releasedAt, locale, { year: "numeric", month: "short", day: "numeric" }) : "—"}</time>
            </td>
            <td className="relative z-10 hidden px-3 py-3 lg:table-cell">
              <span className="num block text-[13px] text-ink-2">{t("{count} 项评测", { count: e.sourceCount })}</span>
              <EvidenceBadge confidence={e.confidence} stability={e.stability} rank={e.rank} />
            </td>
            <td className="mono hidden px-3 py-3 text-[14.5px] font-medium text-ink lg:table-cell">{price(e, e.price?.cachedCny)}</td>
            <td className="mono hidden px-3 py-3 text-[14.5px] font-medium text-ink lg:table-cell">{price(e, e.price?.inputCny)}</td>
            <td className="mono hidden px-3 py-3 text-[14.5px] font-medium text-ink lg:table-cell">{price(e, e.price?.outputCny)}</td>
            <td className="py-3 ps-2 pe-4 text-end align-middle lg:ps-3 lg:pe-[22px]">
              <strong className={`mono inline-block text-[20px] font-semibold leading-7 tracking-[-0.02em] ${e.rank <= 3 ? "text-accent" : "text-ink"}`} aria-label={t("{value} 共识指数 {value2}", { value: e.model.name, value2: decimal(e.score, 1, locale) })}>
                {decimal(e.score, 1, locale)}
              </strong>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
