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

test("中文和空列表直接返回，目标语言缺失回退英语，旧哈希回退中文", async () => {
  const rows = [{ id: "a", title: "中文", summary: "摘要", reason: "理由", selected: false }];
  const hash = articleSourceHash(rows[0]!);
  let calls = 0;
  const db = Object.assign(async () => { calls++; return [
    { ref_id: "a", locale: "ru", source_hash: "old", fields: { title: "旧", summary: "旧" } },
    { ref_id: "a", locale: "en", source_hash: hash, fields: { title: "English", summary: "Summary", reason: "" } },
  ]; }, { array: (v: unknown) => v });
  assert.equal(await localizeArticles(rows, "zh", db as never), rows);
  assert.deepEqual(await localizeArticles([], "ru", db as never), []);
  assert.equal(calls, 0);
  const out = await localizeArticles(rows, "ru", db as never);
  assert.equal(out[0]!.title, "English");
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
  assert.deepEqual(out[0], { ...rows[0], title: "Русский", summary: "Описание" });
  assert.deepEqual(out.slice(1), rows.slice(1));
  assert.equal(rows[0]!.title, "中文");
});
