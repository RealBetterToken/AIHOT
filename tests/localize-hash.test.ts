import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { articleSourceHash, localizeArticles } from "@aihot/backend/publication/localized";
import { isLocale, TARGET_LOCALES } from "@aihot/contracts/locale";

test("原始发布文案的哈希保留推荐理由和字段分界", () => {
  const row = { title: "标题", summary: "摘要", reason: "未隐藏的理由" };
  assert.equal(articleSourceHash(row), createHash("md5").update("标题\x1f摘要\x1f未隐藏的理由").digest("hex"));
  assert.notEqual(articleSourceHash(row), articleSourceHash({ ...row, reason: null }));
  assert.equal(isLocale("fa"), false);
  assert.equal(isLocale("de"), false);
  assert.deepEqual(TARGET_LOCALES, ["ru", "en"]);
});

test("目标语言缺失保留源文并标明语言，不借用英文译文", async () => {
  const rows = [{ id: "a", title: "中文", summary: "摘要", reason: "理由", selected: false }];
  const hash = articleSourceHash(rows[0]!);
  let calls = 0;
  const db = Object.assign(async () => { calls++; return [
    { ref_id: "a", locale: "ru", source_hash: "old", fields: { title: "旧", summary: "旧" } },
    { ref_id: "a", locale: "en", source_hash: hash, fields: { title: "English", summary: "Summary", reason: "" } },
  ]; }, { array: (v: unknown) => v });
  assert.equal((await localizeArticles(rows, "zh", db as never))[0]!.title, "中文");
  assert.deepEqual(await localizeArticles([], "ru", db as never), []);
  assert.equal(calls, 0);
  const out = await localizeArticles(rows, "ru", db as never);
  assert.equal(out[0]!.title, "中文");
  assert.equal((out[0] as unknown as { text_locale: string }).text_locale, "zh");
  assert.equal(out[0]!.reason, "理由");
  assert.equal(out[0]!.selected, false);
  assert.equal(rows[0]!.title, "中文");
});

test("有效俄文优先，缺失和过期译文保持中文及其他字段", async () => {
  const rows = [
    { id: "ru", title: "中文", summary: "摘要", reason: null, score: 90 },
    { id: "missing", title: "无译文", summary: "摘要", reason: null, score: 80 },
    { id: "stale", title: "已修改", summary: "摘要", reason: "理由", score: 70 },
  ];
  const db = async () => [
    { ref_id: "ru", locale: "ru", source_hash: articleSourceHash(rows[0]!), fields: { title: "Русский", summary: "Описание", reason: "" } },
    { ref_id: "ru", locale: "en", source_hash: articleSourceHash(rows[0]!), fields: { title: "English", summary: "Summary", reason: "" } },
    { ref_id: "stale", locale: "ru", source_hash: "old", fields: { title: "Старый", summary: "Описание", reason: "Причина" } },
    { ref_id: "stale", locale: "en", source_hash: "old", fields: { title: "Old", summary: "Summary", reason: "Reason" } },
  ];
  const out = await localizeArticles(rows, "ru", db as never);
  assert.deepEqual(out[0], { ...rows[0], title: "Русский", summary: "Описание", text_locale: "ru" });
  assert.deepEqual(out.slice(1), rows.slice(1).map((row) => ({ ...row, text_locale: "zh" })));
  assert.equal(rows[0]!.title, "中文");
});

test("推荐理由缺译时整张卡片保留源语言，避免俄文摘要配中文理由", async () => {
  const row = { id: "reason", title: "中文标题", summary: "中文摘要", reason: "推荐理由" };
  const db = async () => [{ ref_id: row.id, locale: "ru", source_hash: articleSourceHash(row),
    fields: { title: "Русский заголовок", summary: "Описание", reason: "" } }];
  const [out] = await localizeArticles([row], "ru", db as never);
  assert.equal(out!.title, row.title);
  assert.equal((out as unknown as { text_locale: string }).text_locale, "zh");
});

test("同哈希的坏字段不能使公开读取报错，保留源文供后台补译", async () => {
  const row = { id: "malformed", title: "中文标题", summary: "摘要", reason: null };
  for (const fields of [null, [], { title: 42, summary: "Описание", reason: "" }, { title: "中文标题", summary: "摘要", reason: "" }]) {
    const db = async () => [{ ref_id: row.id, locale: "ru", source_hash: articleSourceHash(row), fields }];
    const [out] = await localizeArticles([row], "ru", db as never);
    assert.equal(out!.title, row.title);
  }
});

test("首字母大写的英文标题与摘要不能作为俄文译文",async()=>{
  const row={id:'wrong-language',title:'中文标题',summary:'中文摘要',reason:null};
  const db=async()=>[{ref_id:row.id,locale:'ru',source_hash:articleSourceHash(row),fields:{title:'The Model Follows Your Instructions',summary:'All New Features Are Available Today',reason:null}}];
  const [out]=await localizeArticles([row],'ru',db as never);
  assert.equal(out!.title,row.title);
});

test("无摘要的英文文章标题标注真实语言，也能读取中文标题译文",async()=>{
  const row={id:'title-only',title:'An English Original Article',summary:null,reason:null};
  const db=async()=>[{ref_id:row.id,locale:'zh',source_hash:articleSourceHash(row),fields:{title:'中文文章标题',summary:null,reason:''}}];
  assert.equal((await localizeArticles([row],'en',db as never))[0]!.text_locale,'en');
  assert.equal((await localizeArticles([row],'zh',db as never))[0]!.title,'中文文章标题');
});
