import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { machineTranslateBatch } from "@aihot/backend/editorial/machine-translation";
import { closeDb } from "@aihot/backend/db";

const requests: Array<Record<string, any>> = [];
const purpose = `translation_style_test_${tag()}`;
const provider = await stub((_hit, req) => {
  const body = JSON.parse(req.body);
  requests.push(body);
  return { choices: [{ message: { content: body.messages[0].content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 10 } };
});
process.env.DASHSCOPE_BASE_URL = `${provider.url}/v1`;
process.env.DASHSCOPE_API_KEY = "test-key";
after(async () => { await provider.close(); await closeDb(); });

test("千问真正收到各语言的自然文风要求和当前文章相关术语", async () => {
  const text = "An autonomous coding agent checks the blast radius before opening a pull request. git checkout main";
  for (const locale of ["zh", "ru", "en"] as const) {
    await machineTranslateBatch([text], { model: "qwen-mt-flash", purpose,
      subject: tag(), promptVersion: "style-test", locale, deadline: Date.now() + 30000 });
    const options = requests.at(-1)!.translation_options;
    assert.match(options.domains, /native/i);
    assert.match(options.domains, /first.person/i, "经验标题不能变成提问或换掉叙述者");
    assert.deepEqual(options.terms.find((term: { source: string }) => term.source === "coding agent"),
      { source: "coding agent", target: locale === "zh" ? "编程智能体" : locale === "ru" ? "ИИ-агент для разработки" : "coding agent" });
    assert.deepEqual(options.terms.find((term: { source: string }) => term.source === "blast radius"),
      { source: "blast radius", target: locale === "zh" ? "影响范围" : locale === "ru" ? "зона воздействия" : "blast radius" });
    assert.ok(!options.terms.some((term: { source: string }) => /checkout|context window/i.test(term.source)),
      "不把 git checkout 强行翻成结账，不发送文章没出现的术语");
  }
  assert.notEqual(requests[0]!.translation_options.domains, requests[1]!.translation_options.domains);
});

test("短词只按独立词匹配，避免把 agent 塞进 reagent 或 user-agent", async () => {
  await machineTranslateBatch(["A reagent and user-agent header."], { model: "qwen-mt-flash", purpose,
    subject: tag(), promptVersion: "style-test", locale: "zh", deadline: Date.now() + 30000 });
  assert.ok(!(requests.at(-1)!.translation_options.terms ?? []).some((term: { source: string }) => term.source === "agent"));
});
