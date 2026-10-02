import "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { modelsOverview, switchModel } from "@aihot/backend/admin/models";
import * as routing from "@aihot/backend/editorial/models";

const keys = ["models.score", "models.translate", "models.localize"];
let saved: Array<{ key: string; value: unknown; updated_by: string | null }>;
const originalScore = process.env.SCORE_MODEL;
const originalTranslate = process.env.TRANSLATE_MODEL;

before(async () => {
  saved = await sql`SELECT key, value, updated_by FROM settings WHERE key IN ${sql(keys)}`;
  await sql`DELETE FROM settings WHERE key IN ${sql(keys)}`;
  routing.invalidateModelCache();
});
after(async () => {
  await sql`DELETE FROM settings WHERE key IN ${sql(keys)}`;
  for (const row of saved) await sql`INSERT INTO settings (key, value, updated_by) VALUES (${row.key}, ${sql.json(row.value as never)}, ${row.updated_by})`;
  if (originalScore === undefined) delete process.env.SCORE_MODEL;
  else process.env.SCORE_MODEL = originalScore;
  if (originalTranslate === undefined) delete process.env.TRANSLATE_MODEL;
  else process.env.TRANSLATE_MODEL = originalTranslate;
  routing.invalidateModelCache();
  await closeDb();
});

test("未注册的环境模型明确报错，不能回退后掩盖配置错误", async () => {
  process.env.SCORE_MODEL = "not-a-registered-model";
  await assert.rejects(routing.modelFor("score"), /SCORE_MODEL.*not-a-registered-model/);
});

test("模型名称不能借用对象原型属性绕过注册检查", async () => {
  process.env.SCORE_MODEL = "toString";
  await assert.rejects(routing.modelFor("score"), /SCORE_MODEL.*toString/);
});

test("翻译专用模型不能通过环境变量路由到评分", async () => {
  process.env.SCORE_MODEL = "qwen-mt-flash";
  await assert.rejects(routing.modelFor("score"), /qwen-mt-flash.*仅.*翻译/);
});

test("后台不能把翻译专用模型切到评分，拒绝时不写设置", async () => {
  await assert.rejects(switchModel("score", "qwen-mt-flash", "配置测试", "test-admin"), /qwen-mt-flash.*仅.*翻译/);
  assert.equal((await sql`SELECT key FROM settings WHERE key = 'models.score'`).length, 0);
});

test("后台遗留非法路由明确报错，不能静默忽略", async () => {
  process.env.SCORE_MODEL = "deepseek-flash";
  await sql`INSERT INTO settings (key, value) VALUES ('models.score', '{"model":"not-a-registered-model"}')`;
  routing.invalidateModelCache();
  try {
    await assert.rejects(routing.modelFor("score"), /models.score.*not-a-registered-model/);
  } finally {
    await sql`DELETE FROM settings WHERE key = 'models.score'`;
    routing.invalidateModelCache();
  }
});

test("后台覆盖优先且诊断会报告与文件或环境的不同选择", async () => {
  process.env.SCORE_MODEL = "deepseek-flash";
  await sql`INSERT INTO settings (key, value) VALUES ('models.score', '{"model":"qwen3.7-flash"}')`;
  routing.invalidateModelCache();
  try {
    assert.equal(await routing.modelFor("score"), "qwen3.7-flash");
    const diagnose = (routing as unknown as { modelDiagnostics?: () => Promise<Array<Record<string, unknown>>> }).modelDiagnostics;
    assert.ok(diagnose, "需要可在启动前运行的只读模型诊断");
    const score = (await diagnose()).find((row) => row.capability === "score")!;
    assert.equal(score.model, "qwen3.7-flash");
    assert.equal(score.source, "admin");
    assert.equal(score.configuredModel, "deepseek-flash");
    assert.equal(score.overridden, true);
    assert.ok(!JSON.stringify(score).includes("API_KEY"), "诊断不包含凭据字段");
  } finally {
    await sql`DELETE FROM settings WHERE key = 'models.score'`;
    routing.invalidateModelCache();
  }
});

test("全文翻译和读者本地化可路由到 Qwen MT，默认单模型仍可用于翻译", async () => {
  process.env.TRANSLATE_MODEL = "qwen-mt-flash";
  assert.equal(await routing.modelFor("translate"), "qwen-mt-flash");
  await switchModel("localize", "qwen-mt-flash", "配置测试", "test-admin");
  assert.equal(await routing.modelFor("localize"), "qwen-mt-flash");
  process.env.TRANSLATE_MODEL = "default";
  assert.equal(await routing.modelFor("translate"), "default");
});

test("旧单模型配置开启看图后仍能承担评分等文本环节", async () => {
  const oldVision = process.env.LLM_VISION;
  process.env.LLM_VISION = "true";
  process.env.SCORE_MODEL = "default";
  try {
    assert.equal(await routing.modelFor("score"), "default");
  } finally {
    process.env.SCORE_MODEL = "deepseek-flash";
    if (oldVision === undefined) delete process.env.LLM_VISION;
    else process.env.LLM_VISION = oldVision;
  }
});

test("只读诊断隐藏自定义 URL 中的密码、查询参数和 API key", async () => {
  const oldUrl = process.env.DEEPSEEK_BASE_URL;
  const oldKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_BASE_URL = "https://fixture-user:fixture-password@compatible.example/v1?token=fixture-token#fixture-fragment";
  process.env.DEEPSEEK_API_KEY = "fixture-private-key";
  try {
    const output = await routing.modelDiagnostics();
    const score = output.find((row) => row.capability === "score")!;
    assert.equal(score.baseUrl, "https://compatible.example/v1");
    assert.equal(score.credentialConfigured, true);
    assert.equal(score.providerConfigured, true);
    assert.ok(!JSON.stringify(output).includes("fixture-"));
  } finally {
    if (oldUrl === undefined) delete process.env.DEEPSEEK_BASE_URL;
    else process.env.DEEPSEEK_BASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = oldKey;
  }
});

test("后台总览展示坏型号和错误，切换修复时审计保留旧坏型号", async () => {
  process.env.SCORE_MODEL = "deepseek-flash";
  await sql`INSERT INTO settings (key, value) VALUES ('models.score', '{"model":"obsolete-score-model"}')`;
  routing.invalidateModelCache();
  const reason = `测试修复旧型号-${Date.now()}`;
  try {
    const overview = await modelsOverview();
    const current = overview.capabilities.find((row) => row.key === "score")!.current;
    assert.equal(current.model, "obsolete-score-model");
    assert.match((current as { error?: string }).error ?? "", /models.score.*obsolete-score-model/);
    await assert.rejects(routing.modelFor("score"), /models.score.*obsolete-score-model/);

    const changed = await switchModel("score", "deepseek-flash", reason, "test-routing-recovery");
    assert.equal(changed.before!.model, "obsolete-score-model");
    assert.equal(changed.after!.model, "deepseek-flash");
    assert.equal(await routing.modelFor("score"), "deepseek-flash");
    const rows = await sql<Array<{ before: { model: string }; after: { model: string } }>>`
      SELECT before, after FROM audit_log WHERE action = 'models.switch' AND reason = ${reason}`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.before.model, "obsolete-score-model");
    assert.equal(rows[0]!.after.model, "deepseek-flash");
  } finally {
    await sql`DELETE FROM settings WHERE key = 'models.score'`;
    routing.invalidateModelCache();
  }
});

test("后台可以把坏型号恢复为有效环境配置", async () => {
  process.env.SCORE_MODEL = "deepseek-flash";
  await sql`INSERT INTO settings (key, value) VALUES ('models.score', '{"model":"obsolete-score-model"}')`;
  routing.invalidateModelCache();
  try {
    const changed = await switchModel("score", null, "测试恢复环境配置", "test-routing-recovery");
    assert.equal(changed.before!.model, "obsolete-score-model");
    assert.equal(changed.after!.model, "deepseek-flash");
    assert.equal(changed.after!.source, "env");
    assert.equal((await sql`SELECT key FROM settings WHERE key = 'models.score'`).length, 0);
  } finally {
    await sql`DELETE FROM settings WHERE key = 'models.score'`;
    routing.invalidateModelCache();
  }
});

test("一处坏型号不阻断其他环节的后台切换", async () => {
  await sql`INSERT INTO settings (key, value) VALUES ('models.score', '{"model":"obsolete-score-model"}')`;
  routing.invalidateModelCache();
  try {
    const changed = await switchModel("translate", "deepseek-flash", "测试其他环节仍可切换", "test-routing-recovery");
    assert.equal(changed.after!.model, "deepseek-flash");
    await assert.rejects(routing.modelFor("score"), /models.score.*obsolete-score-model/);
  } finally {
    await sql`DELETE FROM settings WHERE key IN ('models.score', 'models.translate')`;
    routing.invalidateModelCache();
  }
});

test("有效后台覆盖低优先级坏环境值，诊断另行报告环境错误", async () => {
  process.env.SCORE_MODEL = "obsolete-env-model";
  await sql`INSERT INTO settings (key, value) VALUES ('models.score', '{"model":"deepseek-flash"}')`;
  routing.invalidateModelCache();
  try {
    assert.equal(await routing.modelFor("score"), "deepseek-flash");
    const current = (await routing.modelSources()).score!;
    assert.equal(current.model, "deepseek-flash");
    assert.equal((current as { error?: string }).error, undefined);
    const score = (await routing.modelDiagnostics()).find((row) => row.capability === "score")!;
    assert.equal(score.model, "deepseek-flash");
    assert.equal(score.source, "admin");
    assert.equal(score.configuredModel, "obsolete-env-model");
    assert.match((score as { configuredError?: string }).configuredError ?? "", /SCORE_MODEL.*obsolete-env-model/);
    assert.equal((score as { error?: string }).error, undefined);
  } finally {
    await sql`DELETE FROM settings WHERE key = 'models.score'`;
    process.env.SCORE_MODEL = "deepseek-flash";
    routing.invalidateModelCache();
  }
});

test("只读诊断保留坏最终型号的错误并继续输出其他环节", async () => {
  await sql`INSERT INTO settings (key, value) VALUES ('models.score', '{"model":"obsolete-score-model"}')`;
  routing.invalidateModelCache();
  try {
    const output = await routing.modelDiagnostics();
    const score = output.find((row) => row.capability === "score")!;
    assert.equal(score.model, "obsolete-score-model");
    assert.match((score as { error?: string }).error ?? "", /models.score.*obsolete-score-model/);
    assert.equal(score.providerConfigured, false);
    assert.equal(output.find((row) => row.capability === "translate")!.model, "default");
  } finally {
    await sql`DELETE FROM settings WHERE key = 'models.score'`;
    routing.invalidateModelCache();
  }
});

test("恢复默认前校验将生效的环境值，拒绝时保留有效后台覆盖", async () => {
  process.env.SCORE_MODEL = "obsolete-env-model";
  await sql`INSERT INTO settings (key, value) VALUES ('models.score', '{"model":"deepseek-flash"}')`;
  routing.invalidateModelCache();
  try {
    await assert.rejects(switchModel("score", null, "测试不能恢复坏环境配置", "test-routing-recovery"), /SCORE_MODEL.*obsolete-env-model/);
    assert.equal(await routing.modelFor("score"), "deepseek-flash");
    assert.equal((await sql<Array<{ value: { model: string } }>>`SELECT value FROM settings WHERE key = 'models.score'`)[0]!.value.model, "deepseek-flash");
  } finally {
    await sql`DELETE FROM settings WHERE key = 'models.score'`;
    process.env.SCORE_MODEL = "deepseek-flash";
    routing.invalidateModelCache();
  }
});
