import { stub, tag, gate, Reply } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { sourceLanguage, sourceLanguageSql } from "@aihot/backend/content/language";
import { translatePending, translateArticle, translateQuotes } from "@aihot/backend/editorial/translate";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadItemDetail, siteItemDetail } from "@aihot/backend/publication/detail";
import { itemFeed } from "@aihot/backend/publication/feeds";
import { createSource } from "@aihot/backend/admin/sources";
import { ingestItems } from "@aihot/backend/ingest/items";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { sha256 } from "@aihot/backend/lib/ids";
import type { Locale } from "@aihot/contracts/locale";

const T = tag();
const SOURCE = `test-fulltext-${T}`;
const calls: Array<{ targetLanguage: string; segments: string[] }> = [];
let failRussian = false;
let insufficientBalance = false;
let held: { asked: ReturnType<typeof gate<void>>; release: ReturnType<typeof gate<void>> } | null = null;
const provider = await stub(async (_hit, req) => {
  const input = JSON.parse(JSON.parse(req.body).messages[1].content);
  calls.push(input);
  if (insufficientBalance) return new Reply(402, { error: { message: "Insufficient Balance" } });
  if (held) { held.asked.open(); await held.release.promise; }
  const prefix = input.targetLanguage === '俄语' ? 'Русский перевод' : input.targetLanguage === '英语' ? 'English translation' : '完整译文';
  const t = input.segments.map(() => failRussian && input.targetLanguage === "俄语" ? 42 : prefix);
  return { choices: [{ message: { content: JSON.stringify({ t }) } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } };
});
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = "test-key";
after(async () => { await sql`UPDATE publications SET selected=false WHERE source_id=${SOURCE}`; await provider.close(); await stopBoss(); await closeDb(); });
let sequence = 0;
async function article(language: string | null, text: string, extra: Record<string, any> = {}) {
  await sql`INSERT INTO sources(id,name,kind,tier,next_fetch_at) VALUES(${SOURCE},'全文测试','rss','T1','2100-01-01') ON CONFLICT DO NOTHING`;
  const { articleId: id } = await upsertMaterial({ sourceId: SOURCE, url: `https://example.org/fulltext-${T}/${++sequence}`, title: `正文测试 ${T}`, language,
    bodyHtml: `<p>${text}</p>`, bodyText: text, bodyStatus: "ok", via: "fetch", discoveredAt: new Date(), ...extra });
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,selected,score)
    VALUES(${id},1,'rule','pass','release',${`全文 ${T}`},'摘要',true,90)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
  // 将本用例放到待翻译队首，公开时间保持不变。
  await sql`UPDATE publications SET selected_ready_at = now() + make_interval(secs => ${sequence * 1000}) WHERE article_id = ${id}`;
  return id;
}
async function detail(id: string, locale: Locale) {
  const result = await loadItemDetail(id, new Date(), locale);
  assert.equal(result.kind, "found");
  if (result.kind !== "found") throw new Error("详情缺失");
  return siteItemDetail(result.detail);
}

test("数据库、后台创建、external 自动建源默认开启全文，允许单源关闭", async () => {
  const created = await createSource({ id: SOURCE, name: '默认全文', kind: 'rss', config: { feedUrl: `https://example.org/${T}/feed` } }, 'test');
  assert.ok(created.created);
  if (created.created) assert.deepEqual([created.source.site_fulltext, created.source.syndicate_fulltext], [true, true]);
  await ingestItems({ sourceId: `external-${T}`, items: [{ title: '推送', url: `https://example.org/${T}/external` }] });
  const [source] = await sql`SELECT site_fulltext,syndicate_fulltext,participation_mode FROM sources WHERE id=${`external-${T}`}`;
  assert.deepEqual({ ...source }, { site_fulltext: true, syndicate_fulltext: true, participation_mode: 'isolated' });
  const id = await article('en', 'Original English sentence.');
  assert.ok((await detail(id, 'en')).body?.original);
  await sql`UPDATE sources SET site_fulltext=false,syndicate_fulltext=false WHERE id=${SOURCE}`;
  await publishArticle(id);
  assert.equal((await detail(id, 'en')).body, null);
  await sql`UPDATE sources SET site_fulltext=true,syndicate_fulltext=true WHERE id=${SOURCE}`;
});

test("zh/ru/en 原文只翻其他语言，包括纯中文段落及无语言标记的正文", async () => {
  assert.equal(sourceLanguage('zh-CN','English product'), 'zh');
  assert.equal(sourceLanguage(null,'这是中文正文。'), 'zh');
  assert.equal(sourceLanguage(null,'Русский исходный текст.'), 'ru');
  assert.equal(sourceLanguage(null,'Попробуйте! https://example.org/english-product-long-url'),'ru');
  assert.equal(sourceLanguage(null,'English engineering explanation of 内卷 with original terms.'),'en');
  for (const [language, text, expected] of [
    ['en', 'English body sentence.', ['俄语','简体中文']],
    ['ru', 'Русский исходный текст.', ['英语','简体中文']],
    [null, '纯中文段落，代码和产品名应保持原样。', ['俄语','英语']],
  ] as const) {
    const id = await article(language,`${text} ${T}`);
    const start = calls.length;
    const run = await translatePending({ limit: 2 });
    assert.equal(run.done.length, 2);
    assert.ok(run.done.every(r=>r.articleId===id));
    assert.deepEqual(calls.slice(start).map(c=>c.targetLanguage).sort(), [...expected].sort());
    const native = sourceLanguage(language,text) as Locale;
    assert.equal((await translateArticle(id,native)).reason,'same language');
    assert.equal((await sql`SELECT 1 FROM translations WHERE article_id=${id} AND lang=${native}`).length,0);
  }
});

test("队列 SQL 与正文读取的语言判断一致，包括语言地区码和带链接的短正文", async () => {
  const samples = [
    { language: "ZH_cn", text: "English product name", expected: "zh" },
    { language: "ru-RU", text: "Code v2", expected: "ru" },
    { language: "en-US", text: "保留中文引文", expected: "en" },
    { language: null, text: "这是中文正文。", expected: "zh" },
    { language: null, text: "Попробуйте! https://example.org/english-product-long-url", expected: "ru" },
    { language: "und", text: "English explanation of 内卷 with original terms.", expected: "en" },
  ];
  for (const { language, text, expected } of samples) {
    const [row] = await sql`SELECT ${sourceLanguageSql(sql`${language}::text`, sql`${text}::text`)} AS language`;
    assert.equal(row!.language, expected);
    assert.equal(sourceLanguage(language, text), expected);
  }
});

test("失败次数按语言独立计数，俄语三次失败不影响中文成功", async () => {
  const id = await article('en',`Retry body ${T}.`);
  failRussian = true;
  try {
    for (let i=0;i<3;i++) {
      if(i>0) await sql`UPDATE translation_attempts_lang SET updated_at=now()-interval '16 minutes' WHERE article_id=${id} AND lang='ru'`;
      await translatePending({ limit: i===0 ? 2 : 1, articleIds:[id] });
    }
  } finally { failRussian=false; }
  const rows = await sql`SELECT lang,attempts,outcome FROM translation_attempts_lang WHERE article_id=${id} ORDER BY lang`;
  assert.deepEqual(rows.map(r=>({...r})),[{lang:'ru',attempts:3,outcome:'failed'},{lang:'zh',attempts:1,outcome:'translated'}]);
  assert.equal((await sql`SELECT lang FROM translations WHERE article_id=${id}`)[0]!.lang,'zh');
  const run = await translatePending({ limit: 1 });
  assert.ok(run.done.every(r=>r.articleId!==id),'已达到三次的语言不会继续尝试');
});

test("公开详情和全文 RSS 只使用请求语言或原文，并忽略过期译文", async () => {
  const id = await article('zh',`原文正文 ${T}。`);
  await sql`INSERT INTO translations(article_id,lang,revision,body_html,body_text,complete,origin)
    VALUES(${id},'en',1,'<h2>English heading</h2><p>English fallback body.</p>','English fallback body.',true,'model'),
          (${id},'ru',1,'<h2>Русский заголовок</h2><p>Русский перевод.</p>','Русский перевод.',true,'model')`;
  const ru = await detail(id,'ru');
  assert.equal(ru.bodyLanguage,'ru');
  assert.ok(ru.body?.localized?.includes('Русский перевод'));
  assert.equal(ru.outline[0]!.text,'Русский заголовок');
  assert.ok((await detail(id,'zh')).body?.original?.includes('原文正文'));
  assert.equal((await detail(id,'zh')).hasTranslation,false);
  assert.ok((await itemFeed('selected-full',null,new Date(),'ru')).includes('Русский перевод'));
  await sql`UPDATE translations SET revision=0 WHERE article_id=${id} AND lang='ru'`;
  const fallback = await detail(id,'ru');
  assert.equal(fallback.bodyLanguage,'original');
  assert.ok(fallback.body?.original?.includes('原文正文'));
  assert.ok(!(await itemFeed('selected-full',null,new Date(),'ru')).includes('English fallback body'));
  await sql`DELETE FROM translations WHERE article_id=${id} AND lang='en'`;
  assert.ok((await detail(id,'ru')).body?.original?.includes('原文正文'));
  assert.equal((await detail(id,'ru')).bodyLanguage,'original');
});

test("X 正文和引用帖按语言读取，中文引用复用旧缓存，原语言不调用模型", async () => {
  const tweetId=`7${Date.now()}`;
  const quoted=`Quoted announcement ${T}.`;
  const id=await article('en',`Selected post ${T}.`,{xPost:{tweetId:`8${Date.now()}`,authorName:'Author',handle:'author',text:`Selected post ${T}.`,quoted:{authorName:'Quoted',handle:'quoted',text:quoted,url:`https://x.com/quoted/status/${tweetId}`}}});
  await sql`INSERT INTO translations(article_id,lang,revision,body_html,body_text,complete,origin)
    VALUES(${id},'ru',1,'<p>Русский пост.</p>','Русский пост.',true,'model')`;
  await sql`INSERT INTO quote_translations(tweet_id,text_hash,text_zh) VALUES(${tweetId},${sha256(quoted)},'旧表中文引用')`;
  const start=calls.length;
  await translateQuotes({articleIds:[id]});
  assert.deepEqual(calls.slice(start).map(c=>c.targetLanguage),['俄语']);
  assert.equal((await detail(id,'zh')).x?.quoted?.translation,'旧表中文引用');
  assert.ok((await detail(id,'ru')).x?.quoted?.translation?.includes('Русский перевод'));
  assert.equal((await detail(id,'en')).x?.quoted?.translation,null);
  const raw = await loadItemDetail(id,new Date(),'ru');
  assert.equal(raw.kind,'found');
  if(raw.kind==='found') assert.equal(siteItemDetail(raw.detail,true).x?.quoted?.translation,null);
  assert.ok((await detail(id,'ru')).body?.localized?.includes('Русский пост'));
  assert.ok((await detail(id,'en')).body?.original?.includes('Selected post'));
  const before=calls.length;
  await translateQuotes({articleIds:[id]});
  assert.equal(calls.length,before,'各语言共享引用缓存不重复调用');
});


test("并发加速遇到在途回执时不消耗该语言的失败次数", async () => {
  const id=await article('en',`Concurrent translation ${T}.`);
  const current={asked:gate(),release:gate()};
  held=current;
  const running=translatePending({limit:1});
  await current.asked.promise;
  try {
    const duplicate=await translatePending({limit:1});
    assert.equal(duplicate.done.length,0);
    assert.equal((await sql`SELECT 1 FROM translation_attempts_lang WHERE article_id=${id}`).length,0);
  } finally {
    held=null;
    current.release.open();
    await running;
  }
  const [attempt]=await sql`SELECT attempts,outcome FROM translation_attempts_lang WHERE article_id=${id} AND lang='zh'`;
  assert.deepEqual({...attempt},{attempts:1,outcome:'translated'});
});

test("模型余额不足时结束本轮，不消耗文章语言失败次数或继续调用其他语言", async () => {
  const id = await article('en', `Balance waiting ${T}.`);
  const start = calls.length;
  insufficientBalance = true;
  try {
    assert.deepEqual(await translatePending({ limit: 2 }), { done: [], quotes: 0 });
    assert.equal(calls.length - start, 1);
    assert.equal((await sql`SELECT 1 FROM translation_attempts_lang WHERE article_id=${id}`).length, 0);
  } finally { insufficientBalance = false; }
});

test("引用帖遇到余额不足时暂停，不遍历剩余语言发请求", async () => {
  const tweetId = `9${Date.now()}`;
  await article('en', `Quoted balance waiting ${T}.`, { xPost: { text: `Post ${T}.`, quoted: {
    text: `Uncached quote ${T}.`, url: `https://x.com/author/status/${tweetId}`,
  } } });
  const start = calls.length;
  insufficientBalance = true;
  try {
    await assert.rejects(translateQuotes(), (error: any) => error.status === 402);
    assert.equal(calls.length - start, 1);
    assert.equal((await sql`SELECT 1 FROM quote_translations_lang WHERE tweet_id=${tweetId}`).length, 0);
  } finally { insufficientBalance = false; }
});
