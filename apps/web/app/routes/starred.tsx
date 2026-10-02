import { Link } from "../lib/locale-links";

import { Presence } from "../components/ui/Presence";
import { IconBookmark, IconDownload, IconClose } from "../components/icons";
import { type Locale, apiPath, localeFromPath, HTML_LANG } from "../i18n/locale";
import { createT, useT, useLocale } from "../i18n/index";
import { SITE } from "@aihot/industry/site";
import { useEffect, useRef, useState } from "react";
import type { SiteItemDetail } from "@aihot/contracts/site";
import { pageMeta } from "../lib/seo";
import { exportBundle, importBundle, removeStar, useStarred, type ImportReport, type LocalStarredItem } from "../lib/local-state";
import { fullDateTime, shortSourceName } from "../lib/format";
/** Shared caches may keep this page for five minutes. */
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

export function meta({ location }: { location: { pathname: string } }) {
  const locale = localeFromPath(location.pathname);
  const t = createT(locale);
  return pageMeta({ locale, title: t("我的收藏"), description: t("保存在这台设备上的 {name} 收藏。", { name: SITE.name }), path: "/starred", noindex: true });
}

function reportText(r: ImportReport, locale: Locale): string {
  const t = createT(locale);
  const parts = [t("新增收藏 {count} 条", { count: r.starredAdded }), t("已读记录 {count} 条", { count: r.readAdded })];
  if (r.starredSkipped || r.readSkipped) parts.push(t("超出上限或格式不对而跳过 {count} 条", { count: r.starredSkipped + r.readSkipped }));
  if (r.themeApplied) parts.push(t("已沿用导入的主题"));
  if (r.readFailed) parts.push(t("已读记录没能保存（浏览器存储已满或不可用）"));
  return parts.join(locale === "zh" ? "，" : "; ");
}


const IMPORT_ERRORS = new Set(["文件过大（上限 2,000,000 字符）", "不是有效的 JSON 文件", "文件格式不对（需要 version: 1）", "浏览器存储已满或不可用，这次没有导入任何内容。"]);
type BookmarkDisplay = Pick<SiteItemDetail, "title" | "summary" | "source" | "publishedAt" | "textLocale">;

/** 收藏快照和实时译文分开显示，旧快照没有语言记录时明确告知读者。 */
export function StarredCard({ saved, display, status }: { saved: LocalStarredItem; display?: BookmarkDisplay; status?: string }) {
  const t = useT();
  const locale = useLocale();
  const unavailable = status === "unavailable";
  const current = unavailable ? undefined : display;
  const title = current?.title ?? saved.title;
  const summary = current ? current.summary : saved.summary;
  const publishedAt = current ? current.publishedAt : saved.publishedAt;
  const textLocale = current ? current.textLocale : saved.textLocale;
  const textLang = textLocale ? HTML_LANG[textLocale] : undefined;
  const awaitingTranslation = !!current && !!textLocale && textLocale !== locale;
  const snapshotNote = !current ? textLocale
    ? t("正在显示收藏时保存的{language}内容。", { language: t({ zh: "中文", en: "英文", ru: "俄文" }[textLocale] as "中文" | "英文" | "俄文") })
    : t("正在显示收藏时保存的内容，未记录当时的语言。") : null;
  return (
    <li className={`relative border-b border-line-soft py-4 lg:card lg:px-[18px] lg:py-[15px] ${unavailable ? "opacity-70" : "lg:card-hover"}`}>
      <div className="flex items-center gap-2 text-[12.5px] text-ink-4">
        <span className="min-w-0 truncate text-ink-3">{shortSourceName(current?.source.name ?? saved.sourceName)}</span>
        {publishedAt && <span className="num shrink-0">· {fullDateTime(publishedAt, locale)}</span>}
        <span className="ms-auto hidden shrink-0 sm:inline">{t("收藏于 {time}", { time: fullDateTime(saved.savedAt, locale) })}</span>
        <button type="button" aria-label={t("取消收藏")} title={t("取消收藏")} onClick={() => removeStar(saved.id)} className="relative z-10 -my-1 ms-auto grid size-7 shrink-0 place-items-center rounded-full text-ink-4 transition-colors hover:bg-bg-sunk hover:text-ink sm:ms-0">
          <IconClose size={14} />
        </button>
      </div>
      <h2 lang={textLang} className="mt-1.5 text-[16px] font-[650] leading-[1.55] text-ink">
        {unavailable ? title : <Link to={`/items/${saved.id}`} className="transition-colors after:absolute after:inset-0 after:content-[''] hover:text-accent">{title}</Link>}
      </h2>
      {summary && <p lang={textLang} className="mt-1.5 line-clamp-2 text-[14px] leading-[1.75] text-ink-3">{summary}</p>}
      {awaitingTranslation && <p className="mt-1.5 text-[11.5px] text-ink-4" title={t("当前语言的标题和摘要正在等待翻译。")}>{t("等待翻译")}</p>}
      {snapshotNote && <p className="mt-1.5 text-[11.5px] text-ink-4">{snapshotNote}</p>}
      {unavailable && <p className="mt-2 text-[12.5px] text-hot">{t("这条内容已不再公开，收藏会保留直到你手动移除。")}</p>}
      {status === "summary-only" && <p className="mt-2 text-[12.5px] text-amber-ink">{t("应来源方要求，这条内容现在只提供摘要。")}</p>}
    </li>
  );
}

export default function StarredPage() {
  const t = useT();
  const locale = useLocale();
  const starred = useStarred();
  const [mounted, setMounted] = useState(false);
  const [availability, setAvailability] = useState<Record<string, string>>({});
  const [localized, setLocalized] = useState<{ locale: Locale; items: Record<string, BookmarkDisplay> }>({ locale, items: {} });
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => setNotice(null), [locale]);

  const starredIds = starred.map((s) => s.id).join(",");
  useEffect(() => {
    if (!mounted || !starredIds) return;
    const controller = new AbortController();
    fetch(apiPath(`/api/site/items/availability?ids=${encodeURIComponent(starredIds)}`, locale), { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => { if (!controller.signal.aborted) setAvailability(data); })
      .catch(() => {});
    return () => controller.abort();
  }, [mounted, starredIds, locale]);

  useEffect(() => {
    if (!mounted || !starredIds) return;
    const controller = new AbortController();
    const ids = starredIds.split(",");
    let next = 0;
    setLocalized({ locale, items: {} });
    // 只更新当前语言的显示内容；浏览器中的收藏身份和备份不变。
    const load = async () => {
      while (next < ids.length && !controller.signal.aborted) {
        const id = ids[next++]!;
        try {
          const response = await fetch(apiPath(`/api/site/items/${encodeURIComponent(id)}`, locale), { signal: controller.signal });
          if (!response.ok) continue;
          const item = await response.json() as SiteItemDetail;
          if (controller.signal.aborted) return;
          setLocalized((current) => current.locale === locale ? { locale, items: { ...current.items, [id]: { title: item.title, summary: item.summary, source: item.source, publishedAt: item.publishedAt, textLocale: item.textLocale } } } : current);
        } catch {
          // 不公开或暂不可用的内容继续显示读者保存的快照。
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(6, ids.length) }, load));
    return () => controller.abort();
  }, [mounted, starredIds, locale]);

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportBundle(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${SITE.mcpPrefix}-local-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const report = importBundle(await file.text());
      setNotice({ kind: report.readFailed ? "error" : "ok", text: t("导入完成：{report}", { report: reportText(report, locale) }) });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error && IMPORT_ERRORS.has(e.message) ? t(e.message as keyof typeof import("../i18n/catalogs/feed").zh) : t("导入失败") });
    }
  };

  const action = "text-[12.5px] text-ink-3 transition-colors hover:text-accent";
  return (
    <div className="pb-12">
      <header className="flex flex-col gap-2 pb-4 pt-5 sm:flex-row sm:items-start sm:justify-between lg:pt-1">
        <div>
          <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">{t("收藏")}</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">{t("本机收藏的 {name} 内容，适合稍后阅读和回看。", { name: SITE.name })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:pt-1.5">
          <button type="button" onClick={() => fileRef.current?.click()} className={action}>
            {t("导入文件")}
          </button>
          {mounted && starred.length > 0 && (
            <button type="button" onClick={doExport} className={`${action} inline-flex items-center gap-1`}>
              <IconDownload size={13} /> {t("导出")}
            </button>
          )}
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => doImport(e.target.files?.[0])} />
        </div>
      </header>
      <p className="rounded-tile border border-line bg-surface px-4 py-2.5 text-[12.5px] text-ink-3">{t("收藏只保存在当前浏览器；清除浏览器数据或换设备后不会同步。")}</p>
      <Presence show={!!notice} enter="anim-notice-in" exit="anim-fade-out" duration={160}>
        <div
          role="status"
          className={`mt-3 flex items-start justify-between gap-3 rounded-tile px-4 py-2.5 text-[13px] ${notice?.kind === "ok" ? "bg-accent-soft text-accent-ink dark:text-accent" : "bg-hot-soft text-hot"}`}
        >
          {notice?.text}
          <button type="button" aria-label={t("关闭")} onClick={() => setNotice(null)} className="shrink-0 opacity-70 hover:opacity-100">
            <IconClose size={14} />
          </button>
        </div>
      </Presence>
      {!mounted ? null : starred.length === 0 ? (
        <div className="mt-3 flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-12 text-center">
          <IconBookmark size={20} className="text-ink-4" />
          <p className="mt-3 text-[13px] text-ink-3">{t("还没有收藏内容。点开任意一条内容，在详情页点击收藏即可添加。")}</p>
          <Link to="/" className="mt-4 text-[12.5px] font-medium text-accent hover:text-accent-ink">
            {t("去看精选 →")}
          </Link>
        </div>
      ) : (
        <ul className="mt-3 lg:space-y-3">
          {starred.map((s) => {
            const status = availability[s.id];
            const unavailable = status === "unavailable";
            const display = !unavailable && localized.locale === locale ? localized.items[s.id] : undefined;
            return <StarredCard key={s.id} saved={s} display={display} status={status} />;
          })}
        </ul>
      )}
    </div>
  );
}
