import { Reply, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { z } from "zod";

process.env.MODEL_CONFIG_FILE = "/nonexistent-test-models.env";
process.env.MODEL_CALLS_ENABLED = "false";
process.env.COLLECT_ENABLED = "false";
const { config } = await import("@aihot/backend/config");
const { closeDb, sql } = await import("@aihot/backend/db");
const llm = await import("@aihot/backend/providers/llm");
const { ProviderRejectedError } = await import("@aihot/backend/providers/receipts");

const usage = { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 };
const seen: Array<{ url: string; body: Record<string, unknown> }> = [];
let content = "  翻译完成。\n";
let finishReason = "stop";
let httpStatus = 200;
const provider = await stub((hit, req) => {
  seen.push({ url: req.url, body: JSON.parse(req.body) as Record<string, unknown> });
  if (httpStatus !== 200) return new Reply(httpStatus, { error: { code: "Arrearage", message: "The account balance is insufficient." } });
  return {
    id: `mt-fixture-${hit}`,
    object: "chat.completion",
    model: "qwen-mt-flash",
    choices: [{ index: 0, finish_reason: finishReason, message: { role: "assistant", content, refusal: null } }],
    usage,
  };
});
process.env.DASHSCOPE_BASE_URL = `${provider.url}/v1`;
process.env.DASHSCOPE_API_KEY = "test-key";

beforeEach(() => {
  content = "  翻译完成。\n";
  finishReason = "stop";
  httpStatus = 200;
  seen.length = 0;
});
after(async () => {
  await provider.close();
  assert.equal(config.modelCallsEnabled, false, "本地 stub 关闭后恢复安全阀");
  await closeDb();
});

const chatOptions = (subject: string) => ({
  model: "qwen-mt-flash", purpose: "translation_provider_test", subject, promptVersion: "mt-v1",
  system: "", user: `Translate this ${subject}`, schema: z.string().min(1), parse: (text: string) => text.trim(),
});
const textOptions = (subject: string) => ({
  model: "qwen-mt-flash", purpose: "translation_provider_test", subject, promptVersion: "mt-v1",
  text: `Translate this ${subject}`, targetLanguage: "Chinese",
});

test("专用翻译默认识别源语言且请求体不带普通生成参数", async () => {
  const subject = `mt-default-${tag()}`;
  const result = await llm.chatJson({ ...chatOptions(subject), translation: { targetLanguage: "Chinese" }, temperature: 1, maxTokens: 8000 });
  assert.equal(result.data, "翻译完成。");
  assert.equal(result.model, "qwen-mt-flash");
  assert.deepEqual(result.usage, usage);
  assert.deepEqual(seen, [{ url: "/v1/chat/completions", body: {
    model: "qwen-mt-flash", messages: [{ role: "user", content: `Translate this ${subject}` }],
    translation_options: { source_lang: "auto", target_lang: "Chinese" },
  } }]);
  const [receipt] = await sql`SELECT service,model,status,usage FROM receipts WHERE id=${result.receiptId}`;
  assert.deepEqual({ ...receipt }, { service: "dashscope", model: "qwen-mt-flash", status: "received", usage });
});

test("纯文本入口传递源语言、英文领域提示和术语并保留待结清回执", async () => {
  assert.equal(typeof llm.translateText, "function", "导出纯文本翻译入口");
  const subject = `mt-text-${tag()}`;
  const result = await llm.translateText({
    ...textOptions(subject), sourceLanguage: "English", domains: "The text is about AI programming tools.",
    terms: [{ source: "agent", target: "智能体" }],
  });
  assert.equal(result.data, "翻译完成。");
  assert.equal(result.reused, false);
  assert.deepEqual(seen[0]!.body, {
    model: "qwen-mt-flash", messages: [{ role: "user", content: `Translate this ${subject}` }],
    translation_options: { source_lang: "English", target_lang: "Chinese", domains: "The text is about AI programming tools.", terms: [{ source: "agent", target: "智能体" }] },
  });
  const [receipt] = await sql`SELECT status FROM receipts WHERE id=${result.receiptId}`;
  assert.equal(receipt!.status, "received");
});

test("专用翻译模型拒绝普通聊天并且不创建付费回执", async () => {
  const subject = `mt-no-translation-${tag()}`;
  await assert.rejects(llm.chatJson(chatOptions(subject)), /翻译|translation/i);
  assert.equal(seen.length, 0);
  assert.equal((await sql`SELECT id FROM receipts WHERE subject=${subject}`).length, 0);
});

test("专用翻译只接受一条纯文本用户消息", async () => {
  for (const input of [{ system: "请帮我翻译" }, { user: [{ type: "text" as const, text: "Translate me" }] }]) {
    const subject = `mt-invalid-message-${tag()}`;
    await assert.rejects(llm.chatJson({ ...chatOptions(subject), ...input, translation: { targetLanguage: "Chinese" } }), /文本|用户消息|翻译/);
    assert.equal((await sql`SELECT id FROM receipts WHERE subject=${subject}`).length, 0);
  }
  assert.equal(seen.length, 0);
});

test("模型安全阀关闭时翻译请求不创建回执和发送请求", async () => {
  const subject = `mt-valve-${tag()}`;
  config.modelCallsEnabled = false;
  try {
    await assert.rejects(llm.chatJson({ ...chatOptions(subject), translation: { targetLanguage: "Chinese" } }), /disabled/);
    assert.equal(seen.length, 0);
    assert.equal((await sql`SELECT id FROM receipts WHERE subject=${subject}`).length, 0);
  } finally {
    config.modelCallsEnabled = true;
  }
});

test("相同翻译复用已收到和已结清的回执", async () => {
  const options = textOptions(`mt-reuse-${tag()}`);
  const first = await llm.translateText(options);
  const received = await llm.translateText(options);
  assert.equal(received.receiptId, first.receiptId);
  assert.equal(received.reused, true);
  assert.deepEqual(received.usage, usage);
  await llm.markReceiptsCompleted([first.receiptId]);
  const completed = await llm.translateText(options);
  assert.equal(completed.receiptId, first.receiptId);
  assert.equal(completed.reused, true);
  assert.equal(seen.length, 1);
});

test("翻译语言、领域和术语变化使用独立逻辑回执", async () => {
  const options = textOptions(`mt-identity-${tag()}`);
  const first = await llm.translateText(options);
  const auto = await llm.translateText({ ...options, sourceLanguage: "auto" });
  assert.equal(auto.receiptId, first.receiptId, "显式 auto 和默认源语言等价");
  const receipts = [first.receiptId];
  for (const change of [
    { sourceLanguage: "English" }, { targetLanguage: "Russian" },
    { domains: "AI programming." }, { domains: "Software security." },
    { terms: [{ source: "agent", target: "智能体" }] }, { terms: [{ source: "agent", target: "代理" }] },
  ]) {
    receipts.push((await llm.translateText({ ...options, ...change })).receiptId);
  }
  assert.equal(new Set(receipts).size, 7);
  assert.equal(seen.length, 7);
});

test("翻译请求不依赖调用方 schema 来拒绝空回复", async () => {
  const subject = `mt-empty-schema-${tag()}`;
  content = " \n ";
  await assert.rejects(llm.chatJson({ ...chatOptions(subject), schema: z.string(), translation: { targetLanguage: "Chinese" } }), llm.ModelOutputError);
  const [receipt] = await sql`SELECT status FROM receipts WHERE subject=${subject}`;
  assert.equal(receipt!.status, "failed");
});

test("翻译余额不足保留 HTTP 402 拒绝类型且不自动重试", async () => {
  const options = textOptions(`mt-balance-${tag()}`);
  httpStatus = 402;
  await assert.rejects(llm.translateText(options), (error: unknown) => {
    assert.ok(error instanceof ProviderRejectedError);
    assert.equal(error.status, 402);
    assert.equal(error.retryable, false);
    return true;
  });
  assert.equal(seen.length, 1);
  const [receipt] = await sql`SELECT status,attempts FROM receipts WHERE subject=${options.subject}`;
  assert.deepEqual({ ...receipt }, { status: "failed", attempts: 1 });
});

for (const failure of [{ name: "空白回复", text: " \n\t ", finish: "stop" }, { name: "长度截断", text: "只有半句译文", finish: "length" }]) {
  test(`翻译${failure.name}被记录为不可用并允许重新请求`, async () => {
    const options = textOptions(`mt-invalid-output-${tag()}`);
    content = failure.text;
    finishReason = failure.finish;
    await assert.rejects(llm.translateText(options), llm.ModelOutputError);
    const [failed] = await sql`SELECT id,status,usage FROM receipts WHERE subject=${options.subject}`;
    assert.equal(failed!.status, "failed");
    assert.deepEqual(failed!.usage, usage);
    content = "完整译文。";
    finishReason = "stop";
    const result = await llm.translateText(options);
    assert.equal(result.receiptId, failed!.id);
    assert.equal(result.reused, false);
    assert.equal(result.data, "完整译文。");
    assert.equal(seen.length, 2);
    const [receipt] = await sql`SELECT status,attempts FROM receipts WHERE id=${result.receiptId}`;
    assert.deepEqual({ ...receipt }, { status: "received", attempts: 2 });
  });
}

test("普通聊天模型仍发送原有系统消息、生成参数和 JSON 配置", async () => {
  const subject = `mt-compatible-${tag()}`;
  content = '{"ok":true}';
  finishReason = "length";
  const result = await llm.chatJson({ model: "qwen3.8-flash", purpose: "translation_provider_test", subject, promptVersion: "mt-v1", system: "系统提示", user: subject, schema: z.object({ ok: z.boolean() }) });
  assert.deepEqual(result.data, { ok: true });
  assert.deepEqual(seen[0]!.body, {
    model: "qwen3.8-flash", messages: [{ role: "system", content: "系统提示" }, { role: "user", content: subject }],
    temperature: 0.2, max_tokens: 1500, response_format: { type: "json_object" }, enable_thinking: false,
  });
});
