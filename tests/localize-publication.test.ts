import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { articleSourceHash, refreshLocalizedSearch } from "@aihot/backend/publication/localized";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const SOURCE = `test-localize-publication-${T}`;
const app = await buildApp();
let seq = 0;
before(async () => {
  await sql`UPDATE selected_ledger SET visible_at = now() WHERE visible_at > now()`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
    VALUES (${SOURCE}, 'Localize publication', 'rss', 'T1', 'editorial', '2100-01-01')`;
});
after(async () => { await app.close(); await stopBoss(); await closeDb(); });

async function article(selected = true) {
  const n = ++seq;
  const { articleId: id } = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/localize-${T}-${n}`, title: `Original ${T}-${n}`,
    bodyText: `Material ${T}-${n}`, bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  });
  const copy = { title: `中文标题${T}-${n}`, summary: `中文摘要${T}-${n}`, reason: "中文理由" };
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
    VALUES (${id}, 1, 'rule', 'pass', 'release', ${copy.title}, ${copy.summary}, ${copy.reason}, 90, ${selected})`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
  const fields = { title: `Русский заголовок ${T}-${n}`, summary: "Русское описание", reason: "Причина" };
  await sql`INSERT INTO localizations (kind, ref_id, locale, source_hash, fields)
    VALUES ('article', ${id}, 'ru', ${articleSourceHash(copy)}, ${sql.json(fields)})`;
  return { id, copy, fields };
}

const get = (url: string, headers: Record<string, string> = {}) => app.inject({ method: "GET", url, headers });

test("v1 and site cards use Russian while Chinese remains the default and ETags vary", async () => {
  const a = await article();
  const russian = await get("/api/v1/items?lang=ru&limit=100");
  assert.equal(russian.statusCode, 200);
  assert.equal(russian.json().items.find((i: any) => i.id === a.id).title, a.fields.title);
  assert.equal(russian.json().items.find((i: any) => i.id === a.id).reason, a.fields.reason);
  const chinese = await get("/api/v1/items?limit=100", { "if-none-match": String(russian.headers.etag) });
  assert.equal(chinese.statusCode, 200);
  assert.equal(chinese.json().items.find((i: any) => i.id === a.id).title, a.copy.title);
  assert.notEqual(chinese.headers.etag, russian.headers.etag);
  assert.equal((await get(`/api/site/items/${a.id}?lang=ru`)).json().title, a.fields.title);
  assert.equal((await get("/api/site/timeline?lang=ru&limit=40")).json().cards.find((c: any) => c.item.id === a.id).item.title, a.fields.title);
  assert.equal((await get("/api/site/pool?lang=ru")).json().items.find((i: any) => i.id === a.id).title, a.fields.title);
  assert.equal((await get("/api/v1/items?lang=de")).statusCode, 400);
});

test("未入选文章按数据库原始理由校验哈希，公开投影继续隐藏理由", async () => {
  const a = await article(false);
  const rawReason = "不公开的理由";
  await sql`UPDATE publications SET reason = ${rawReason} WHERE article_id = ${a.id}`;
  await sql`UPDATE localizations SET source_hash = ${articleSourceHash({ ...a.copy, reason: rawReason })}
    WHERE kind = 'article' AND ref_id = ${a.id}`;
  const item = (await get("/api/v1/items?mode=all&lang=ru&limit=100")).json().items.find((i: any) => i.id === a.id);
  assert.equal(item.title, a.fields.title);
  assert.equal(item.reason, null);
  const detail = (await get(`/api/site/items/${a.id}?lang=ru`)).json();
  assert.equal(detail.title, a.fields.title);
  assert.equal(detail.reason, null);
});

test("localized snapshots and changes keep the Chinese ledger, cursors and minimal projection", async () => {
  const start = (await get("/api/v1/selected/snapshot?limit=1000")).json();
  const a = await article();
  const chinese = (await get("/api/v1/selected/snapshot?limit=1000")).json();
  const russian = (await get("/api/v1/selected/snapshot?lang=ru&limit=1000")).json();
  assert.equal(russian.items.find((i: any) => i.id === a.id).title, a.fields.title);
  assert.equal(russian.cursor, chinese.cursor);
  const minimal = (await get("/api/v1/selected/snapshot?lang=ru&fields=minimal&limit=1000")).json().items.find((i: any) => i.id === a.id);
  assert.equal(minimal.title, a.fields.title);
  assert.ok(!("summary" in minimal) && !("reason" in minimal));
  const changes = (await get(`/api/v1/selected/changes?lang=ru&cursor=${encodeURIComponent(start.cursor)}`)).json();
  assert.equal(changes.changes.find((c: any) => c.op === "upsert" && c.item.id === a.id).item.title, a.fields.title);
  const [ledger] = await sql<{ payload: { title: string } }[]>`SELECT payload FROM selected_ledger WHERE article_id = ${a.id} ORDER BY seq DESC LIMIT 1`;
  assert.equal(ledger!.payload.title, a.copy.title);
});

test("RSS localizes cards, declares its language and keeps a language-specific self link", async () => {
  const a = await article();
  const response = await get("/feed.xml?lang=ru");
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes(a.fields.title));
  assert.ok(response.body.includes("<language>ru</language>"));
  assert.ok(response.body.includes("/feed.xml?lang=ru"));
});

test("story reports and group expansions localize articles while event prose stays Chinese", async () => {
  const a = await article();
  const publicId = randomUUID();
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title, first_report_at, latest_at)
    VALUES (${publicId}, '中文事件', now(), now()) RETURNING id`;
  const factId = `fact-localize-${T}-${seq}`;
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title) VALUES (${factId}, ${story!.id}, '中文进展') RETURNING id`;
  await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${fact!.id}, ${a.id}, 'primary')`;
  await publishArticle(a.id);
  const event = (await get(`/api/site/stories/${publicId}?lang=ru`)).json();
  assert.equal(event.title, "中文事件");
  assert.equal(event.timeline.find((i: any) => i.id === a.id).title, a.fields.title);
  assert.equal((await get(`/api/site/groups/${factId}/reports?lang=ru`)).json().reports[0].title, a.fields.title);
  assert.equal((await get(`/api/site/stories/${publicId}/developments?lang=ru`)).json().developments[0].representative.title, a.fields.title);
  assert.equal((await get(`/api/v1/stories/${publicId}?lang=ru`)).json().story.reports[0].title, a.fields.title);
});

test("重新发布等待本地化事务，不会覆盖刚写入的译文搜索索引", {
  skip: Number(process.env.DATABASE_POOL_MAX || 10) < 3 ? "事务交错测试需要至少三个数据库连接" : false,
}, async () => {
  const a = await article();
  await sql`DELETE FROM localizations WHERE ref_id = ${a.id}`;
  let publishing: Promise<unknown> | undefined;
  try {
    await sql.begin(async (tx) => {
      const [connection] = await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      await tx`SELECT article_id FROM publications WHERE article_id = ${a.id} FOR UPDATE`;
      publishing = publishArticle(a.id);
      let waitingQuery: string | undefined;
      let lastQuery: string | undefined;
      const deadline = Date.now() + 5_000;
      while (!waitingQuery && Date.now() < deadline) {
        // 锁等待和活动查询的统计并非同时更新，等待发布任务真正停在全文读取锁上。
        await sql`SELECT pg_stat_clear_snapshot()`;
        const [waiting] = await sql<{ query: string }[]>`SELECT query FROM pg_stat_activity
          WHERE ${connection!.pid} = ANY(pg_blocking_pids(pid))`;
        lastQuery = waiting?.query;
        if (lastQuery?.includes("FROM publications") && lastQuery.includes("FOR UPDATE")) waitingQuery = lastQuery;
        if (!waitingQuery) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.ok(waitingQuery, lastQuery ?? "publish did not wait for the localization lock");
      await tx`INSERT INTO localizations (kind, ref_id, locale, source_hash, fields)
        VALUES ('article', ${a.id}, 'ru', ${articleSourceHash(a.copy)}, ${tx.json(a.fields)})`;
      await refreshLocalizedSearch(tx, a.id);
    });
  } finally {
    await publishing;
  }
  const [row] = await sql<{ search_text: string; direct: string }[]>`SELECT p.search_text, ps.direct FROM publications p
    JOIN pool_search ps ON ps.article_id = p.article_id WHERE p.article_id = ${a.id}`;
  assert.ok(row!.search_text.includes(a.fields.title.toLowerCase()));
  assert.equal(row!.direct, row!.search_text);
});
