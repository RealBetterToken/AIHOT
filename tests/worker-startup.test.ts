import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { enqueue, stopBoss } from "@aihot/backend/jobs/queue";

after(async () => { await stopBoss(); await closeDb(); });

test("真实 worker 启动后会消费正文抽取队列，无需开启采集或模型", async () => {
  const token = tag();
  const sourceId = `test-worker-start-${token}`;
  const queue = `test-worker-extract-${token}`;
  const paragraph = "编码助手生成的修改需要独立检查。开发者先抽取文章正文，再判断其中的工程实践是否值得阅读。";
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<html><head><title>正文抽取回归</title></head><body><article><h1>正文抽取回归</h1>${Array.from({ length: 8 }, () => `<p>${paragraph}</p>`).join("")}</article></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/article`;
  let child: ReturnType<typeof spawn> | undefined;
  let ended: Promise<unknown> | undefined;
  let stderr = "";
  try {
    await sql`INSERT INTO sources (id,name,kind,participation_mode,config,enabled,next_fetch_at)
      VALUES (${sourceId},'正文抽取回归','rss','editorial',${sql.json({ fetchPublicContent: true })},false,'2100-01-01')`;
    const { articleId } = await upsertMaterial({ sourceId, url, title: "正文抽取回归", bodyStatus: "pending", via: "fetch" });
    await enqueue(queue, { articleId }, { singletonKey: articleId });
    // 隔离所有队列和定时任务；网络仅允许本地正文服务，不替换业务处理函数。
    const script = `
      import { Agent, buildConnector, setGlobalDispatcher } from 'undici';
      import { QUEUES, getBoss } from '@aihot/backend/jobs/queue';
      import { SCHEDULES } from './apps/worker/src/schedules.ts';
      const fixture = new URL(${JSON.stringify(url)});
      const connect = buildConnector({});
      setGlobalDispatcher(new Agent({ connect(options, callback) {
        if (options.hostname !== fixture.hostname || String(options.port) !== fixture.port) {
          callback(new Error('测试禁止访问正文服务以外的地址'), null);
          return;
        }
        connect(options, callback);
      } }));
      const prefix = ${JSON.stringify(`test-worker-${token}-`)};
      for (const key of Object.keys(QUEUES)) QUEUES[key] = prefix + QUEUES[key];
      QUEUES.extractBody = ${JSON.stringify(queue)};
      for (const schedule of SCHEDULES) {
        schedule.name = prefix + schedule.name;
        schedule.cron = '0 0 1 1 *';
        schedule.missed = 'skip';
      }
      const boss = await getBoss();
      const send = boss.send.bind(boss);
      boss.send = (name, ...args) => send(name.startsWith('cron.') && !name.startsWith('cron.' + prefix) ? 'cron.' + prefix + name.slice(5) : name, ...args);
      const getSchedules = boss.getSchedules.bind(boss);
      boss.getSchedules = async (...args) => (await getSchedules(...args)).filter((entry) => entry.name.startsWith('cron.' + prefix));
      await import('./apps/worker/src/main.ts');
    `;
    child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "test", COLLECT_ENABLED: "false", MODEL_CALLS_ENABLED: "false",
        FEISHU_CONTENT_PUSH_ENABLED: "false", FEISHU_INTERNAL_ENABLED: "false", INDEXNOW_SUBMIT_ENABLED: "false",
        ALLOW_PRIVATE_NETWORK_FETCH: "true", EGRESS_PROXY_URL: "", ANALYZE_CONCURRENCY: "1",
        MODEL_CONFIG_FILE: "/nonexistent-test-models", AIHOT_CREDENTIALS_DIR: "/nonexistent-test-credentials" },
      stdio: ["ignore", "ignore", "pipe"],
    });
    ended = once(child, "exit");
    child.stderr!.on("data", (chunk) => { stderr += chunk.toString(); });
    let row: { body_status: string; body_text: string | null } | undefined;
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      [row] = await sql<Array<{ body_status: string; body_text: string | null }>>`SELECT body_status,body_text FROM articles WHERE id=${articleId}`;
      if (row?.body_status === "ok" || child.exitCode !== null) break;
      await delay(100);
    }
    assert.equal(row?.body_status, "ok", `worker 未抽取排队正文：${stderr}`);
    assert.ok(row?.body_text?.includes(paragraph), "抽取的是文章正文");
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      const timer = setTimeout(() => child?.kill("SIGKILL"), 8_000);
      try { await ended; } finally { clearTimeout(timer); }
    }
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
