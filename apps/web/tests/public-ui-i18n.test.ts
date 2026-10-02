import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { createServer, type ViteDevServer } from "vite";
import * as taxonomy from "@aihot/industry/taxonomy";
import { getAbout, getSite } from "@aihot/industry/site";
import type { FeedItemSummary, ReportDetail } from "@aihot/contracts/site";
import type { Locale } from "../app/i18n/locale.ts";

let server: ViteDevServer;
before(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });
});
after(async () => { await server?.close(); });

function render(Component: ComponentType<any>, props: object, path: string): string {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props)));
}

function renderPage(Component: ComponentType, data: unknown, path: string): string {
  const router = createMemoryRouter([{ id: "page", path: "*", Component }], { initialEntries: [path], hydrationData: { loaderData: { page: data } } });
  try { return renderToStaticMarkup(createElement(RouterProvider, { router })); }
  finally { router.dispose(); }
}

const item: FeedItemSummary = {
  id: "sample", title: "Sample title", summary: null, reason: null,
  publishedAt: "2026-10-01T00:00:00Z", timelineAt: "2026-10-01T00:00:00Z",
  category: "tip", tags: ["教程/实践", "成本/额度", "智谱"],
  score: null, selected: false, channel: "news", source: { name: "Source" }, x: null,
};

test("分类、标签与主体在英文和俄文界面显示本地化名称，原始键保持稳定", () => {
  const labels = taxonomy as typeof taxonomy & { tagLabel?: (tag: string, locale: Locale) => string; entityLabel?: (id: string, locale: Locale) => string };
  assert.equal(typeof labels.tagLabel, "function");
  assert.equal(typeof labels.entityLabel, "function");
  for (const locale of ["en", "ru"] as const) {
    for (const category of taxonomy.CATEGORIES) {
      assert.doesNotMatch(taxonomy.categoryLabel(category.key, locale), /\p{Script=Han}/u);
      assert.doesNotMatch(taxonomy.categorySection(category.key, locale), /\p{Script=Han}/u);
    }
    for (const tag of [...taxonomy.CATEGORY_TAGS, ...taxonomy.TOPIC_TAGS, ...taxonomy.ENTITY_TAGS]) {
      assert.doesNotMatch(labels.tagLabel!(tag, locale), /\p{Script=Han}/u, `${locale}: ${tag}`);
    }
    for (const id of Object.keys(taxonomy.ENTITIES)) assert.doesNotMatch(labels.entityLabel!(id, locale), /\p{Script=Han}/u);
  }
  assert.equal(labels.tagLabel!("教程/实践", "en"), "Tutorials/practice");
  assert.equal(labels.tagLabel!("问题/踩坑", "ru"), "Проблемы/ошибки");
  assert.equal(labels.tagLabel!("教程/实践", "zh"), "教程/实践");
  assert.equal(labels.tagLabel!("entity:qwen", "en"), "Qwen");
  assert.equal(labels.tagLabel!("教程/玩法", "en"), "Tutorials/practice");
  assert.equal(labels.tagLabel!("安全/对齐", "ru"), "Безопасность/инциденты");
  assert.equal(labels.entityLabel!("kimi", "ru"), "Kimi / Moonshot AI");
  assert.equal(labels.entityLabel!("hunyuan", "zh"), "腾讯混元");
  assert.equal(labels.entityLabel!("hunyuan", "en"), "Tencent Hunyuan");
  assert.equal(labels.tagLabel!("CustomBrand v2", "en"), "CustomBrand v2");
  assert.equal(labels.entityLabel!("unknown", "ru"), "unknown");
  for (const key of ["constructor", "__proto__", "toString"]) {
    for (const locale of ["zh", "en", "ru"] as const) {
      assert.equal(labels.tagLabel!(key, locale), key);
      assert.equal(labels.entityLabel!(key, locale), key);
    }
  }
});

test("动态卡片的标签随语言切换，筛选链接继续传递 canonical 标签", async () => {
  const { FeedItem } = await server.ssrLoadModule("/app/features/feed/FeedItem.tsx");
  for (const [locale, label] of [["zh", "#教程/实践"], ["en", "#Tutorials/practice"], ["ru", "#Руководства/практика"]] as const) {
    const html = render(FeedItem, { item, showTags: true }, `/${locale}/all`);
    assert.ok(html.includes(label), `${locale}: ${label}`);
    assert.ok(html.includes(`href="/${locale}/all?tag=%E6%95%99%E7%A8%8B%2F%E5%AE%9E%E8%B7%B5"`));
    if (locale !== "zh") assert.doesNotMatch(html, /\p{Script=Han}/u);
  }
});

test("标签筛选页的标题使用当前语言名称", async () => {
  const { default: AllPage } = await server.ssrLoadModule("/app/routes/all.tsx");
  const data = { items: [], filters: { channel: "all", category: null, tag: "教程/实践", q: null, tab: "time" }, page: 1, pageCount: 1, total: 0, todayCount: 0, freshness: "2026-10-01T00:00:00Z" };
  for (const [locale, label] of [["en", "#Tutorials/practice"], ["ru", "#Руководства/практика"]] as const) {
    const html = renderPage(AllPage, { data }, `/${locale}/all?tag=%E6%95%99%E7%A8%8B%2F%E5%AE%9E%E8%B7%B5`);
    assert.ok(html.includes(label));
    assert.doesNotMatch(html, /\p{Script=Han}/u);
  }
});

test("首页、主题索引与关于页的公开身份使用 Vibe Coding 定位", async () => {
  const { meta: topicsMeta } = await server.ssrLoadModule("/app/routes/topics.tsx");
  for (const locale of ["zh", "en", "ru"] as const) {
    assert.match(getSite(locale).homeTitle, /Vibe Coding/);
    assert.match(getSite(locale).description, /Vibe Coding/);
    assert.match(getAbout(locale).headline.join(" "), /Vibe Coding/);
    const meta = topicsMeta({ location: { pathname: `/${locale}/topics` } });
    assert.match(meta.find((entry: any) => entry.name === "description").content, /Vibe Coding/);
  }
});

test("日报界面的标题、导航与分节名称在三种语言下完整本地化", async () => {
  const { ReportPaper } = await server.ssrLoadModule("/app/features/report/ReportPaper.tsx");
  const { meta: latestMeta } = await server.ssrLoadModule("/app/routes/report-latest.tsx");
  const citation = { itemId: "sample", title: "Sample article", summary: "Sample summary", sourceName: "Source", sourceUrl: "https://example.test/article", sourceId: "source", sourceIconUrl: null, firstParty: false, role: null, storyPublicId: null, publishedAt: "2026-10-01T00:00:00Z", available: true };
  const report: ReportDetail = { kind: "daily", key: "2026-10-01", title: "Daily", windowStart: "2026-09-30T00:00:00Z", windowEnd: "2026-10-01T00:00:00Z", generatedAt: "2026-10-01T00:00:00Z", revision: 1, lead: { title: "Sample lead", leadParagraph: "Sample summary" }, overview: null, highlights: [], sections: [{ label: "实践与教程", summary: null, items: [citation] }], stories: [{ ...citation, label: "实践与教程" }], flashes: [], cover: null, metrics: { totalEvents: 1, sourcesCount: 1, selectedCount: 1 }, readingMinutes: 1, prev: "2026-09-30", next: null };
  const index = [{ key: "2026-10-01", title: null }, { key: "2026-09-30", title: null }];
  for (const locale of ["zh", "en", "ru"] as const) {
    const html = render(ReportPaper, { report, index }, `/${locale}/daily/2026-10-01`);
    assert.match(html, /Vibe Coding/);
    if (locale !== "zh") assert.doesNotMatch(html, /\p{Script=Han}/u);
    const meta = latestMeta({ loaderData: { kind: "daily" }, location: { pathname: `/${locale}/daily` } });
    assert.match(meta[0].title, /Vibe Coding/);
  }
});

test("缺少当前语言译文的动态卡片标注实际语言并显示等待提示", async () => {
  const { FeedItem } = await server.ssrLoadModule("/app/features/feed/FeedItem.tsx");
  const html = render(FeedItem, { item: { ...item, title: "中文标题", summary: "中文摘要", reason: "中文理由", textLocale: "zh" } }, "/ru/all");
  assert.match(html, /lang="zh-CN"[^>]*>/);
  assert.ok(html.includes("Ожидает перевода"));
  assert.ok(html.includes("Заголовок и краткое изложение на выбранном языке ожидают перевода."));
  assert.ok(html.includes('lang="zh-CN">中文理由'));
});

test("从原文页切换站点语言回到所选语言正文，保留查询与锚点", async () => {
  const { LanguageSwitcher } = await server.ssrLoadModule("/app/i18n/LanguageSwitcher.tsx");
  const html = render(LanguageSwitcher, {}, "/zh/items/sample/original?from=feed#summary");
  assert.ok(html.includes('href="/ru/items/sample?from=feed#summary"'));
  assert.ok(html.includes('href="/en/items/sample?from=feed#summary"'));
  assert.ok(html.includes('href="/zh/items/sample/original?from=feed#summary"'));
});

test("收藏卡片明确区分已保存快照和当前语言缺译", async () => {
  const { StarredCard } = await server.ssrLoadModule("/app/routes/starred.tsx");
  assert.equal(typeof StarredCard, "function");
  const saved = { id: "sample", title: "Saved English", summary: "Saved summary", sourceName: "Source", savedAt: "2026-10-01T00:00:00Z", publishedAt: null, score: null, aiSelected: false, textLocale: "en" };
  const snapshot = render(StarredCard, { saved }, "/ru/starred");
  assert.ok(snapshot.includes("Saved English"));
  assert.match(snapshot, /lang="en"/);
  assert.ok(snapshot.includes("Показана сохранённая копия на языке: английский."));
  const display = { title: "中文标题", summary: null, source: { name: "Source" }, publishedAt: null, textLocale: "zh" };
  const pending = render(StarredCard, { saved, display }, "/ru/starred");
  assert.ok(pending.includes("Ожидает перевода"));
  assert.match(pending, /lang="zh-CN"/);
  const legacy = render(StarredCard, { saved: { ...saved, textLocale: undefined } }, "/en/starred");
  assert.ok(legacy.includes("Showing the saved copy; its language was not recorded."));
});

test("更新日志使用条目的三语标题和正文，列表与强调格式保持", async () => {
  const { default: ChangelogPage } = await server.ssrLoadModule("/app/routes/changelog.tsx");
  const release = {
    date: "2026-10-01", time: "08:00", kind: "公告", title: "新增加的日志标题", body: ["新增加的中文段落", "- **重点说明**"],
    translations: {
      en: { title: "A new release title", body: ["A new English paragraph", "- **Important note**"] },
      ru: { title: "Новый заголовок выпуска", body: ["Новый абзац на русском", "- **Важное замечание**"] },
    },
  };
  for (const [locale, title, body, emphasis] of [
    ["zh", "新增加的日志标题", "新增加的中文段落", "重点说明"],
    ["en", "A new release title", "A new English paragraph", "Important note"],
    ["ru", "Новый заголовок выпуска", "Новый абзац на русском", "Важное замечание"],
  ] as const) {
    const html = renderPage(ChangelogPage, { latestVersion: "2026-10-01T08:00", releases: [release] }, `/${locale}/changelog`);
    assert.ok(html.includes(title));
    assert.ok(html.includes(body));
    assert.ok(html.includes(`<b class="font-semibold text-ink-2">${emphasis}</b>`));
    assert.match(html, /<ul\b/);
    if (locale !== "zh") assert.doesNotMatch(html, /\p{Script=Han}/u);
  }
});

test("实际行业更新日志在三语公开页面完整显示，不残留旧站名", async () => {
  const { default: ChangelogPage } = await server.ssrLoadModule("/app/routes/changelog.tsx");
  const data = JSON.parse(readFileSync(new URL("../../../industry/changelog.json", import.meta.url), "utf8"));
  for (const locale of ["zh", "en", "ru"] as const) {
    const html = renderPage(ChangelogPage, data, `/${locale}/changelog`);
    assert.doesNotMatch(html, /AIHOT/);
    if (locale !== "zh") assert.doesNotMatch(html, /\p{Script=Han}/u);
    assert.ok(html.includes("industry/changelog.json"));
  }
});

test("不含翻译字段的旧日志继续使用已知词典", async () => {
  const { default: ChangelogPage } = await server.ssrLoadModule("/app/routes/changelog.tsx");
  const data = { latestVersion: "2026-10-01T08:00", releases: [{ date: "2026-10-01", time: "08:00", kind: "公告", title: "网站上线", body: ["这是示例条目。新条目写在 industry/changelog.json 的最前面，并把 latestVersion 改成它的日期和时间，导航上就会出现提醒红点。"] }] };
  const en = renderPage(ChangelogPage, data, "/en/changelog");
  assert.ok(en.includes("Site launched"));
  assert.ok(en.includes("This is a sample entry."));
  const ru = renderPage(ChangelogPage, data, "/ru/changelog");
  assert.ok(ru.includes("Сайт запущен"));
  assert.ok(ru.includes("Это пример записи."));
});
