import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const configUrl = new URL("../packages/backend/src/config.ts", import.meta.url).href;
const providerUrl = new URL("../packages/backend/src/providers/llm.ts", import.meta.url).href;

function probe(contents: string | null, extraEnv: Record<string, string> = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "vibehot-models-"));
  const file = path.join(dir, "models.env");
  if (contents !== null) writeFileSync(file, contents);
  try {
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", `
      const m = await import(${JSON.stringify(configUrl)});
      const { MODELS } = await import(${JSON.stringify(providerUrl)});
      console.log(JSON.stringify({
        score: process.env.SCORE_MODEL ?? null,
        baseUrl: m.credential("models", "DEEPSEEK_BASE_URL"),
        keyConfigured: m.credential("models", "DEEPSEEK_API_KEY") === "fixture-model-key",
        source: m.modelConfigSource?.("SCORE_MODEL") ?? null,
        disabled: !m.config.modelCallsEnabled,
        collect: process.env.COLLECT_ENABLED,
        unknown: process.env.NOT_A_MODEL_CONFIG ?? null,
        session: process.env.SESSION_SECRET ?? null,
        legacyModel: MODELS.default.model,
      }));
    `], {
      cwd: dir,
      env: { PATH: process.env.PATH, NODE_ENV: "test", MODEL_CONFIG_FILE: file, MODEL_CALLS_ENABLED: "false", COLLECT_ENABLED: "false", ...extraEnv },
      encoding: "utf8",
    });
    assert.ok(!stdout.includes("fixture-model-key"), "诊断不能输出凭据");
    return JSON.parse(stdout) as Record<string, unknown>;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("后端从指定文件加载模型凭据和路由，工作目录不影响加载", () => {
  const result = probe("DEEPSEEK_BASE_URL=https://compatible.example/v1\nDEEPSEEK_API_KEY=fixture-model-key\nSCORE_MODEL=deepseek-flash\n");
  assert.equal(result.score, "deepseek-flash");
  assert.equal(result.baseUrl, "https://compatible.example/v1");
  assert.equal(result.keyConfigured, true);
  assert.equal(result.source, "file");
});

test("显式环境变量覆盖模型文件，空值也保留为显式覆盖", () => {
  const result = probe("SCORE_MODEL=deepseek-flash\nDEEPSEEK_API_KEY=fixture-model-key\n", { SCORE_MODEL: "qwen3.7-flash", DEEPSEEK_API_KEY: "" });
  assert.equal(result.score, "qwen3.7-flash");
  assert.equal(result.keyConfigured, false);
  assert.equal(result.source, "env");
});

test("模型文件不能打开安全阀、注入登录密钥或未知设置", () => {
  const result = probe("MODEL_CALLS_ENABLED=true\nCOLLECT_ENABLED=true\nSESSION_SECRET=fixture-session\nNOT_A_MODEL_CONFIG=unexpected\n");
  assert.equal(result.disabled, true);
  assert.equal(result.collect, "false");
  assert.equal(result.session, null);
  assert.equal(result.unknown, null);
});

test("没有模型文件时继续使用旧 LLM 单模型配置", () => {
  const result = probe(null, { LLM_MODEL: "legacy-compatible-model" });
  assert.equal(result.legacyModel, "legacy-compatible-model");
  assert.equal(result.score, null);
  assert.equal(result.source, null);
});

test("旧 LLM 单模型配置也可放在统一模型文件", () => {
  const result = probe("LLM_MODEL=legacy-compatible-model\n");
  assert.equal(result.legacyModel, "legacy-compatible-model");
});
