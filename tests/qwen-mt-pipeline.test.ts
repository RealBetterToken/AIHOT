import { stub, tag, Reply } from "./setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import * as cheerio from "cheerio";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { analyzeArticle } from "@aihot/backend/editorial/analyze";
import { translateArticle, translateQuotes } from "@aihot/backend/editorial/translate";
import { localizePending, localizePendingStories, localizePendingReports } from "@aihot/backend/editorial/localize";
import { loadItemDetail, siteItemDetail } from "@aihot/backend/publication/detail";
import { localizedStoryTexts } from "@aihot/backend/publication/localized-story-report";
import { loadReport } from "@aihot/backend/publication/reports";
import { publishArticle } from "@aihot/backend/publication/publish";
import { stopBoss } from "@aihot/backend/jobs/queue";

const T = tag();
const source = `test-model-combination-${T}`;
const seen: Array<Record<string, any>> = [];
let dropBoundary = false;
let wrongRussian = false;
let emptyHtml = false;
let mangleBareUrl = false;
let mangleHtml = false;
let invalidSlot: string | null = null;
const translations: Record<string, [string, string, string]> = {
  "编辑标题": ["Заголовок редактора", "Editorial title", "编辑标题"],
  "编辑摘要。第二句。": ["Описание редактора. Второе предложение.", "Editorial summary. Second sentence.", "编辑摘要。第二句。"],
  "推荐理由": ["Рекомендация редактора", "Editorial recommendation", "推荐理由"],
  "Original paragraph. ": ["Русский абзац. ", "Original paragraph. ", "原始段落。 "],
  "Documentation": ["Документация", "Documentation", "文档"],
  "引用帖子": ["Цитируемая публикация", "Quoted post", "引用帖子"],
  "事件标题": ["Название события", "Event title", "事件标题"],
  "事件摘要": ["Описание события", "Event summary", "事件摘要"],
  "事件综述": ["Обзор события", "Event overview", "事件综述"],
  "进展标题": ["Название развития", "Development title", "进展标题"],
  "日报标题": ["Название обзора дня", "Daily title", "日报标题"],
  "日报导语": ["Введение в обзор дня", "Daily introduction", "日报导语"],
  "旧分类": ["Архивный раздел", "Archive section", "旧分类"],
};
const provider = await stub((_hit, req) => {
  const body = JSON.parse(req.body);
  seen.push(body);
  if (body.model === "qwen-mt-flash") {
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].role, "user");
    const localeIndex = body.translation_options.target_lang === "Russian" ? (wrongRussian ? 2 : 0) : body.translation_options.target_lang === "English" ? 1 : 2;
    const doc = cheerio.load(body.messages[0].content, null, false);
    const visit = (node: any) => {
      if (node.type === "text") {
        for (const [sourceText, translated] of Object.entries(translations)) node.data = node.data.replaceAll(sourceText, translated[localeIndex]);
        if (mangleBareUrl) node.data = node.data.replaceAll("https://example.org/raw", "https://example.org/changed");
        if (mangleHtml) node.data = node.data.replace(/⟦\d+⟧/g, "");
        if (emptyHtml) node.data = (node.data.match(/⟦\d+⟧/g) ?? []).join(" ") || "123";
        if (invalidSlot !== null) node.data = node.data.replaceAll("Документация", invalidSlot);
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(doc.root()[0]);
    if (mangleHtml) doc("strong").each((_i, el) => { doc(el).replaceWith(doc(el).contents()); });
    if (emptyHtml) doc("strong").empty();
    if (dropBoundary) doc("[id^='VHMT_']").first().remove();
    return { id: `mt-${T}-${seen.length}`, choices: [{ message: { content: doc.html() }, finish_reason: "stop" }], usage: { prompt_tokens: 30, completion_tokens: 30 } };
  }
  const system = body.messages[0]?.role === "system" ? body.messages[0].content : "";
  const content = system.includes("宽召回") ? { label: "PASS", reason: "相关" }
    : system.includes("的注意力评分器") ? { attentionScore: 80 }
    : system.includes("内容理解编辑") ? { itemType: "product_launch", authorRole: "principal", tags: ["产品更新"], editorialJudgment: "推荐理由", titleZh: "编辑标题", summaryZh: "编辑摘要。第二句。" }
    : system.includes("资料结构化助手") ? { category: "release", tags: ["产品更新"], subjects: [], fact: null }
    : null;
  if (content === null) return new Reply(400, { error: { message: "测试收到未约定的请求" } });
  return { choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 10 } };
});
Object.assign(process.env, {
  DEEPSEEK_BASE_URL: `${provider.url}/v1`, DEEPSEEK_API_KEY: "test-key",
  DASHSCOPE_BASE_URL: `${provider.url}/v1`, DASHSCOPE_API_KEY: "test-key",
  PREFILTER_MODEL: "qwen3.7-flash", STRUCTURE_MODEL: "qwen3.7-flash",
  SCORE_MODEL: "deepseek-flash", UNDERSTAND_MODEL: "deepseek-flash",
  TRANSLATE_MODEL: "qwen-mt-flash", LOCALIZE_MODEL: "qwen-mt-flash",
});
const dailyKey = "2099-10-09";
after(async () => {
  await sql`DELETE FROM localizations WHERE kind = 'report' AND ref_id = ${`daily:${dailyKey}`}`;
  await sql`DELETE FROM reports WHERE kind = 'daily' AND key = ${dailyKey}`;
  await sql`UPDATE publications SET selected = false, visibility = 'withdrawn' WHERE source_id = ${source}`;
  await provider.close(); await stopBoss(); await closeDb();
});
let articleId: string;

test("组合模型完成两次评分及三语翻译，保留代码、链接和回执复用", async () => {
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
    VALUES (${source},'模型组合测试','rss','T1','editorial','2100-01-01')`;
  ({ articleId } = await upsertMaterial({ sourceId: source, url: `https://example.org/${T}`, title: "A coding product launch", language: "en",
    bodyHtml: '<p>Original paragraph. <code>const x = 1;</code> <a href="https://example.org/docs">Documentation</a></p><p>Documentation</p>',
    bodyText: "A new coding product is available with pricing and release notes. ".repeat(6), bodyStatus: "ok", via: "fetch" }));
  const analysis = await analyzeArticle(articleId);
  assert.equal(analysis?.output?.selected, true);
  assert.deepEqual(seen.filter((b) => b.model === "qwen3.7-flash").length, 2);
  assert.equal(seen.filter((b) => b.model === "deepseek-flash").length, 3, "两次评分和一次精选写作");
  await publishArticle(articleId);
  await sql`UPDATE publications SET visible_after = now() - interval '1 hour' WHERE article_id = ${articleId}`;
  assert.equal((await translateArticle(articleId, "ru")).status, "translated");
  assert.equal((await translateArticle(articleId, "zh")).status, "translated");
  assert.equal((await localizePending({ articleIds: [articleId] })).stored, 2);
  const detail = await loadItemDetail(articleId, new Date(), "ru");
  assert.equal(detail.kind, "found");
  if (detail.kind === "found") {
    const item = siteItemDetail(detail.detail);
    assert.equal(item.title, "Заголовок редактора");
    assert.ok(item.body?.localized?.includes("Русский абзац"));
    assert.ok(item.body?.localized?.includes("const x = 1;"));
    assert.ok(item.body?.localized?.includes('href="https://example.org/docs"'));
  }
  const start = provider.hits();
  await translateArticle(articleId, "ru");
  await sql`DELETE FROM localizations WHERE kind = 'article' AND ref_id = ${articleId}`;
  assert.equal((await localizePending({ articleIds: [articleId] })).stored, 2);
  assert.equal(provider.hits(), start, "同输入恢复时复用原始回执，不再次发请求");
  const receipts = await sql`SELECT r.model,r.status FROM localizations l JOIN receipts r ON r.id = l.receipt_id
    WHERE l.kind = 'article' AND l.ref_id = ${articleId}`;
  assert.ok(receipts.length > 0 && receipts.every((r) => r.model === "qwen-mt-flash" && r.status === "completed"));
});

test("千问翻译完整覆盖事件进展及日报引用，同时保持稳定标识和空值", async () => {
  const publicId = randomUUID();
  const factPublicId = `stable-fact-${T}`;
  const [story] = await sql`INSERT INTO stories(public_id,title,summary,digest,latest,latest_at)
    VALUES (${publicId},'事件标题','事件摘要','事件综述',NULL,now()) RETURNING id`;
  const [fact] = await sql`INSERT INTO facts(public_id,story_id,title) VALUES (${factPublicId},${story!.id},'进展标题') RETURNING id`;
  await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES (${fact!.id},${articleId},'primary')`;
  await sql`UPDATE publications SET story_id = ${story!.id}, fact_id = ${fact!.id} WHERE article_id = ${articleId}`;
  assert.equal((await localizePendingStories({ storyIds: [publicId] })).stored, 2);
  const fields = (await localizedStoryTexts([publicId], "ru")).get(publicId)!;
  assert.equal(fields.title, "Название события");
  assert.equal(fields.latest, null);
  assert.deepEqual(fields.developments, [{ public_id: factPublicId, title: "Название развития" }]);
  await sql`INSERT INTO reports(kind,key,window_start,window_end,content,generated_at)
    VALUES ('daily',${dailyKey},'2099-10-08','2099-10-09',${sql.json({ title: "日报标题", lead: { title: "日报标题", leadParagraph: "日报导语" },
      sections: [{ label: "旧分类", items: [{ itemId: articleId, title: "编辑标题", summary: "编辑摘要。第二句。", sourceUrl: "https://example.org/citation" }] }], flashes: [], metrics: { totalItems: 1 } })},now())`;
  assert.equal((await localizePendingReports({ reportIds: [`daily:${dailyKey}`] })).stored, 2);
  const report = await loadReport("daily", dailyKey, "ru");
  assert.equal(report?.lead?.title, "Название обзора дня");
  assert.equal(report?.lead?.leadParagraph, "Введение в обзор дня");
  assert.equal(report?.sections[0]?.items[0]?.title, "Заголовок редактора");
  assert.equal(report?.sections[0]?.items[0]?.itemId, articleId);
  assert.equal(report?.sections[0]?.items[0]?.sourceUrl, "https://example.org/citation");
});

test("字段包装被破坏时缩小批次，逐字段恢复且不把错误位置的译文写入", async () => {
  await sql`UPDATE publications SET title = '事件标题', summary = '事件摘要', reason = '事件综述' WHERE article_id = ${articleId}`;
  dropBoundary = true;
  try {
    assert.equal((await localizePending({ articleIds: [articleId] })).stored, 2);
  } finally { dropBoundary = false; }
  const [row] = await sql`SELECT fields FROM localizations WHERE kind = 'article' AND ref_id = ${articleId} AND locale = 'ru'`;
  assert.deepEqual(row!.fields, { title: "Название события", summary: "Описание события", reason: "Обзор события" });
});

test("拒绝中文冒充俄语，仍保存英语；下轮只为失败的语言重新付费", async () => {
  await sql`UPDATE publications SET title = '进展标题', summary = '事件摘要', reason = NULL WHERE article_id = ${articleId}`;
  await sql`DELETE FROM localizations WHERE kind = 'article' AND ref_id = ${articleId}`;
  wrongRussian = true;
  try {
    assert.equal((await localizePending({ articleIds: [articleId] })).stored, 1);
  } finally { wrongRussian = false; }
  const rows = await sql`SELECT locale FROM localizations WHERE kind = 'article' AND ref_id = ${articleId}`;
  assert.deepEqual(rows.map((r) => r.locale), ["en"]);
  const before = provider.hits();
  assert.equal((await localizePending({ articleIds: [articleId] })).stored, 2);
  assert.equal(provider.hits(), before + 1, "已成功的英语请求复用回执");
});

test("英语原始卡片补齐中文和俄语，空摘要与空理由原样保留", async () => {
  await sql`UPDATE publications SET title = 'Documentation', summary = NULL, reason = NULL WHERE article_id = ${articleId}`;
  await sql`DELETE FROM localizations WHERE kind = 'article' AND ref_id = ${articleId}`;
  assert.equal((await localizePending({ articleIds: [articleId] })).stored, 2);
  const rows = await sql`SELECT locale,fields FROM localizations WHERE kind = 'article' AND ref_id = ${articleId} ORDER BY locale`;
  assert.deepEqual(rows.map((r) => ({ ...r })), [
    { locale: "ru", fields: { title: "Документация", summary: null, reason: null } },
    { locale: "zh", fields: { title: "文档", summary: null, reason: null } },
  ]);
});

test("长摘要分块仍保留所有句子和字段，不超过专用翻译输入上限", async () => {
  await sql`UPDATE publications SET title = '编辑标题', summary = ${"编辑摘要。第二句。 ".repeat(600)}, reason = '推荐理由' WHERE article_id = ${articleId}`;
  const before = seen.length;
  assert.equal((await localizePending({ articleIds: [articleId] })).stored, 2);
  const [row] = await sql`SELECT fields FROM localizations WHERE kind = 'article' AND ref_id = ${articleId} AND locale = 'en'`;
  assert.equal((row!.fields.summary.match(/Editorial summary/g) ?? []).length, 600);
  assert.equal(row!.fields.title, "Editorial title");
  assert.ok(seen.slice(before).every((b) => b.messages[0].content.length < 8000));
});

test("X 正文及引用帖也走专用翻译，代码和 URL 不改写，同语言不付费", async () => {
  const quoteId = `${Date.now()}991`;
  const code = "```js\n// 很长的中文代码注释必须保留原样，不能影响正文目标语言验证。\nDocumentation\n```";
  const text = `引用帖子 \`const x = 1;\` https://example.org/quoted\n${code}`;
  const { articleId: id } = await upsertMaterial({ sourceId: source, url: `https://x.com/author/status/${Date.now()}992`, title: "引用帖子", language: "zh",
    bodyText: text, bodyStatus: "ok", via: "fetch", xPost: { tweetId: `${Date.now()}992`, authorName: "Author", handle: "author", text,
      quoted: { authorName: "Quoted", handle: "quoted", text, url: `https://x.com/author/status/${quoteId}` } } });
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,title_zh,summary_zh,selected,score)
    VALUES (${id},1,'rule','pass','引用帖子','事件摘要',true,90)`;
  await publishArticle(id);
  await sql`UPDATE publications SET visible_after = now() - interval '1 hour' WHERE article_id = ${id}`;
  assert.equal((await translateArticle(id, "ru")).status, "translated");
  assert.equal((await translateArticle(id, "zh")).reason, "same language");
  assert.equal(await translateQuotes({ articleIds: [id] }), 2);
  const [quote] = await sql`SELECT text FROM quote_translations_lang WHERE tweet_id = ${quoteId} AND lang = 'ru'`;
  assert.equal(quote!.text, `Цитируемая публикация \`const x = 1;\` https://example.org/quoted\n${code}`);
  const before = provider.hits();
  assert.equal(await translateQuotes({ articleIds: [id] }), 0);
  assert.equal(provider.hits(), before);
});

test("空 HTML 和只有受保护代码的回复不能被标记为完整译文", async () => {
  const { articleId: id } = await upsertMaterial({ sourceId: source, url: `https://example.org/${T}/empty-html`, title: "Documentation", language: "en",
    bodyHtml: '<p><strong>Original paragraph. </strong><code>const x = 1;</code></p>', bodyText: "Original paragraph. const x = 1;", bodyStatus: "ok", via: "fetch" });
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,title_zh,summary_zh,selected,score)
    VALUES (${id},1,'rule','pass','编辑标题','编辑摘要。第二句。',true,90)`;
  await publishArticle(id);
  emptyHtml = true;
  try { assert.equal((await translateArticle(id, "ru")).status, "skipped"); }
  finally { emptyHtml = false; }
  assert.equal((await sql`SELECT 1 FROM translations WHERE article_id = ${id} AND lang = 'ru'`).length, 0);
});

test("正文中未包在链接标签里的 URL 也原样保护", async () => {
  const { articleId: id } = await upsertMaterial({ sourceId: source, url: `https://example.org/${T}/bare-url`, title: "Documentation", language: "en",
    bodyHtml: '<p>Documentation https://example.org/raw?a=1&amp;b=2</p>', bodyText: "Documentation https://example.org/raw?a=1&b=2", bodyStatus: "ok", via: "fetch" });
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,title_zh,summary_zh,selected,score)
    VALUES (${id},1,'rule','pass','编辑标题','编辑摘要。第二句。',true,90)`;
  await publishArticle(id);
  mangleBareUrl = true;
  try { assert.equal((await translateArticle(id, "ru")).status, "translated"); }
  finally { mangleBareUrl = false; }
  const [row] = await sql`SELECT body_text FROM translations WHERE article_id = ${id} AND lang = 'ru'`;
  assert.equal(row!.body_text, "Документация https://example.org/raw?a=1&b=2");
});

test("模型丢失标签或代码占位符时，文字重试保留原结构并复用成功回执", async () => {
  const { articleId: id } = await upsertMaterial({ sourceId: source, url: `https://example.org/${T}/mangled-html`, title: "Documentation", language: "en",
    bodyHtml: `<p><strong>Original paragraph. fixture${T} </strong><code>const x = 1;</code> <a href="https://example.org/docs">Documentation</a></p><pre>const unchanged = true;</pre>`,
    bodyText: "Original paragraph. const x = 1; Documentation", bodyStatus: "ok", via: "fetch" });
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,title_zh,summary_zh,selected,score)
    VALUES (${id},1,'rule','pass','编辑标题','编辑摘要。第二句。',true,90)`;
  await publishArticle(id);
  mangleHtml = true;
  try { assert.equal((await translateArticle(id, "ru")).status, "translated"); }
  finally { mangleHtml = false; }
  const [row] = await sql`SELECT body_html,complete FROM translations WHERE article_id = ${id} AND lang = 'ru'`;
  const doc = cheerio.load(row!.body_html, null, false);
  assert.equal(row!.complete, true);
  assert.equal(doc("strong").text(), `Русский абзац. fixture${T} `);
  assert.equal(doc("code").text(), "const x = 1;");
  assert.equal(doc("pre").text(), "const unchanged = true;");
  assert.equal(doc("a").text(), "Документация");
  assert.equal(doc("a").attr("href"), "https://example.org/docs");
  const attempts = await sql`SELECT status FROM receipts WHERE purpose='translate_body' AND subject LIKE ${`article:${id}@%`}`;
  assert.ok(attempts.some((row) => row.status === "failed"), "损坏的直接翻译仍被拒绝");
  assert.ok(attempts.some((row) => row.status === "completed"), "文字重试成功后完成回执");
  const before = provider.hits();
  mangleHtml = true;
  try { assert.equal((await translateArticle(id, "ru")).status, "translated"); }
  finally { mangleHtml = false; }
  assert.equal(provider.hits(), before, "同输入恢复时不重复付费");
});

test("文字重试仍拒绝目标语言不符的回复", async () => {
  const { articleId: id } = await upsertMaterial({ sourceId: source, url: `https://example.org/${T}/wrong-fallback-language`, title: "Documentation", language: "en",
    bodyHtml: '<p><strong>Original paragraph. </strong><code>const x = 1;</code></p>',
    bodyText: "Original paragraph. const x = 1;", bodyStatus: "ok", via: "fetch" });
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,title_zh,summary_zh,selected,score)
    VALUES (${id},1,'rule','pass','编辑标题','编辑摘要。第二句。',true,90)`;
  await publishArticle(id);
  mangleHtml = true;
  wrongRussian = true;
  try { assert.equal((await translateArticle(id, "ru")).status, "skipped"); }
  finally { mangleHtml = false; wrongRussian = false; }
  assert.equal((await sql`SELECT 1 FROM translations WHERE article_id = ${id} AND lang = 'ru'`).length, 0);
});

test("文字槽独立校验，不能用同段的正确译文掩盖丢文或错语", async () => {
  const cases = ["123", "https://example.org/only-url", "```js\nconst lostNarrative = true;\n```", "中文段落"];
  for (const [index, answer] of cases.entries()) {
    // 不同异常使用不同输入，避免复用其他场景已完成的模型回执。
    const { articleId: id } = await upsertMaterial({ sourceId: source, url: `https://example.org/${T}/invalid-slot-${index}`, title: "Documentation", language: "en",
      bodyHtml: `<p><strong>Original paragraph. fixture${T}${index} </strong><code>const x = 1;</code> <a href="https://example.org/docs">Documentation</a></p>`,
      bodyText: "Original paragraph. const x = 1; Documentation", bodyStatus: "ok", via: "fetch" });
    await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,title_zh,summary_zh,selected,score)
      VALUES (${id},1,'rule','pass','编辑标题','编辑摘要。第二句。',true,90)`;
    await publishArticle(id);
    mangleHtml = true;
    invalidSlot = answer;
    try { assert.equal((await translateArticle(id, "ru")).status, "skipped", answer); }
    finally { mangleHtml = false; invalidSlot = null; }
    assert.equal((await sql`SELECT 1 FROM translations WHERE article_id = ${id} AND lang = 'ru'`).length, 0);
  }
});
