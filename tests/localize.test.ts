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
  return { choices: [{ message: { content: JSON.stringify({ items: [null, { id: 123 }, ...items.map((r: { id: string; summary: string | null }) => ({ id: r.id,
    zh: { title: "中文原始标题", summary: r.summary === null ? null : "中文摘要", reason: "" },
    ru: partial ? { title: "", summary: "" } : { title: "Русский", summary: r.summary === null ? null : `Перевод ${T}`, reason: "Причина" },
    en: { title: "English", summary: r.summary === null ? null : `translated-${T}`, reason: "Reason" },
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
  assert.equal((await localizeArticles([changed!], 'ru'))[0]!.title, changed!.title);
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
      title: `定向标题${i}`, language: 'zh', bodyText: '正文', bodyStatus: 'ok', via: 'fetch', discoveredAt: new Date(Date.now() - 30 * 86400000) });
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

test("尚无摘要的历史英文公开文章补齐中文和俄文标题，不制造摘要",async()=>{
  const {articleId}=await upsertMaterial({sourceId:source,url:`https://example.com/${T}/title-only`,title:'An English Original Article',language:'en',bodyText:'Original body.',bodyStatus:'ok',via:'fetch',discoveredAt:new Date('2020-01-01')});
  await publishArticle(articleId);
  assert.equal((await localizePending({articleIds:[articleId]})).stored,2);
  const [row]=await sql<{id:string;title:string;summary:string|null;reason:string|null}[]>`SELECT article_id AS id,title,summary,reason FROM publications WHERE article_id=${articleId}`;
  assert.equal((await localizeArticles([row!],'zh'))[0]!.title,'中文原始标题');
  assert.equal((await localizeArticles([row!],'ru'))[0]!.title,'Русский');
  assert.equal((await localizeArticles([row!],'en'))[0]!.title,'An English Original Article');
  assert.equal((await localizeArticles([row!],'zh'))[0]!.summary,null);
});

test("卡片记录文风版本，源文字未变也能升级旧译文",async()=>{
  const {articleId}=await upsertMaterial({sourceId:source,url:`https://example.com/${T}/style-cache`,title:'文风版本',language:'zh',bodyText:'正文',bodyStatus:'ok',via:'fetch'});
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,title_zh,summary_zh,score,selected)
    VALUES(${articleId},1,'rule','pass','文风标题','文风摘要',90,true)`;
  await publishArticle(articleId);
  assert.equal((await localizePending({articleIds:[articleId]})).stored,2);
  const [saved]=await sql`SELECT to_jsonb(l)->>'quality_version' AS version FROM localizations l WHERE kind='article' AND ref_id=${articleId} AND locale='ru'`;
  assert.ok(saved.version?.length,'卡片缓存必须记录文风与术语版本');
  await sql`UPDATE localizations SET quality_version='old-style' WHERE kind='article' AND ref_id=${articleId}`;
  assert.equal((await localizePending({articleIds:[articleId]})).stored,2);
  const [current]=await sql`SELECT quality_version FROM localizations WHERE kind='article' AND ref_id=${articleId} AND locale='ru'`;
  assert.equal(current.quality_version,saved.version);
  assert.equal((await localizePending({articleIds:[articleId]})).stored,0);
});
