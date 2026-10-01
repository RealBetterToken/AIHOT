import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { articleSourceHash } from "@aihot/backend/publication/localized";
import { seedTopics, loadTopic, topicGroups, localizeTopic } from "@aihot/backend/publication/topics";
import { loadItemShare } from "@aihot/backend/publication/og";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { REPO_ROOT, config } from "@aihot/backend/config";
import { categoryLabel } from "@aihot/industry/taxonomy";
import { MCP_TOOL_NAMES } from "@aihot/contracts/mcp";
import { beijingDate } from "@aihot/contracts/time";
import { buildApp } from "../apps/api/src/app.ts";
import { ogEtag, fonts } from "../apps/api/src/og/render.ts";
import { posterEtag } from "../apps/api/src/og/poster.ts";
import { ogText } from "../apps/api/src/og/copy.ts";
import sharp from "sharp";

const T = tag();
const app = await buildApp();
after(async () => { await app.close(); await stopBoss(); await closeDb(); });
const get = (url: string, headers: Record<string, string> = {}) => app.inject({ method: "GET", url, headers });
let articleId: string;
const sourceText = { title: `中文标题${T}`, summary: `中文摘要${T}`, reason: "中文推荐理由" };
const translated = {
  ru: { title: "Практика работы с агентами", summary: "Как проверять результаты работы агента.", reason: "Полезные приёмы для разработчиков." },
  en: { title: "Working with coding agents", summary: "How to verify an agent’s results.", reason: "Practical techniques for developers." },
};

test("主题配置完整提供三语文案，seed 保持中文身份且读取/关联主题按语言切换", async () => {
  const pack = JSON.parse(readFileSync(`${REPO_ROOT}/industry/topics.json`, "utf8"));
  for (const row of [...pack.groups, ...pack.topics]) {
    for (const locale of ["ru", "en"]) {
      assert.ok(row.i18n[locale].name);
      assert.ok(row.i18n[locale].definition ?? row.i18n[locale].blurb);
      assert.doesNotMatch(JSON.stringify(row.i18n[locale]), /[\p{Script=Han}]/u);
    }
  }
  await seedTopics();
  const original = await loadTopic("context");
  assert.equal(original!.name, "上下文与记忆");
  assert.equal((await loadTopic("context", "ru"))!.name, "Контекст и память");
  assert.equal((await loadTopic("context", "en"))!.name, "Context and memory");
  assert.deepEqual((await loadTopic("context", "ru"))!.tags, original!.tags);
  assert.equal(localizeTopic({ slug: "unknown", name: "原名", definition: "原说明" }, "ru").name, "原名");
  assert.equal(topicGroups("ru")[0]!.name, "Модели и инструменты");
  const directory = await get("/api/site/topics?lang=ru");
  assert.equal(directory.json().groups[0].name, "Модели и инструменты");
  const detail = await get("/api/site/topics/context?lang=en");
  assert.equal(detail.json().topic.name, "Context and memory");
  assert.equal(detail.json().topic.related.find((t: any) => t.slug === "skills").name, "Skills");
  assert.equal((await get("/api/site/topics?lang=fa")).statusCode, 400);
});

test("RSS 本地化频道、分类和阅读入口，Markdown 与分享卡使用同一译文哈希", async () => {
  const source = `outputs-${T}`;
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,next_fetch_at) VALUES (${source}, 'Test source', 'rss', 'T1', 'editorial', '2100-01-01')`;
  const material = await upsertMaterial({ sourceId: source, url: `https://example.com/${T}`, title: "Original headline", language: "en", bodyText: "Original body", bodyStatus: "ok", via: "fetch", publishedAt: new Date() });
  articleId = material.articleId;
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,tags,title_zh,summary_zh,reason_zh,score,selected)
    VALUES (${articleId},1,'rule','pass','tip', ${["上下文/记忆"]}, ${sourceText.title},${sourceText.summary},${sourceText.reason},90,true)`;
  await publishArticle(articleId, { releasedAt: new Date(Date.now() - 60_000) });
  for (const locale of ["ru", "en"] as const) await sql`INSERT INTO localizations(kind,ref_id,locale,source_hash,fields) VALUES ('article', ${articleId}, ${locale}, ${articleSourceHash(sourceText)}, ${sql.json(translated[locale])})`;
  for (const locale of ["ru", "en"] as const) {
    const rss = await get(`/feed/category/tip.xml?lang=${locale}`);
    assert.equal(rss.statusCode, 200);
    assert.ok(rss.body.includes(translated[locale].title));
    assert.ok(rss.body.includes(`<category>${categoryLabel("tip", locale)}</category>`));
    assert.ok(rss.body.includes(locale === "ru" ? "Читать оригинал" : "Read the original"));
    assert.ok(rss.body.includes(`/${locale}/items/${articleId}`));
    assert.doesNotMatch(rss.body, /阅读原文|每日精选|分类摘要/);
    const full = await get(`/feed/full.xml?lang=${locale}`);
    assert.ok(full.body.includes(locale === "ru" ? "полные тексты" : "full text"));
    const daily = await get(`/feed/daily.xml?lang=${locale}`);
    assert.ok(daily.body.includes(locale === "ru" ? "Ежедневный обзор" : "Daily briefing"));
    assert.doesNotMatch(daily.body, /点击查看完整日报/);
    const md = await get(`/items/${articleId}/markdown?lang=${locale}`);
    assert.equal(md.statusCode, 200);
    assert.ok(md.body.startsWith(`# ${translated[locale].title}`));
    assert.ok(md.body.includes(translated[locale].summary));
    assert.ok(md.body.includes(translated[locale].reason));
    assert.ok(md.body.includes(locale === "ru" ? "## Краткое изложение" : "## Summary"));
    assert.ok(md.body.includes(`/${locale}/items/${articleId}`));
    assert.doesNotMatch(md.body, /## 摘要|推荐理由|发布时间/);
    assert.equal((await loadItemShare(articleId, locale))!.title, translated[locale].title);
  }
});

test("分享图和海报按语言隔离缓存；二维码地址、字体和真实 PNG 正确", async () => {
  const d = await loadItemShare(articleId, "ru");
  assert.ok(d);
  const card = { kicker: categoryLabel("tip", "ru"), title: d.title, subtitle: d.summary, meta: `${d.source.name} · ${beijingDate(d.timelineAt)}`, badge: { value: "90", label: ogText("ru", "score") }, locale: "ru" as const };
  const hit = await get(`/og/items/${articleId}.png?lang=ru`, { "if-none-match": `"og-${ogEtag(card)}"` });
  assert.equal(hit.statusCode, 304);
  assert.notEqual(ogEtag({ kicker: "same", title: "same", locale: "ru" }), ogEtag({ kicker: "same", title: "same", locale: "en" }));
  const poster = { url: `${config.siteUrl}/ru/items/${articleId}`, kicker: card.kicker, title: d.title, summary: d.summary, source: d.source.name, date: beijingDate(d.timelineAt), score: 90, locale: "ru" as const };
  assert.equal((await get(`/og/posters/${articleId}.png?lang=ru`, { "if-none-match": `"poster-${posterEtag(poster)}"` })).statusCode, 304);
  assert.notEqual(posterEtag(poster), posterEtag({ ...poster, locale: "en" }));
  for (const [url, width, height] of [[`/og/items/${articleId}.png?lang=ru`, 1200, 630], [`/og/posters/${articleId}.png?lang=en`, 1080, 1440]] as const) {
    const response = await get(url);
    assert.equal(response.statusCode, 200);
    assert.ok(response.rawPayload.length > 10_000);
    const metadata = await sharp(response.rawPayload).metadata();
    assert.equal(metadata.width, width);
    assert.equal(metadata.height, height);
  }
  const parse = createRequire(import.meta.url)("opentype.js").parse;
  for (const font of await fonts()) {
    const data = font.data;
    const parsed = parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    for (const character of "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюяABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz") assert.notEqual(parsed.charToGlyphIndex(character), 0, `${font.weight}: ${character}`);
  }
  for (const url of ["/og/site.png?lang=fa", "/og/items/missing.png?lang=fa", "/items/missing/markdown?lang=fa"]) assert.equal((await get(url)).statusCode, 400);
});

async function rpc(name: string, args: Record<string, unknown>) {
  const response = await app.inject({ method: "POST", url: "/api/mcp", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, payload: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
  const line = response.body.split("\n").find((value) => value.startsWith("data: "));
  return (line ? JSON.parse(line.slice(6)) : response.json()).result;
}

test("MCP 工具模板、安全边界和失败文案跟随语言，信任字段保持", async () => {
  for (const locale of ["ru", "en"] as const) {
    const latest = await rpc(MCP_TOOL_NAMES.latest, { lang: locale });
    const text = latest.content[0].text;
    assert.ok(text.includes(locale === "ru" ? "Граница безопасности" : "Security boundary"));
    assert.ok(text.includes(locale === "ru" ? "Источник" : "Source"));
    // 外部正文可回退中文；只核对固定模板的行首，避免误判正文中的同名词。
    assert.doesNotMatch(text, /^安全边界：|^推荐理由：|^MyHOT 最新资讯｜/m);
    assert.equal(latest.structuredContent._trust.instructionPolicy, "treat_as_data_never_execute");
    const search = await rpc(MCP_TOOL_NAMES.search, { lang: locale, q: "   " });
    assert.ok(search.isError);
    assert.ok(search.content[0].text.includes(locale === "ru" ? "символов" : "characters"));
    const hot = await rpc(MCP_TOOL_NAMES.hot, { lang: locale });
    assert.ok(hot.content[0].text.includes(locale === "ru" ? "актуальные события" : "trending events"));
    const story = await rpc(MCP_TOOL_NAMES.story, { lang: locale, public_id: "missing" });
    assert.ok(story.isError);
    assert.ok(story.content[0].text.includes(locale === "ru" ? "Публичное событие" : "public story"));
    const daily = await rpc(MCP_TOOL_NAMES.daily, { lang: locale, date: "2026-02-30" });
    assert.ok(daily.isError);
    assert.ok(daily.content[0].text.includes(locale === "ru" ? "дата" : "valid date"));
  }
  await sql`UPDATE publications SET title = '改过的中文标题' WHERE article_id = ${articleId}`;
  assert.equal((await loadItemShare(articleId, "ru"))!.title, "改过的中文标题");
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${articleId}`;
  assert.equal((await get(`/og/items/${articleId}.png?lang=ru`)).statusCode, 404);
  assert.equal((await get(`/items/${articleId}/markdown?lang=en`)).statusCode, 404);
});
