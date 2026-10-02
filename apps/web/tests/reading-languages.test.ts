import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer, type ViteDevServer } from 'vite';
let server: ViteDevServer;
before(async()=>{server=await createServer({configFile:false,root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});});
after(async()=>{await server?.close();});
test('每篇文章都有三个语言入口，跨语言链接保持目标语言并说明缺译状态',async()=>{
  const { ReadingLanguages } = await server.ssrLoadModule('/app/features/item/ReadingLanguages.tsx');
  const choices=[{locale:'zh',status:'pending'},{locale:'ru',status:'partial'},{locale:'en',status:'original'}];
  for(const locale of ['zh','ru','en']) {
    const html=renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:[`/${locale}/items/sample`]},createElement(ReadingLanguages,{itemId:'sample',choices,hasBody:true,original:false})));
    for(const language of ['zh','ru','en'])assert.ok(html.includes(`href="/${language}/items/sample"`),html);
    assert.ok(html.includes(`href="/${locale}/items/sample/original"`));
    assert.equal((html.match(/aria-current="page"/g)??[]).length,1);
    assert.ok(html.includes(locale==='ru'?'Ожидает перевода':locale==='en'?'Awaiting translation':'等待翻译'),html);
  }
});
test('缺少正文也保留三个阅读语言入口，原文选择单独标明',async()=>{
  const { ReadingLanguages } = await server.ssrLoadModule('/app/features/item/ReadingLanguages.tsx');
  const html=renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:['/ru/items/sample/original']},createElement(ReadingLanguages,{itemId:'sample',choices:[],hasBody:true,original:true})));
  for(const locale of ['zh','ru','en'])assert.ok(html.includes(`href="/${locale}/items/sample"`));
  assert.match(html,/href="\/ru\/items\/sample\/original"[^>]*aria-current="page"/);
});
