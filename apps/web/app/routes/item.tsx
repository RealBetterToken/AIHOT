import { Link, LocaleAnchor } from "../lib/locale-links";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useLoaderData, useNavigate, useLocation } from "react-router";
import { SelectedBadge } from "../components/ui/Badge";
import { ScoreLabel } from "../components/ui/Score";
import { ReadingLanguages } from "../features/item/ReadingLanguages";
import { ArticleLayout, RailSection } from "../components/ui/Page";
import { Menu, MenuItem } from "../components/ui/Menu";
import { StarButton } from "../features/feed/parts";
import { GroupSources } from "../features/feed/ReadingGroup";
import { StoryFollowups } from "../features/item/StoryFollowups";
import { MediaGallery } from "../features/item/MediaGallery";
import { QuotedPost } from "../features/item/QuotedPost";
import { IconArrowLeft, IconCopy, IconDownload, IconExternal, IconImage, IconMenu, IconShare } from "../components/icons";
import { apiPath, localeFromPath, localePath, type Locale } from "../i18n/locale";
import { createT, useT, useLocale } from "../i18n/index";
import { SITE } from "@aihot/industry/site";
import { tagLabel } from "@aihot/industry/taxonomy";
import type { Route } from "./+types/item";
import type { SiteItemDetail } from "@aihot/contracts/site";
import { loadOr404 } from "../lib/api.server";
import { breadcrumbLd, pageMeta, siteUrl, titled } from "../lib/seo";
import { fullDateTime, relativeTime } from "../lib/format";
import { markRead } from "../lib/local-state";
const PosterSheet = lazy(() => import("../features/item/PosterSheet"));

export async function loader({ params, request }: Route.LoaderArgs) {
  const item = await loadOr404<SiteItemDetail>(`/api/site/items/${encodeURIComponent(params.id)}`, { request, signal: request.signal });
  return { item };
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const locale = localeFromPath(location.pathname);
  const t = createT(locale);
  if (!loaderData) return [{ title: titled(t("内容不存在")) }, { name: "robots", content: "noindex" }];
  const { item } = loaderData;
  return pageMeta({ locale,
    title: item.title,
    description: item.summary ?? undefined,
    path: `/items/${item.id}`,
    image: `/og/items/${item.id}.png`,
    type: "article",
    noindex: !item.indexable,
    jsonLd: breadcrumbLd([
      { name: SITE.name, path: "/" },
      { name: item.selected ? t("精选") : t("全部动态"), path: item.selected ? "/" : "/all" },
      { name: item.title, path: `/items/${item.id}` },
    ], locale),
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=120" };
}

/** A 2px accent line across the top that follows long bodies. */
function ReadingProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (ref.current) ref.current.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0})`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return <div ref={ref} aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left rtl:origin-right scale-x-0 bg-accent transition-transform duration-150 ease-out" />;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function shareOrCopy(item: Pick<SiteItemDetail, "id" | "title">, locale: Locale): Promise<"shared" | "copied" | null> {
  const url = `${siteUrl()}${localePath(`/items/${item.id}`, locale)}`;
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title: item.title, url });
      return "shared";
    }
    await navigator.clipboard.writeText(`${item.title}\n${url}`);
    return "copied";
  } catch {
    return null;
  }
}

export default function ItemPage() {
  const t = useT();
  const locale = useLocale();
  const { item } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const originalView = useLocation().pathname.endsWith("/original");
  const hasTranslation = item.hasTranslation;
  const lang = item.bodyLanguage;
  const [posterRequested, setPosterRequested] = useState(false);
  const [posterOpen, setPosterOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => markRead(item.id), [item.id]);
  useEffect(() => setToast(null), [locale]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);
  const closePoster = useCallback(() => setPosterOpen(false), []);
  const openPoster = () => {
    setPosterRequested(true);
    setPosterOpen(true);
  };
  const share = async () => {
    const r = await shareOrCopy(item, locale);
    if (r === "copied") setToast(t("链接已复制"));
  };

  const bodyHtml = lang !== "original" ? (item.body?.localized ?? item.body?.original) : (item.body?.original ?? item.body?.localized);
  const bodyLabel = !item.body ? null : lang !== "original" && hasTranslation ? t("正文 · AI 翻译") : lang === "original" && hasTranslation ? t("正文 · 原文") : t("正文");
  const isX = item.channel === "x" && !!item.x;
  const publishedIso = item.publishedAt ?? item.discoveredAt;
  const summaryOnly = item.readingMode === "summary-only";
  const showOutline = item.outline.length >= 3;
  const originalLabel = isX ? t("在 X 查看原推") : t("打开原文");

  const related = item.relatedStories.filter((s) => s.publicId !== item.story?.publicId);

  const back = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(localePath(item.selected ? "/" : "/all", locale));
  };
  const backButton = (
    <button type="button" onClick={back} className="-ms-1.5 inline-flex h-8 items-center gap-1.5 rounded-full px-1.5 text-[14px] text-ink-2 transition-colors hover:text-ink lg:text-[13px] lg:text-ink-3">
      <IconArrowLeft size={16}  /> {t("返回")}
    </button>
  );
  const moreMenu = (
    <Menu label={t("更多操作")} trigger={<IconMenu size={17} />}>
      {(close) => (
        <>
          <MenuItem icon={<IconShare size={15} />} onSelect={() => { close(); void share(); }}>{t("分享链接")}</MenuItem>
          <MenuItem icon={<IconImage size={15} />} onSelect={() => { close(); openPoster(); }}>{t("生成分享海报")}</MenuItem>
          <MenuItem
            icon={<IconCopy size={15} />}
            onSelect={async () => {
              close();
              try {
                await navigator.clipboard.writeText(`${siteUrl()}${localePath(`/items/${item.id}`, locale)}`);
                setToast(t("链接已复制"));
              } catch {
                // clipboard unavailable
              }
            }}
          >
            {t("复制链接")}
          </MenuItem>
          {item.markdownAvailable && (
            <MenuItem icon={<IconDownload size={15} />} href={apiPath(`/items/${item.id}/markdown`, locale)} download onSelect={close}>
              {t("导出 Markdown")}
            </MenuItem>
          )}
        </>
      )}
    </Menu>
  );
  // Desktop actions head the right rail, one row as tall as 返回 at the head of the left one.
  const actions = (
    <div className="flex items-center gap-1">
      <LocaleAnchor
        href={item.links.original}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-ink-4 hover:text-ink"
      >
        {originalLabel} <IconExternal size={13} />
      </LocaleAnchor>
      <StarButton item={item} size={32} />
      {moreMenu}
    </div>
  );
  const verdict = (item.selected || item.score !== null) && (
    <div className="flex flex-wrap items-center gap-2">
      {item.selected && <SelectedBadge />}
      <ScoreLabel score={item.score} />
    </div>
  );

  // Rails: the piece's facts on the left (wide screens), the editor's notes on the right, the outline
  // under the facts (or under the notes when only the right rail shows).
  const facts = (
    <RailSection title={t("来源")}>
      <div className="text-[14px] font-semibold leading-snug text-ink">{isX ? item.x!.authorName : item.source.name}</div>
      <div className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
        <bdi dir={isX || !item.author ? "ltr" : "auto"}>{isX ? `@${item.x!.handle} · X` : item.author ?? hostOf(item.links.original)}</bdi>
      </div>
      <div className="mt-3 text-[12px] text-ink-4">{t("发布时间")}</div>
      <time dateTime={publishedIso} className="mono mt-0.5 block text-[12.5px] text-ink-2">
        {fullDateTime(publishedIso, locale)}
      </time>
      <div className="mt-0.5 text-[12px] text-ink-4" suppressHydrationWarning>
        {relativeTime(publishedIso, Date.now(), locale)}
      </div>
    </RailSection>
  );
  const outline = showOutline && (
    <RailSection title={t("本文目录")}>
      <nav aria-label={t("本文目录")}>
        <ol className="-ms-px space-y-0.5 border-s border-line">
          {item.outline.map((o) => (
            <li key={o.id}>
              <LocaleAnchor href={`#${o.id}`} className={`-ms-px block border-s border-transparent py-1 text-[12.5px] leading-snug text-ink-3 transition-colors hover:border-accent hover:text-ink ${o.level > 2 ? "ps-5" : "ps-3"}`}>
                {o.text}
              </LocaleAnchor>
            </li>
          ))}
        </ol>
      </nav>
    </RailSection>
  );
  const notes = (
    <>
      {item.reason && !summaryOnly ? (
        <RailSection title={t("推荐理由")}>
          {verdict && <div className="mb-3">{verdict}</div>}
          <p lang={item.textLocale ?? "zh"} className="text-[13.5px] leading-[1.8] text-ink-2">{item.reason}</p>
        </RailSection>
      ) : (
        verdict && <RailSection title={t("AI 评分")}>{verdict}</RailSection>
      )}
      {item.tags.length > 0 && (
        <RailSection title={t("标签")}>
          <div className="flex flex-wrap gap-1.5">
            {item.tags.slice(0, 8).map((t) => (
              <Link key={t} to={`/all?tag=${encodeURIComponent(t)}`} className="chip">
                #{tagLabel(t, locale)}
              </Link>
            ))}
          </div>
        </RailSection>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-8">
      {item.body && <ReadingProgress />}

      {/* Phones: a sticky bar with back, 收藏, the original, share and more. Desktop puts these in the rails. */}
      <div className="sticky top-0 z-30 -mx-4 flex h-12 items-center gap-1.5 border-b border-line-soft bg-bg/95 px-4 backdrop-blur lg:hidden">
        {backButton}
        <span className="flex-1" />
        <StarButton item={item} size={32} />
        <LocaleAnchor href={item.links.original} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 px-1.5 text-[14px] text-ink-2">
          <IconExternal size={15} /> {t("原文")}
        </LocaleAnchor>
        <button type="button" aria-label={t("分享")} onClick={share} className="inline-flex size-8 items-center justify-center rounded-full text-ink-3 hover:text-ink">
          <IconShare size={17} />
        </button>
        {moreMenu}
      </div>

      {/* The text on the page in one column; back and the facts in the left rail, actions and notes in the right. */}
      <ArticleLayout
        left={
          <>
            {backButton}
            {facts}
            {outline}
          </>
        }
        right={
          <>
            {actions}
            {notes}
            <div className="space-y-8 2xl:hidden">{outline}</div>
          </>
        }
      >
        <div className="hidden lg:block 2xl:hidden">{backButton}</div>
        <article className="pb-6 pt-6 lg:pt-2 2xl:pt-1">
          <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-3 2xl:hidden ${isX ? "" : "mb-3"}`}>
            <span className="font-semibold text-ink-2">{isX ? item.x!.authorName : item.source.name}</span>
            {isX && <span>· <bdi dir="ltr">@{item.x!.handle} · X</bdi></span>}
            {item.author && !isX && <span>· {item.author}</span>}
            <span>·</span>
            <time dateTime={publishedIso} className="mono">{fullDateTime(publishedIso, locale)}</time>
            <span suppressHydrationWarning>· {relativeTime(publishedIso, Date.now(), locale)}</span>
            {item.selected && (
              <span className="ms-1 lg:hidden">
                <SelectedBadge />
              </span>
            )}
            {item.score !== null && (
              <span className="ms-1 lg:hidden">
                <ScoreLabel score={item.score} />
              </span>
            )}
          </div>
          {!isX && <h1 lang={item.textLocale ?? "zh"} className="text-[26px] font-bold leading-[1.38] tracking-[-0.01em] text-ink lg:text-[32px] lg:leading-[1.34] xl:text-[36px] xl:leading-[1.3]">{item.title}</h1>}
          {!isX && item.originalTitle && <p className="mt-2.5 text-[14px] leading-relaxed text-ink-4">{t("原文标题")}{locale === "zh" ? "：" : ": "}<span lang={item.language ?? undefined}>{item.originalTitle}</span></p>}
          <ReadingLanguages itemId={item.id} choices={item.readingLanguages ?? []} hasBody={!!item.body} original={originalView} />
          {item.textLocale && item.textLocale !== locale && <p role="status" className="mt-3 text-[13px] text-ink-3">{t("当前语言的标题和摘要正在等待翻译。")}</p>}

          {item.summary && (
            <section className={isX ? "mt-4" : "mt-7 xl:mt-8"}>
              <div className="mb-2 text-[12px] font-semibold text-accent">{summaryOnly ? t("摘要") : t("AI 导读")}</div>
              <p lang={item.textLocale ?? "zh"} className="text-[18px] leading-[1.7] text-ink xl:text-[20px] xl:leading-[1.7]">{item.summary}</p>
            </section>
          )}

          {item.reason && !summaryOnly && (
            <section className="mt-6 border-t border-line pt-4 lg:hidden">
              <div className="mb-1 text-[12px] font-semibold text-ink-3">{t("推荐理由")}</div>
              <p lang={item.textLocale ?? "zh"} className="text-[15px] leading-[1.75] text-ink-2">{item.reason}</p>
            </section>
          )}

          {item.group && item.group.reportCount > 1 && (
            <div className="mt-5">
              <GroupSources key={locale} group={item.group} parentId={item.id} />
            </div>
          )}

          {summaryOnly && <p className="mt-7 rounded-control bg-bg-sunk px-4 py-3 text-[13.5px] leading-relaxed text-ink-3">{t("应来源方要求，这里只提供摘要与原文入口。完整内容请阅读原文。")}</p>}

          {item.body && bodyHtml && (
            <section className="mt-9 border-t border-line pt-4 xl:mt-10">
              <div className="mb-6 flex items-center justify-between gap-3">
                <span className="text-[12px] text-ink-4">{bodyLabel}</span>
              </div>
              {hasTranslation && lang !== "original" && !item.body.complete && (
                <p className="mb-5 rounded-control bg-bg-sunk px-3 py-2 text-[13px] text-ink-3">{t("译文尚不完整，完整内容请切换到原文。")}</p>
              )}
              {!originalView && item.readingLanguages?.some((choice) => choice.locale === locale && choice.status === "pending") && <p role="status" className="mb-5 rounded-control bg-bg-sunk px-3 py-2 text-[13px] text-ink-3">{t("当前语言的正文正在等待翻译，暂时显示原文。")}</p>}
              <div className="prose" lang={lang === "original" ? item.language ?? undefined : lang} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            </section>
          )}

          {isX && item.x!.media.length > 0 && <MediaGallery media={item.x!.media} postUrl={item.links.original} />}
          {isX && item.x!.quoted?.text && <QuotedPost quoted={item.x!.quoted} />}

          <p className="mt-8 text-[13px] text-ink-4">
            {t("来源：")}
            <LocaleAnchor href={item.links.original} target="_blank" rel="noopener noreferrer" className="text-ink-3 hover:text-accent">
              {isX ? item.x!.authorName : item.source.name}
            </LocaleAnchor>
            <span> · <bdi dir="ltr">{hostOf(item.links.original)}</bdi></span>
          </p>

          {item.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5 lg:hidden">
              {item.tags.slice(0, 6).map((t) => (
                <Link key={t} to={`/all?tag=${encodeURIComponent(t)}`} className="chip">
                  #{tagLabel(t, locale)}
                </Link>
              ))}
            </div>
          )}

          {item.story && <StoryFollowups key={locale} story={item.story} currentId={item.id} />}

          {related.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-2 text-[14px] font-semibold text-ink">{t("相关事件")}</h2>
              <ul className="divide-y divide-line-soft">
                {related.map((s) => (
                  <li key={s.publicId}>
                    <Link to={`/story/${s.publicId}`} className="block py-2.5 text-[14px] text-ink-2 hover:text-accent">
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      </ArticleLayout>

      {posterRequested && (
        <Suspense fallback={null}>
          <PosterSheet key={locale} id={item.id} title={item.title} open={posterOpen} onClose={closePoster} />
        </Suspense>
      )}
      {toast && (
        <div role="status" className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] start-1/2 z-50 -translate-x-1/2 rtl:translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] text-bg shadow-[var(--shadow-pop)] lg:bottom-8">
          {toast}
        </div>
      )}
    </div>
  );
}
