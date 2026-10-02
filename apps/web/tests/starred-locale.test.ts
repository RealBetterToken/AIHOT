import assert from "node:assert/strict";
import { test } from "node:test";
import { exportBundle, getStarred, importBundle, toggleStar } from "../app/lib/local-state.ts";

test("收藏的语言在保存、读取和备份导入导出时保留，旧记录与无效值兼容", () => {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } } });
  try {
    const saved = { id: "new", title: "Russian title", summary: null, sourceName: "Source", publishedAt: null, score: null, aiSelected: false, textLocale: "ru" as const };
    toggleStar(saved);
    assert.equal((getStarred()[0] as { textLocale?: string }).textLocale, "ru");
    const payload = exportBundle();
    assert.equal((payload.starred[0] as { textLocale?: string }).textLocale, "ru");
    importBundle(JSON.stringify({ version: 1, starred: [{ ...saved, id: "legacy", textLocale: undefined }, { ...saved, id: "invalid", textLocale: "xx" }, { ...saved, id: "imported", textLocale: "en" }], read: [], theme: null }));
    const byId = Object.fromEntries(getStarred().map((entry) => [entry.id, entry])) as Record<string, { title: string; textLocale?: string }>;
    assert.equal(byId.imported?.textLocale, "en");
    assert.equal(byId.legacy?.title, "Russian title");
    assert.equal(byId.legacy?.textLocale, undefined);
    assert.equal(byId.invalid?.textLocale, undefined);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
