import { RTL_LOCALES } from "@aihot/contracts/locale";
import { Link } from "../lib/locale-links";
import { useLoaderData } from "react-router";
import { localeFromPath } from "../i18n/locale";
import { createT, useT, useLocale } from "../i18n/index";
import { apiGet } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
interface TopicSummary {
  slug: string;
  name: string;
  group: "company" | "field" | "genre";
  definition: string;
  total: number;
  recent: number;
  indexable: boolean;
  latestAt: string | null;
}

export async function loader({ request }: { request: Request }) {
  return apiGet<{ topics: TopicSummary[]; groups: Array<{ key: string; name: string; blurb: string }> }>("/api/site/topics", { request, signal: request.signal });
}

export function meta({ location }: { location: { pathname: string } }) {
  const locale = localeFromPath(location.pathname);
  const t = createT(locale);
  return pageMeta({ locale, title: t("主题"), description: t("按模型与工具、技术方向和内容形态浏览 Vibe Coding 与 AI 编程精选，持续汇集社区实践、问题、教程与观点。"), path: "/topics", image: "/og/pages/topics.png" });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

export default function TopicsPage() {
  const t = useT();
  const locale = useLocale();
  const { topics, groups } = useLoaderData<typeof loader>();
  return (
    <div className="pb-10">
      <header className="pb-2 pt-5 lg:pt-1">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">{t("按主题看 Vibe Coding")}</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
          {t("按模型与工具、技术方向和内容形态浏览 {count} 个主题，持续汇集近期焦点与精选。", { count: topics.length })}
        </p>
      </header>
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`topics-${g.key}`} className="pt-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 id={`topics-${g.key}`} className="text-[15px] font-bold text-ink">
              {g.name}
            </h2>
            <p className="text-[12px] text-ink-4">{g.blurb}</p>
          </div>
          <ul className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {topics
              .filter((topicEntry) => topicEntry.group === g.key)
              .map((topicEntry) => (
                <li key={topicEntry.slug}>
                  <Link
                    to={`/topics/${topicEntry.slug}`}
                    prefetch="intent"
                    aria-label={t("查看{name}相关精选文章", { name: topicEntry.name })}
                    className="card card-hover group flex h-full flex-col px-5 py-[18px]"
                  >
                    <span className="text-[15px] font-bold text-ink transition-colors group-hover:text-accent">{topicEntry.name}</span>
                    <span className="mt-1.5 line-clamp-2 flex-1 text-[12.5px] leading-[1.7] text-ink-3">{topicEntry.definition}</span>
                    <span className="mono mt-3 text-[11.5px] text-accent">
                      {t("查看 {count} 条精选", { count: topicEntry.total })} <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5">{RTL_LOCALES.includes(locale) ? "←" : "→"}</span>
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
