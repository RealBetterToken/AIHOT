import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { localizeArticles, articleSourceHash } from "@aihot/backend/publication/localized";
import { localizePending } from "@aihot/backend/editorial/localize";
import { stopBoss } from "@aihot/backend/jobs/queue";
const T = tag();
const source = `localize-${T}`;
let partial = false;
const provider = await stub((_hit, req) => {
  const { items } = JSON.parse(JSON.parse(req.body).messages[1].content);
  return { choices: [{ message: { content: JSON.stringify({ items: [null, { id: 123 }, ...items.map((r: { id: string }) => ({ id: r.id,
    ru: partial ? { title: "", summary: "" } : { title: "Русский", summary: `Перевод ${T}`, reason: "" },
    en: { title: "English", summary: `translated-${T}`, reason: "" },
  }))] }) } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } };
});

process.env.LOCALIZE_MODEL = "deepseek-flash";
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = "test-key";
after(async () => { await provider.close(); await stopBoss(); await closeDb(); });

test("两篇卡片批量保存四行；搜索刷新、再次发布和中文修改遵守快照哈希", async () => {
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at) VALUES (${source}, '测试', 'rss','T1','editorial','2100-01-01')`;
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    const { articleId } = await upsertMaterial({ sourceId: source, url: `https://example.com/${T}/${i}`, title: `中文标题${T}${i}`, language: 'zh', bodyText: '正文', bodyStatus: 'ok', via: 'fetch', discoveredAt: new Date(Date.now() + 3600000) });
    ids.push(articleId);
    await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,title_zh,summary_zh,reason_zh,score,selected)
      VALUES (${articleId},1,'rule','pass',${`中文标题${T}${i}`},${`中文摘要${T}${i}`},'推荐',90,true)`;
    await publishArticle(articleId);
  }
  const first = await localizePending({ limit: 2 });
  assert.equal(first.stored, 4);
  assert.equal(provider.hits(), 1);
  await sql`DELETE FROM localizations WHERE ref_id = ANY(${ids}::text[])`;
  assert.equal((await localizePending({ limit: 2 })).stored, 4);
  assert.equal(provider.hits(), 1);
  assert.equal((await localizePending({ limit: 0 })).stored, 0);
  const [before] = await sql<{ search_text: string }[]>`SELECT search_text FROM publications WHERE article_id = ${ids[0]!}`;
  assert.ok(before!.search_text.includes(`translated-${T}`));
  await publishArticle(ids[0]!);
  const [again] = await sql<{ search_text: string }[]>`SELECT search_text FROM publications WHERE article_id = ${ids[0]!}`;
  assert.equal(again!.search_text, before!.search_text);
  await sql`INSERT INTO editorial_overrides (article_id,fields) VALUES (${ids[0]!}, ${sql.json({ title: `更正${T}` })})`;
  await publishArticle(ids[0]!);
  const [changed] = await sql<{ id: string; title: string; summary: string; reason: string | null; search_text: string }[]>`SELECT article_id AS id,title,summary,reason,search_text FROM publications WHERE article_id = ${ids[0]!}`;
  assert.ok(!changed!.search_text.includes(`translated-${T}`));
  assert.equal((await localizeArticles([changed!], 'ru'))[0]!.title, changed!.title);
  partial = true;
  assert.equal((await localizePending({ limit: 1 })).stored, 1);
  assert.equal((await localizeArticles([changed!], 'ru'))[0]!.title, 'English');
  partial = false;
  assert.equal((await localizePending({ limit: 1 })).stored, 2);
  assert.equal((await localizeArticles([changed!], 'ru'))[0]!.title, 'Русский');
  const [row] = await sql<{ source_hash: string }[]>`SELECT source_hash FROM localizations WHERE ref_id = ${ids[0]!} AND locale = 'ru'`;
  assert.equal(row!.source_hash, articleSourceHash(changed!));
});

test("定向重新本地化只处理指定文章，不处理其他待翻译卡片", async () => {
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    const { articleId } = await upsertMaterial({ sourceId: source, url: `https://example.com/${T}/target-${i}`,
      title: `定向标题${i}`, language: 'zh', bodyText: '正文', bodyStatus: 'ok', via: 'fetch', discoveredAt: new Date(Date.now() + 7200000) });
    await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,title_zh,summary_zh,score,selected)
      VALUES (${articleId},1,'rule','pass',${`定向标题${i}`},'定向摘要',90,true)`;
    await publishArticle(articleId);
    ids.push(articleId);
  }
  const result = await localizePending({ limit: 2, articleIds: [ids[0]!] });
  assert.equal(result.stored, 2);
  assert.equal((await sql`SELECT 1 FROM localizations WHERE ref_id = ${ids[0]!}`).length, 2);
  assert.equal((await sql`SELECT 1 FROM localizations WHERE ref_id = ${ids[1]!}`).length, 0);
});
