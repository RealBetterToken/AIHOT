import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { machineTranslateBatch } from "@aihot/backend/editorial/machine-translation";

const T=tag();
let damage: "number" | "markup" | "placeholder" | "sign" | "currency" | "unit" | "scale" | "extra" | "nesting" | "calendar" | "english_calendar" | "russian_calendar" | "changed_month" | "percent_word" | "russian_units" | "russian_abbreviation" | "wrong_locale" | null=null;
const requests: Array<Record<string,any>>=[];
const provider=await stub((_hit,req)=>{
  const body=JSON.parse(req.body); requests.push(body);
  if(body.model==='qwen-mt-flash')return {choices:[{message:{content:body.messages[0].content},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10}};
  const input=JSON.parse(body.messages[1].content);
  const numberMarker=(value:string)=>input.facts?.find((fact:{value:string})=>fact.value===value)?.marker??value;
  const t=input.draft.map((text:string)=>damage==='number'?text.replace(numberMarker('340+'),'340')
    :damage==='markup'?text.replace('id="L0"','id="L9"')
    :damage==='placeholder'?text.replace('⟦VH0⟧','⟦VH9⟧')
    :damage==='sign'?text.replace(numberMarker('-10'),'10')
    :damage==='currency'?text.replace('$','€')
    :damage==='unit'?text.replace(' ms',' s')
    :damage==='scale'?text.replace(' млрд',' 亿')
    :damage==='extra'?text+' 50%'
    :damage==='nesting'?text.replace('<strong>重点 <em>内容</em></strong>','<strong>重点</strong><em>内容</em>')
    :damage==='calendar'?text.replace(`September ${numberMarker('2026')}`,`${numberMarker('2026')} 年 9 月`).replace(`an ${numberMarker('11')}-minute outage`, `一次 ${numberMarker('11')} 分钟的故障`)
    :damage==='russian_units'?text.replace('Wait','Подождите').replace('second','секунду')
    :damage==='russian_abbreviation'?text.replace(' мин',' 分钟')
    :damage==='english_calendar'||damage==='changed_month'?text.replace(`在 ${numberMarker('2026')} 年 9 月发布。`,`Released in ${damage==='changed_month'?'October':'September'} ${numberMarker('2026')}.`)
    :damage==='russian_calendar'?text.replace(`在 ${numberMarker('2026')} 年 9 月发布。`,`Выпущено в сентябре ${numberMarker('2026')} года.`)
    :damage==='percent_word'?text.replace(' percent','%').replace(' %','%')
    :damage==='wrong_locale'?text
    :text.replace('生硬的译文','自然的表达'));
  return {choices:[{message:{content:JSON.stringify({t})},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10}};
});

test('月份和复合单位可自然翻译，不能把正确的 9 月或 11 分钟误判成新增事实',async()=>{
  damage='calendar';
  try{
    const result=await machineTranslateBatch([`<p>September 2026 build: an 11-minute outage. 生硬的译文 ${T}</p>`],{
      model:'qwen-mt-flash',purpose:`native-calendar-${T}`,subject:'calendar',promptVersion:'calendar',locale:'zh',deadline:Date.now()+30000});
    assert.ok(result.parts,'自然日期和带连字符的计量单位应通过校验');
    assert.match(result.parts[0],/2026 年 9 月/);
    assert.match(result.parts[0],/11 分钟/);
  }finally{damage=null;}
});

for(const locale of ['en','ru'] as const)test(`中文数字月份可自然译成${locale}月份名，仍校验实际月份`,async()=>{
  damage=locale==='en'?'english_calendar':'russian_calendar';
  try{
    const result=await machineTranslateBatch([`<p data-test="${T}">在 2026 年 9 月发布。</p>`],{
      model:'qwen-mt-flash',purpose:`native-reverse-calendar-${T}-${locale}`,subject:'reverse-calendar',promptVersion:'reverse-calendar',locale,deadline:Date.now()+30000});
    assert.ok(result.parts,'9 月可以写成 September 或 сентябре');
    assert.match(result.parts[0],locale==='en'?/September 2026/:/сентябре 2026/);
  }finally{damage=null;}
});

test('数字月份改成其他月份名时拒绝审校，不能把 9 月写成 October',async()=>{
  damage='changed_month';
  try{
    const result=await machineTranslateBatch([`<p data-test="${T}-changed">在 2026 年 9 月发布。</p>`],{
      model:'qwen-mt-flash',purpose:`native-changed-calendar-${T}`,subject:'changed-calendar',promptVersion:'changed-calendar',locale:'en',deadline:Date.now()+30000});
    assert.equal(result.parts,null);
  }finally{damage=null;}
});

test('俄语单位按语法变格后仍可通过，不强迫保留英语形式',async()=>{
  damage='russian_units';
  try{
    const result=await machineTranslateBatch([`<p data-test="${T}">Wait 1 second.</p>`],{
      model:'qwen-mt-flash',purpose:`native-ru-unit-${T}`,subject:'ru-unit',promptVersion:'ru-unit',locale:'ru',deadline:Date.now()+30000});
    assert.ok(result.parts,'секунду 是正常的宾格形式');
    assert.match(result.parts[0],/Подождите 1 секунду/);
  }finally{damage=null;}
});

test('俄语分钟缩写可译成中文完整单位，阅读时长仍准确保留',async()=>{
  damage='russian_abbreviation';
  try{
    const result=await machineTranslateBatch([`<span data-test="${T}">9 мин</span>`],{
      model:'qwen-mt-flash',purpose:`native-ru-abbreviation-${T}`,subject:'ru-abbreviation',promptVersion:'ru-abbreviation',locale:'zh',deadline:Date.now()+30000});
    assert.ok(result.parts,'мин 和分钟是同一单位');
    assert.match(result.parts[0],/9 分钟/);
  }finally{damage=null;}
});

for(const unit of [' percent',' %'])test(`${unit.trim()} 可自然写成紧贴数值的百分号，含义仍一致`,async()=>{
  damage='percent_word';
  try{
    const result=await machineTranslateBatch([`<p data-test="${T}">成本增加约 4${unit}。</p>`],{
      model:'qwen-mt-flash',purpose:`native-percent-${T}-${unit}`,subject:'percent',promptVersion:'percent',locale:'zh',deadline:Date.now()+30000});
    assert.ok(result.parts,'4 percent 和 4% 是同一数值');
    assert.match(result.parts[0],/4%/);
  }finally{damage=null;}
});

test('十亿和亿不是同一数量级，数字相同也不能放过错误单位',async()=>{
  damage='scale';
  try{
    const result=await machineTranslateBatch([`<p data-test="${T}-scale">用量 1,10 млрд token。</p>`],{
      model:'qwen-mt-flash',purpose:`native-scale-${T}`,subject:'scale',promptVersion:'scale',locale:'zh',deadline:Date.now()+30000});
    assert.equal(result.parts,null,'1,10 十亿不能写成 1,10 亿');
  }finally{damage=null;}
});

test('数字占位符不掩盖错误语言，拒绝中文冒充俄语时仍保留初译回执',async()=>{
  damage='wrong_locale';
  try{
    const result=await machineTranslateBatch([`<p data-test="${T}">状态 1 2 3 4 5</p>`],{
      model:'qwen-mt-flash',purpose:`native-ru-wrong-${T}`,subject:'ru-wrong',promptVersion:'ru-wrong',locale:'ru',deadline:Date.now()+30000});
    assert.equal(result.parts,null);
    const [receipt]=await sql`SELECT status FROM receipts WHERE id=${result.receiptId}`;
    assert.equal(receipt.status,'received');
  }finally{damage=null;}
});
process.env.DASHSCOPE_BASE_URL=`${provider.url}/v1`; process.env.DASHSCOPE_API_KEY='test-key';
process.env.DEEPSEEK_BASE_URL=`${provider.url}/v1`; process.env.DEEPSEEK_API_KEY='test-key';
process.env.TRANSLATION_REVIEW_MODEL='deepseek-flash';
process.env.TRANSLATION_REVIEW_ENABLED='true';
after(async()=>{await provider.close();await closeDb();});

test('对照原文审校后返回读者文字，两次调用都有回执且恢复不重复花费',async()=>{
  const start=requests.length;
  const input=[`<p>生硬的译文 340+ 次发布。<a id="L0">文档</a> ${T}</p>`];
  const opts={model:'qwen-mt-flash',purpose:`native-review-${T}`,subject:'article',promptVersion:'review-test',locale:'zh' as const,deadline:Date.now()+30000};
  const result=await machineTranslateBatch(input,opts);
  assert.match(result.parts![0],/自然的表达/);
  assert.deepEqual(requests.slice(start).map(r=>r.model),['qwen-mt-flash','deepseek-flash']);
  assert.equal(result.receiptIds.length,2);
  const [review]=await sql`SELECT purpose FROM receipts WHERE id=${result.receiptIds[1]}`;
  assert.equal(review.purpose,'translation_review');
  const before=requests.length;
  await machineTranslateBatch(input,opts);
  assert.equal(requests.length,before);
});

for(const kind of ['number','markup','placeholder','sign','currency','unit','extra','nesting'] as const)test(`审校改动${kind}时拒绝保存，并保留有效初译回执供恢复`,async()=>{
  damage=kind;
  const result=await machineTranslateBatch([`<p>生硬的译文 340+ 次发布。<a id="L0">文档</a> -10 $5 20 ms <strong>重点 <em>内容</em></strong> \`const x=1\` ${T}-${kind}</p>`],{
    model:'qwen-mt-flash',purpose:`native-review-${T}-${kind}`,subject:'article',promptVersion:kind,locale:'zh',deadline:Date.now()+30000,plain:kind==='placeholder'});
  damage=null;
  assert.equal(result.parts,null);
  const ids=result.receiptIds;
  const rows=await sql`SELECT id,status FROM receipts WHERE id=ANY(${ids}::bigint[]) ORDER BY id`;
  assert.equal(rows.find(r=>String(r.id)===String(ids[0]))?.status,'received');
  assert.equal(rows.find(r=>String(r.id)===String(ids[1]))?.status,'failed');
});
