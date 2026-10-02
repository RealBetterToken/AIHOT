import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasReportProse, localizedStoryTexts, localizeReportRows, reportProse, reportSourceHash, validReportFields, validStoryFields,
} from "@aihot/backend/publication/localized-story-report";

const story = {
  public_id: "story-fixture", source_hash: "story-hash", title: "中文事件", summary: "中文摘要",
  digest: null, latest: null, developments: [{ public_id: "fact-fixture", title: "中文进展" }],
};

test("俄语事件缺译时不显示英文事件译文", async () => {
  const db = Object.assign(async (query: TemplateStringsArray) => query.join("").includes("FROM stories") ? [story] : [{
    ref_id: story.public_id, locale: "en", source_hash: story.source_hash,
    fields: { title: "English event", summary: "English summary", digest: null, latest: null,
      developments: [{ public_id: "fact-fixture", title: "English development" }] },
  }], { array: (values: unknown) => values });
  const out = await localizedStoryTexts([story.public_id], "ru", db as never);
  assert.equal(out.get(story.public_id)?.title, "中文事件");
});

const report = {
  kind: "daily" as const, key: "2020-01-01", content: {
    lead: { title: "中文头条", leadParagraph: "中文导语" },
    sections: [{ label: "旧分类标题", summary: "分节摘要", items: [
      { title: "无标识引用标题", summary: "无标识引用摘要", sourceUrl: "https://example.org/old" },
      { itemId: "missing-article", title: "失联引用标题", summary: null },
    ] }],
    flashes: [{ title: "快讯标题", sourceName: "原信源" }],
    metrics: { count: 3 },
  },
};

test("俄语报刊缺译时不显示英文导语", async () => {
  const db = Object.assign(async () => [{ ref_id: "daily:2020-01-01", locale: "en", source_hash: reportSourceHash(report.content),
    fields: { ...reportProse(report.content), lead: { title: "English lead", leadParagraph: "English introduction" } },
  }], { array: (values: unknown) => values });
  const out = await localizeReportRows([report], "ru", db as never);
  assert.equal(out[0]?.content.lead.title, "中文头条");
});

test("报刊快照的引用标题和摘要变化使译文失效，链接和指标变化保留译文", () => {
  const title = structuredClone(report.content);
  title.sections[0]!.items[0]!.title = "更正引用标题";
  assert.notEqual(reportSourceHash(report.content), reportSourceHash(title));
  const summary = structuredClone(report.content);
  summary.sections[0]!.items[0]!.summary = "更正引用摘要";
  assert.notEqual(reportSourceHash(report.content), reportSourceHash(summary));
  const metadata = structuredClone(report.content);
  metadata.sections[0]!.items[0]!.sourceUrl = "https://example.org/changed";
  metadata.metrics.count = 99;
  assert.equal(reportSourceHash(report.content), reportSourceHash(metadata));
});

test("只有引用卡片的历史报刊仍需要本地化", () => {
  assert.equal(hasReportProse({ sections: [{ label: "tip", items: [{ title: "历史报道", summary: "历史摘要" }] }] }), true);
});

test("报刊译文覆盖无标识和失联引用，保持快照元数据", async () => {
  const fields = {
    title: null, headline: null, overview: null, lead: { title: "Русская новость", leadParagraph: "Русское введение" },
    themes: [], sections: [{ label: "Старая рубрика", summary: "Краткое изложение", items: [
      { title: "Новость без идентификатора", summary: "Изложение новости" }, { title: "Архивная новость", summary: null },
    ] }], flashes: [{ title: "Короткая новость", summary: null }],
  };
  const db = Object.assign(async () => [{ ref_id: "daily:2020-01-01", locale: "ru", source_hash: reportSourceHash(report.content), fields }],
    { array: (values: unknown) => values });
  const out = (await localizeReportRows([report], "ru", db as never))[0]!.content;
  assert.equal(out.sections[0].label, "Старая рубрика");
  assert.equal(out.sections[0].items[0].title, "Новость без идентификатора");
  assert.equal(out.sections[0].items[0].summary, "Изложение новости");
  assert.equal(out.sections[0].items[0].sourceUrl, "https://example.org/old");
  assert.equal(out.sections[0].items[1].title, "Архивная новость");
  assert.equal(out.sections[0].items[1].itemId, "missing-article");
  assert.equal(out.flashes[0].title, "Короткая новость");
  assert.equal(out.flashes[0].sourceName, "原信源");
  assert.deepEqual(out.metrics, { count: 3 });
});

test("报刊译文漏引用或清空引用摘要时拒绝整份译文", () => {
  const source = reportProse(report.content);
  const omitted = { ...source, sections: source.sections.map((section) => ({ ...section, items: [] })) };
  assert.equal(validReportFields(omitted, source), null);
});

test("事件和报刊的目标译文不能直接照抄中文", () => {
  const { public_id: _id, source_hash: _hash, ...fields } = story;
  assert.equal(validStoryFields(fields, fields, "ru"), null);
  const source = reportProse(report.content);
  assert.equal(validReportFields(source, source, "en"), null);
});
