import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { localizePending, localizePendingStories, localizePendingReports } from "@aihot/backend/editorial/localize";
import { loadStoryDetail, v1Story } from "@aihot/backend/publication/stories";
import { loadDevelopments } from "@aihot/backend/publication/groups";
import { loadItemDetail } from "@aihot/backend/publication/detail";
import { loadReport, reportIndexRows, reportIndex, v1Daily } from "@aihot/backend/publication/reports";
import { hasReportProse, localizedStoryTexts, reportProse, reportSourceHash, storySources, validReportFields, validStoryFields } from "@aihot/backend/publication/localized-story-report";
import { stopBoss, shutdownSignal } from "@aihot/backend/jobs/queue";
import { SITE } from "@aihot/industry/site";

const T = tag();
const source = `story-report-localize-${T}`;
let partial = false;
let onRequest: (() => Promise<void>) | null = null;
const translations: Record<string, [string, string]> = {
  "事件摘要": ["Описание события", "Event summary"], "事件综述": ["Обзор события", "Event overview"],
  "最近进展": ["Последние события", "Latest development"], "进展标题": ["Развитие события", "Development title"],
  "更新摘要": ["Обновлённое описание", "Updated summary"], "更新进展": ["Обновлённое событие", "Updated development"],
  "请求中的更新": ["Новое событие", "New development"], "报道摘要": ["Описание публикации", "Report summary"],
  "推荐理由": ["Рекомендация", "Recommendation"], "日报头条": ["Главная новость дня", "Daily headline"],
  "日报导语": ["Введение в обзор дня", "Daily introduction"], "分节摘要": ["Описание раздела", "Section summary"],
  "旧的引用摘要": ["Старое описание ссылки", "Original citation summary"], "一周头条": ["Главная новость недели", "Weekly headline"],
  "一周概览": ["Обзор недели", "Weekly overview"], "主题标题": ["Название темы", "Theme heading"],
  "主题综述": ["Обзор темы", "Theme summary"], "更新头条": ["Обновлённая главная новость", "Updated headline"],
  "请求中再更新": ["Последняя главная новость", "Latest headline"],
  "历史引用标题": ["Архивная публикация", "Archived citation"], "历史引用摘要": ["Описание архива", "Archived summary"],
  "无标识引用标题": ["Публикация без идентификатора", "Citation without identifier"],
  "旧分类标题": ["Архивный раздел", "Archive section"], "历史快讯": ["Архивная короткая новость", "Archived flash"],
};
function translate(value: any, locale: "ru" | "en"): any {
  if (typeof value === "string") {
    if (!value) return value;
    const source = value.endsWith(` ${T}`) ? value.slice(0, -T.length - 1) : value;
    const fields = translations[source];
    if (fields) return fields[locale === "ru" ? 0 : 1];
    if (source.startsWith("事件")) return `${locale === "ru" ? "Событие" : "Event"} ${source.slice(2)}`;
    if (source.startsWith("报道")) return `${locale === "ru" ? "Публикация" : "Report"} ${source.slice(2)}`;
    throw new Error(`测试缺少目标语言译文：${value}`);
  }
  if (Array.isArray(value)) return value.map((v) => translate(v, locale));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, key === "public_id" ? item : translate(item, locale)]));
  return value;
}
const provider = await stub(async (_hit, req) => {
  const { items } = JSON.parse(JSON.parse(req.body).messages[1].content);
  const hook = onRequest;
  onRequest = null;
  if (hook) await hook();
  return { choices: [{ message: { content: JSON.stringify({ items: [null, ...items.map(({ id, targetLocales: _targetLocales, ...fields }: any) => ({
    id, ...(partial ? {} : { ru: translate(fields, "ru") }), en: translate(fields, "en"),
  }))] }) } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } };
});
process.env.LOCALIZE_MODEL = "deepseek-flash";
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = "test-key";
after(async () => {
  const ids = [dailyId, "weekly:2098-W39", "monthly:2098-09", "daily:2098-09-29", "daily:2020-01-02"];
  await sql`DELETE FROM localizations WHERE kind = 'report' AND ref_id = ANY(${ids}::text[])`;
  await sql`DELETE FROM reports WHERE kind || ':' || key = ANY(${ids}::text[])`;
  await provider.close(); await stopBoss(); await closeDb();
});

async function seedStory(index: string, at = new Date()) {
  const publicId = randomUUID();
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id,title,summary,digest,latest,latest_at)
    VALUES (${publicId}, ${`事件${index}`}, '事件摘要', '事件综述', '最近进展', ${at}) RETURNING id`;
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id,story_id,title)
    VALUES (${`fact-${T}-${index}`}, ${story!.id}, '进展标题') RETURNING id`;
  const { articleId } = await upsertMaterial({ sourceId: source, url: `https://example.com/${T}/${index}`, title: `报道${index}`,
    language: "zh", bodyText: "正文", bodyStatus: "ok", via: "fetch" });
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,title_zh,summary_zh,reason_zh,score,selected)
    VALUES (${articleId},1,'rule','pass',${`报道${index}`},'报道摘要','推荐理由',90,true)`;
  await publishArticle(articleId);
  await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${articleId},'primary')`;
  await sql`UPDATE publications SET story_id = ${story!.id}, fact_id = ${fact!.id}, visible_after = now() - interval '1 hour' WHERE article_id = ${articleId}`;
  return { publicId, storyId: story!.id, factId: fact!.id, articleId };
}

let first: Awaited<ReturnType<typeof seedStory>>;
test("事件仅翻公开未合并快照，保留部分语言、复用回执并覆盖摘要和进展标题", async () => {
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
    VALUES (${source},'本地化测试','rss','T1','editorial','2100-01-01')`;
  first = await seedStory("first", new Date("2020-01-01"));
  const hidden = await seedStory("hidden");
  const merged = await seedStory("merged");
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${hidden.articleId}`;
  await sql`UPDATE stories SET merged_into = ${first.storyId} WHERE id = ${merged.storyId}`;
  partial = true;
  assert.equal((await localizePendingStories({ storyIds: [first.publicId, hidden.publicId, merged.publicId] })).stored, 1);
  const fallback = (await localizedStoryTexts([first.publicId], "ru")).get(first.publicId)!;
  assert.equal(fallback.title, "事件first");
  assert.equal(fallback.summary, "事件摘要");
  assert.equal(fallback.developments[0]!.title, "进展标题");
  partial = false;
  const before = provider.hits();
  assert.equal((await localizePendingStories({ storyIds: [first.publicId] })).stored, 2);
  assert.equal(provider.hits(), before + 1);
  assert.equal((await localizePendingStories({ storyIds: [first.publicId] })).stored, 0);
  await sql`DELETE FROM localizations WHERE kind = 'story' AND ref_id = ${first.publicId}`;
  assert.equal((await localizePendingStories({ storyIds: [first.publicId] })).stored, 2);
  assert.equal(provider.hits(), before + 1);
  const detail = await loadStoryDetail(first.storyId, new Date(), "ru");
  assert.equal(detail?.title, "Событие first");
  assert.equal(detail?.summary, "Описание события");
  assert.equal(detail?.developments[0]?.title, "Развитие события");
  assert.equal((await v1Story(first.storyId, "ru"))?.story.digest, "Обзор события");
  const expanded = await loadDevelopments({ storyPublicId: first.publicId, locale: "ru", channel: "all", category: null,
    tag: null, topicTags: null, cursor: null, take: 5, revision: null });
  assert.equal(expanded.kind === "ok" && expanded.body.story.title, "Событие first");
  assert.equal(expanded.kind === "ok" && expanded.body.developments[0]?.title, "Развитие события");
  const item = await loadItemDetail(first.articleId, new Date(), "ru");
  assert.equal(item.kind === "found" && item.detail.story?.title, "Событие first");
  assert.equal(item.kind === "found" && item.detail.relatedStories[0]?.title, "Событие first");
  const [snapshot] = await storySources(sql, { ids: [first.publicId] });
  const [stored] = await sql<{ source_hash: string }[]>`SELECT source_hash FROM localizations WHERE kind = 'story' AND ref_id = ${first.publicId} LIMIT 1`;
  assert.equal(stored?.source_hash, snapshot?.source_hash);
});

test("事件的摘要、进展变化让旧译文失效；模型返回前源文变化或撤回不会保存旧快照", async () => {
  await sql`UPDATE stories SET summary = '更新摘要' WHERE id = ${first.storyId}`;
  assert.equal((await localizedStoryTexts([first.publicId], "ru")).get(first.publicId)?.summary, "更新摘要");
  assert.equal((await localizePendingStories({ storyIds: [first.publicId] })).stored, 2);
  await sql`UPDATE facts SET title = '更新进展' WHERE id = ${first.factId}`;
  assert.equal((await localizedStoryTexts([first.publicId], "ru")).get(first.publicId)?.title, "事件first");
  onRequest = async () => { await sql`UPDATE facts SET title = '请求中的更新' WHERE id = ${first.factId}`; };
  assert.equal((await localizePendingStories({ storyIds: [first.publicId] })).stored, 0);
  assert.equal((await localizedStoryTexts([first.publicId], "ru")).get(first.publicId)?.developments[0]?.title, "请求中的更新");
  onRequest = async () => { await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${first.articleId}`; };
  assert.equal((await localizePendingStories({ storyIds: [first.publicId] })).stored, 0);
  assert.equal((await localizePendingStories({ storyIds: [first.publicId] })).batches, 0);
  await sql`UPDATE publications SET visibility = 'public' WHERE article_id = ${first.articleId}`;
});

const dailyKey = "2098-09-30";
const dailyId = `daily:${dailyKey}`;
let dailyContent: Record<string, any>;
test("日报、周报、月报翻译快照读者文字，分类来自 taxonomy", async () => {
  await localizePending({ articleIds: [first.articleId] });
  dailyContent = { date: dailyKey, lead: { title: "日报头条", leadParagraph: "日报导语" },
    sections: [{ label: "实践与教程", summary: "分节摘要", items: [{ itemId: first.articleId, title: "报道first", summary: `旧的引用摘要 ${T}`, sourceName: "信源", sourceUrl: "https://example.com/original" }] }],
    flashes: [{ itemId: first.articleId, title: "报道first", sourceName: "信源", sourceUrl: "https://example.com/original" }],
    metrics: { totalEvents: 1 } };
  const periodic = { title: `${SITE.name} 周报 · 2098-W39`, headline: "一周头条", overview: "一周概览", themes: [{ heading: "主题标题", summary: "主题综述", storyRefs: dailyContent.sections[0].items }], storyOrder: [first.articleId], metrics: { totalStories: 1 } };
  for (const [kind, key, content] of [["daily", dailyKey, dailyContent], ["weekly", "2098-W39", periodic], ["monthly", "2098-09", periodic]] as const) {
    await sql`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at)
      VALUES (${kind},${key},'2098-09-01','2098-10-01',${sql.json(content)},now())`;
  }
  const ids = [dailyId, "weekly:2098-W39", "monthly:2098-09"];
  partial = true;
  assert.equal((await localizePendingReports({ reportIds: ids })).stored, 3);
  assert.equal((await loadReport("daily", dailyKey, "ru"))?.lead?.title, "日报头条");
  partial = false;
  assert.equal((await localizePendingReports({ reportIds: ids })).stored, 6);
  const report = await loadReport("daily", dailyKey, "ru");
  assert.equal(report?.lead?.title, "Главная новость дня");
  assert.equal(report?.sections[0]?.label, "Практика и руководства");
  assert.equal(report?.sections[0]?.summary, "Описание раздела");
  assert.equal(report?.sections[0]?.items[0]?.title, "Публикация first");
  assert.equal(report?.sections[0]?.items[0]?.summary, "Старое описание ссылки");
  assert.equal(report?.flashes[0]?.title, "Публикация first");
  assert.deepEqual(report?.metrics, { totalEvents: 1 });
  assert.equal((await loadReport("weekly", "2098-W39", "ru"))?.sections[0]?.label, "Название темы");
  assert.equal((await loadReport("monthly", "2098-09", "en"))?.overview, "Weekly overview");
  const daily = await v1Daily(dailyKey, "ru");
  assert.equal(daily?.report.sections[0]?.items[0]?.title, "Публикация first");
  assert.ok(daily?.report.links.aihot.includes(`/ru/daily/${dailyKey}`));
  assert.equal((await reportIndexRows("daily", 1, "ru"))[0]?.content.lead.title, "Главная новость дня");
  const [ru, en, zh] = await Promise.all([reportIndex("daily", "ru"), reportIndex("daily", "en"), reportIndex("daily", "zh")]);
  assert.equal(ru.rows[0]?.content.lead.title, "Главная новость дня");
  assert.equal(en.rows[0]?.content.lead.title, "Daily headline");
  assert.equal(zh.rows[0]?.content.lead.title, "日报头条");
  const before = provider.hits();
  await sql`DELETE FROM localizations WHERE kind = 'report' AND ref_id = ANY(${ids}::text[])`;
  assert.equal((await localizePendingReports({ reportIds: ids })).stored, 6);
  assert.equal(provider.hits(), before);
  await sql`UPDATE publications SET reason = '更正推荐理由' WHERE article_id = ${first.articleId}`;
  assert.equal((await loadReport("daily", dailyKey, "ru"))?.sections[0]?.items[0]?.title, "Публикация first");
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${first.articleId}`;
  assert.equal((await loadReport("daily", dailyKey, "ru"))?.sections[0]?.items[0]?.available, false);
  assert.equal((await v1Daily(dailyKey, "ru"))?.report.sections[0]?.items.length, 0);
  await sql`UPDATE publications SET visibility = 'public' WHERE article_id = ${first.articleId}`;
});

test("报刊 hash 只含中文文案；指标排序链接不触发重译，文字变更与写前锁检查使旧译文失效", async () => {
  const changed = structuredClone(dailyContent);
  changed.metrics.totalEvents = 999;
  changed.sections[0].items[0].sourceUrl = "https://example.com/changed";
  changed.highlights = [first.articleId];
  assert.equal(reportSourceHash(dailyContent), reportSourceHash(changed));
  await sql`UPDATE reports SET content = ${sql.json(changed)} WHERE kind = 'daily' AND key = ${dailyKey}`;
  assert.equal((await localizePendingReports({ reportIds: [dailyId] })).batches, 0);
  changed.lead.title = "更新头条";
  await sql`UPDATE reports SET content = ${sql.json(changed)} WHERE kind = 'daily' AND key = ${dailyKey}`;
  assert.equal((await loadReport("daily", dailyKey, "ru"))?.lead?.title, "更新头条");
  onRequest = async () => {
    changed.lead.title = "请求中再更新";
    await sql`UPDATE reports SET content = ${sql.json(changed)} WHERE kind = 'daily' AND key = ${dailyKey}`;
  };
  assert.equal((await localizePendingReports({ reportIds: [dailyId] })).stored, 0);
  assert.equal((await loadReport("daily", dailyKey, "ru"))?.lead?.title, "请求中再更新");
  assert.equal((await localizePendingReports({ reportIds: [dailyId] })).stored, 2);
  const before = provider.hits();
  await sql`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at)
    VALUES ('daily','2098-09-29','2098-09-28','2098-09-29',${sql.json({ lead: null, sections: [], flashes: [], metrics: {} })},now())`;
  assert.equal((await localizePendingReports({ reportIds: ["daily:2098-09-29"] })).batches, 0);
  assert.equal(provider.hits(), before);
  assert.equal((await localizePendingReports({ reportIds: [dailyId], budgetMs: 0 })).batches, 0);
});

test("结构校验拒绝丢失进展、空有效文案、额外字段及模型修改空字段", () => {
  const story = { title: "事件", summary: "摘要", digest: null, latest: null, developments: [{ public_id: "stable-fact", title: "发展" }] };
  assert.equal(validStoryFields({ ...story, developments: [] }, story), null);
  assert.equal(validStoryFields({ ...story, summary: "" }, story), null);
  assert.equal(validStoryFields({ ...story, extra: "新增" }, story), null);
  assert.equal(validStoryFields({ ...story, digest: "凭空补充" }, story), null);
  assert.equal(hasReportProse({ title: "独立读者标题" }), true);
  assert.equal(hasReportProse({ title: `${SITE.name} 周报 · 2098-W39` }), false);
  const prose = reportProse(dailyContent);
  assert.equal(validReportFields({ ...prose, sections: [] }, prose), null);
  assert.equal(validReportFields({ ...prose, lead: { title: "", leadParagraph: "导语" } }, prose), null);
});

test("历史报刊翻译无标识和失联引用，只有引用文字也进入补译", async () => {
  const key = "2020-01-02";
  const content = { sections: [{ label: "旧分类标题", items: [
    { itemId: `missing-${T}`, title: "历史引用标题", summary: `历史引用摘要 ${T}` },
    { title: "无标识引用标题", sourceUrl: "https://example.com/archive" },
  ] }], flashes: [{ title: "历史快讯" }], metrics: { totalEvents: 2 } };
  await sql`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at)
    VALUES ('daily',${key},'2019-12-31','2020-01-01',${sql.json(content)},'2020-01-01')`;
  assert.equal((await localizePendingReports({ reportIds: [`daily:${key}`] })).stored, 2);
  const report = await loadReport("daily", key, "ru");
  assert.equal(report?.sections[0]?.label, "Архивный раздел");
  assert.equal(report?.sections[0]?.items[0]?.title, "Архивная публикация");
  assert.equal(report?.sections[0]?.items[0]?.summary, "Описание архива");
  assert.equal(report?.sections[0]?.items[1]?.title, "Публикация без идентификатора");
  assert.equal(report?.sections[0]?.items[1]?.sourceUrl, "https://example.com/archive");
  assert.equal(report?.flashes[0]?.title, "Архивная короткая новость");
});

test("同哈希的事件坏字段重新补译，并复用已有完整回执", async () => {
  const event = await seedStory("corrupt", new Date("2020-01-01"));
  assert.equal((await localizePendingStories({ storyIds: [event.publicId] })).stored, 2);
  const before = provider.hits();
  await sql`UPDATE localizations SET fields = jsonb_set(fields, '{summary}', '""'::jsonb)
    WHERE kind = 'story' AND ref_id = ${event.publicId} AND locale = 'ru'`;
  assert.equal((await localizePendingStories({ storyIds: [event.publicId] })).stored, 2);
  assert.equal((await localizedStoryTexts([event.publicId], "ru")).get(event.publicId)?.summary, "Описание события");
  assert.equal(provider.hits(), before);
});

test("同哈希的报刊坏字段重新补译，并复用已有完整回执", async () => {
  const before = provider.hits();
  await sql`UPDATE localizations SET fields = jsonb_set(fields, '{lead,title}', '""'::jsonb)
    WHERE kind = 'report' AND ref_id = ${dailyId} AND locale = 'ru'`;
  assert.equal((await localizePendingReports({ reportIds: [dailyId] })).stored, 2);
  assert.equal((await loadReport("daily", dailyKey, "ru"))?.lead?.title, "Последняя главная новость");
  assert.equal(provider.hits(), before);
});

test("收到完整事件翻译后停机仍保存当前批次并完成回执，后续批次停止", async () => {
  const one = await seedStory("shutdown-one");
  const two = await seedStory("shutdown-two");
  onRequest = async () => { shutdownSignal.abort(); };
  const result = await localizePendingStories({ storyIds: [one.publicId, two.publicId], batch: 1 });
  assert.equal(result.stored, 2);
  assert.equal(result.batches, 1);
  const receipts = await sql<{ status: string }[]>`SELECT DISTINCT r.status FROM localizations l JOIN receipts r ON r.id = l.receipt_id
    WHERE l.kind = 'story' AND l.ref_id = ANY(${[one.publicId, two.publicId]}::text[])`;
  assert.deepEqual(receipts.map((r) => r.status), ["completed"]);
});
