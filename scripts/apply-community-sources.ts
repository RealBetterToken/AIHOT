// 应用社区接入与信源精简，保留历史文章；普通 seed 不覆盖后台设置。
// 先预览：node scripts/apply-community-sources.ts
// 再应用：node --env-file=.env scripts/apply-community-sources.ts --apply
import { readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--apply")) throw new Error("用法：apply-community-sources.ts [--apply]");

const { sources } = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../industry/sources.json"), "utf8")) as {
  sources: Array<{ id: string; name: string; kind: string; config: Record<string, unknown>; enabled?: boolean }>;
};
const paused = sources.filter((source) => source.enabled === false);
// 只刷新本轮实际修正过的社区入口；其余后台配置继续保留。
const refreshedIds = new Set([
  "json-hn-coding-agent-discussion", "json-hn-ai-code-review-discussion", "json-hn-context-engineering-discussion",
  "json-hn-harness-engineering-discussion", "json-hn-vibecoding", "rss-reddit-claudecode",
]);
const refreshed = sources.filter((source) => refreshedIds.has(source.id));
for (const source of paused) console.log(`暂停 ${source.id}：${source.name}`);
for (const source of refreshed) console.log(`更新 ${source.id}：${JSON.stringify({ name: source.name, config: source.config })}`);

if (!args.includes("--apply")) {
  console.log(`预览：暂停 ${paused.length} 个信源、更新 ${refreshed.length} 个社区入口；未连接数据库。加 --apply 应用。`);
} else {
  const { sql, closeDb } = await import("@aihot/backend/db");
  const { updateSource } = await import("@aihot/backend/admin/sources");
  try {
    const targets = sources.filter((source) => source.enabled === false || refreshedIds.has(source.id));
    const rows = await sql<Array<{ id: string; name: string; kind: string; config: Record<string, unknown>; enabled: boolean; updated_at: Date }>>`
      SELECT id, name, kind, config, enabled, updated_at FROM sources WHERE id IN ${sql(targets.map((source) => source.id))}`;
    let changed = 0;
    for (const source of targets) {
      const row = rows.find((row) => row.id === source.id);
      if (!row) {
        console.log(`${source.id}：数据库中不存在，跳过`);
        continue;
      }
      const patch: { enabled?: boolean; name?: string; config?: Record<string, unknown> } = {};
      if (source.enabled === false && row.enabled) patch.enabled = false;
      if (refreshedIds.has(source.id)) {
        if (row.kind !== source.kind) throw new Error(`${source.id}：数据库信源类型与配置不同，请在后台核对`);
        if (row.name !== source.name) patch.name = source.name;
        if (!isDeepStrictEqual(row.config, source.config)) patch.config = source.config;
      }
      if (!Object.keys(patch).length) continue;
      await updateSource(source.id, {
        patch,
        version: new Date(row.updated_at).toISOString(),
        reason: "Vibe Coding 实践与程序员社区优先，暂停泛搜索、综合频道、重复、推广偏多或不可验证的入口，修正社区采集地址与字段",
      }, "ops-script");
      changed += 1;
    }
    console.log(`已更新 ${changed} 个信源，历史内容保留，调整已写入审计记录。`);
  } finally {
    await closeDb();
  }
}
