import { stub, tag } from './setup.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { publishArticle } from '@aihot/backend/publication/publish';
import { translateArticle, translatePending } from '@aihot/backend/editorial/translate';
import { loadItemDetail, siteItemDetail } from '@aihot/backend/publication/detail';
import { stopBoss } from '@aihot/backend/jobs/queue';

const T = tag();
const source = `coverage-${T}`;
const requests: string[][] = [];
let invalidFragment=false;
const provider = await stub((_hit, req) => {
  const { targetLanguage, segments } = JSON.parse(JSON.parse(req.body).messages[1].content);
  requests.push(segments);
  const prefix = targetLanguage === '俄语' ? 'Переведённый текст' : targetLanguage === '英语' ? 'Translated text' : '完整译文';
  const t = segments.map((s: string) => invalidFragment && s.includes('Broken') ? '' : s.split(/(<[^>]+>)/g).map((part) => part.startsWith('<') ? part : part.replace(/[A-Za-z]+(?:\s+[A-Za-z]+)*/g, prefix)).join(''));
  return { choices: [{ message: { content: JSON.stringify({ t }) } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } };
});
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = 'test-key';
let sequence = 0;
async function article(html: string, selected = true) {
  await sql`INSERT INTO sources(id,name,kind,tier,next_fetch_at) VALUES(${source},'覆盖测试','rss','T1','2100-01-01') ON CONFLICT DO NOTHING`;
  const { articleId: id } = await upsertMaterial({ sourceId: source, url: `https://example.org/${T}/${++sequence}`, title: 'Coverage', language: 'en',
    bodyHtml: html, bodyText: html.replace(/<[^>]*>/g, ''), bodyStatus: 'ok', via: 'fetch', discoveredAt: new Date(Date.now() - 30 * 86400000) });
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,title_zh,summary_zh,score,selected)
    VALUES(${id},1,'rule','pass','覆盖标题','覆盖摘要',90,true)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60000) });
  await sql`UPDATE publications SET selected=${selected} WHERE article_id=${id}`;
  return id;
}
after(async()=>{await sql`UPDATE publications SET visibility='withdrawn' WHERE source_id=${source}`;await provider.close();await stopBoss();await closeDb();});

test('历史未精选的公开全文也可翻译，并按三个语言返回有效状态', async()=>{
  const id = await article('<p>Original body for every reader.</p>', false);
  assert.equal((await translateArticle(id, 'ru')).status, 'translated');
  const raw = await loadItemDetail(id, new Date(), 'ru');
  assert.equal(raw.kind, 'found');
  if (raw.kind !== 'found') return;
  assert.deepEqual(raw.detail.readingLanguages, [{locale:'zh',status:'pending'},{locale:'ru',status:'translated'},{locale:'en',status:'original'}]);
  assert.equal(siteItemDetail(raw.detail).bodyLanguage, 'ru');
});

test('全文翻译覆盖嵌套列表父文字和普通容器散落文字', async()=>{
  const id = await article('<div>Loose prose <strong>must translate</strong><ul><li>Parent prose<ul><li>Child prose</li></ul>Parent tail</li></ul>Container tail</div>');
  assert.equal((await translateArticle(id, 'zh')).status, 'translated');
  const [row] = await sql`SELECT body_html,complete FROM translations WHERE article_id=${id} AND lang='zh'`;
  assert.equal(row.complete, true);
  assert.doesNotMatch(row.body_html, /Loose prose|Parent prose|Parent tail|Container tail|must translate/);
  assert.match(row.body_html, /<ul><li>/);
  assert.match(row.body_html, /<strong>完整译文<\/strong>/);
  assert.equal((row.body_html.match(/完整译文/g)??[]).length,6,'父文字、内联文字、子条目和尾部文字都必须保留');
});

test('长文超过六万字符仍能翻译完整，不永久保留尾部原文', async()=>{
  const id = await article(Array.from({length:320},()=>`<p>${'Original long paragraph. '.repeat(10)}</p>`).join(''));
  assert.equal((await translateArticle(id, 'zh')).status, 'translated');
  const [row] = await sql`SELECT complete,body_html FROM translations WHERE article_id=${id} AND lang='zh'`;
  assert.equal(row.complete, true);
  assert.doesNotMatch(row.body_html,/Original long paragraph/);
});

test('单个超长段落拆成有界片段，内联格式与完整文字均保留', async()=>{
  const id=await article(`<p>${'The original sentence in one very long paragraph. '.repeat(1600)}${T}<strong>Important explanation</strong>${'The final original sentence. '.repeat(100)}</p>`);
  const start=requests.length;
  assert.equal((await translateArticle(id,'zh')).status,'translated');
  assert.ok(requests.slice(start).flat().every(segment=>segment.length<=3500),'单段不能超过模型单批输入上限');
  const [row]=await sql`SELECT body_html,complete FROM translations WHERE article_id=${id} AND lang='zh'`;
  assert.equal(row.complete,true);
  assert.doesNotMatch(row.body_html,/The original sentence|The final original/);
  assert.match(row.body_html,/<strong>完整译文<\/strong>/);
});

test('缺少目标正文时标明等待状态，不将其他语言译文冒充目标', async()=>{
  const id = await article('<p>Original English body.</p>');
  await sql`INSERT INTO translations(article_id,lang,revision,body_html,body_text,complete,origin)
    VALUES(${id},'zh',1,'<p>中文正文</p>','中文正文',true,'model')`;
  const raw = await loadItemDetail(id,new Date(),'ru');
  assert.equal(raw.kind,'found');
  if(raw.kind!=='found')return;
  const item = siteItemDetail(raw.detail);
  assert.equal(item.bodyLanguage,'original');
  assert.ok(item.body?.original?.includes('Original English'));
  assert.deepEqual(item.readingLanguages,[{locale:'zh',status:'translated'},{locale:'ru',status:'pending'},{locale:'en',status:'original'}]);
});

test('旧文章失败冷却后可定向补译，成功语言不重复花费',async()=>{
  const id=await article('<p>Historical retry body.</p>',false);
  await sql`INSERT INTO translation_attempts_lang(article_id,lang,revision,attempts,outcome,updated_at)
    VALUES(${id},'ru',1,3,'failed',now()-interval '2 days')`;
  const run=await translatePending({limit:2,articleIds:[id]} as never);
  assert.equal(run.done.filter(r=>r.articleId===id&&r.status==='translated').length,2);
  const hits=provider.hits();
  const again=await translatePending({limit:2,articleIds:[id]} as never);
  assert.deepEqual(again.done,[]);
  assert.equal(provider.hits(),hits);
});

test('译文记录文风版本，旧版本后台补译期间仍可阅读并且更新后不再排队', async()=>{
  const id=await article('<p>Style version cache.</p>',false);
  await translateArticle(id,'ru');
  const [saved]=await sql`SELECT to_jsonb(t)->>'quality_version' AS version FROM translations t WHERE article_id=${id} AND lang='ru'`;
  assert.ok(saved.version?.length, '译文缓存必须记录术语与文风版本');
  await sql`UPDATE translations SET quality_version='old-style' WHERE article_id=${id} AND lang='ru'`;
  const before=await loadItemDetail(id,new Date(),'ru');
  assert.equal(before.kind,'found');
  if(before.kind==='found')assert.equal(siteItemDetail(before.detail).bodyLanguage,'ru','升级不能中断旧译文阅读');
  const run=await translatePending({limit:2,articleIds:[id]});
  assert.equal(run.done.find(r=>r.lang==='ru')?.status,'translated');
  const [current]=await sql`SELECT quality_version FROM translations WHERE article_id=${id} AND lang='ru'`;
  assert.equal(current.quality_version,saved.version);
  assert.deepEqual((await translatePending({limit:2,articleIds:[id]})).done,[]);
});

test('同一修订的升级只完成一部分时不覆盖已有完整译文',async()=>{
  const id=await article(`<p>Good paragraph ${T}.</p><p>Broken paragraph ${T}.</p>`);
  await sql`INSERT INTO translations(article_id,lang,revision,body_html,body_text,complete,origin,coverage_version,quality_version)
    VALUES(${id},'ru',1,'<p>Старый хороший абзац.</p><p>Старый второй абзац.</p>','Старый хороший абзац. Старый второй абзац.',true,'model',1,'old-style')`;
  const [before]=await sql`SELECT body_html FROM translations WHERE article_id=${id} AND lang='ru'`;
  invalidFragment=true;
  try{assert.equal((await translateArticle(id,'ru')).status,'partial');}
  finally{invalidFragment=false;}
  const [after]=await sql`SELECT body_html,complete,quality_version FROM translations WHERE article_id=${id} AND lang='ru'`;
  assert.equal(after.complete,true,'升级失败不降低已有正文的完整性');
  assert.equal(after.body_html,before.body_html);
  assert.equal(after.quality_version,'old-style');
});
