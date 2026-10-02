// Model per capability: the code default (`default`, the deployment's own model), an environment
// override, and an admin switch kept in settings (every switch is audited). Read at call time and
// cached for a minute, so a switch applies to the next call without a restart; a changed model only
// affects work done from then on (history is not re-judged).
import { sql } from "../db.ts";
import { credential, modelConfigSource } from "../config.ts";
import { MODELS, type ModelSpec } from "../providers/llm.ts";

export interface Capability {
  label: string;
  env: string;
  default: string;
  /** Receipt purposes this capability produces (for the admin statistics). */
  purposes: string[];
  vision?: boolean;
}

export const CAPABILITIES = {
  prefilter: { label: "精选预筛（是否属于这个行业，宽召回）", env: "PREFILTER_MODEL", default: "default", purposes: ["prefilter_article"] },
  score: { label: "精选评分（两次独立评分，按信源分级门槛）", env: "SCORE_MODEL", default: "default", purposes: ["score_article"] },
  understand: { label: "内容理解（入选和接近入选的标题、摘要、推荐理由、标签，能看图时看首图）", env: "UNDERSTAND_MODEL", default: "default", purposes: ["understand_article"] },
  summarize: { label: "标题摘要（其余文章的中文标题与摘要）", env: "SUMMARIZE_MODEL", default: "default", purposes: ["summarize_article"] },
  structure: { label: "结构抽取（分类、标签、主体公司、事件事实，不写读者文字）", env: "STRUCTURE_MODEL", default: "default", purposes: ["structure_article"] },
  group: { label: "事件归组（新报道与候选事实的关系：同一次发生、同一事件的进展、无关；被同一篇报道连起来的两个事件是否同一事件）", env: "GROUP_MODEL", default: "default", purposes: ["group_article", "group_signal", "group_story"] },
  groupReview: { label: "归组复核（相似度不高的合并、两个事件的合并，写入前再读一遍；最好换一家模型）", env: "GROUP_REVIEW_MODEL", default: "default", purposes: ["group_review", "group_story_review"] },
  digest: { label: "事件综述", env: "DIGEST_MODEL", default: "default", purposes: ["story_digest"] },
  report: { label: "日报、周报、月报", env: "REPORT_MODEL", default: "default", purposes: ["report_lead", "report_daily", "report_weekly", "report_monthly"] },
  translate: { label: "公开全文翻译（含引用帖）", env: "TRANSLATE_MODEL", default: "default", purposes: ["translate_body", "translate_quoted"] },
  localize: { label: "多语言本地化（文章、事件和报刊的中文、俄语、英语读者文字）", env: "LOCALIZE_MODEL", default: "default", purposes: ["localize_article", "localize_story", "localize_report"] },
  translationReview: { label: "翻译审校（启用后对照原文修正文风和术语）", env: "TRANSLATION_REVIEW_MODEL", default: "default", purposes: ["translation_review"] },
  monitor: { label: "Codex 重置公告识别", env: "MONITOR_MODEL", default: "default", purposes: ["monitor.recognize", "monitor.context"] },
} satisfies Record<string, Capability>;

export type CapabilityKey = keyof typeof CAPABILITIES;

let cache: { at: number; overrides: Record<string, string> } | null = null;

async function overrides(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.overrides;
  const rows = await sql<{ key: string; value: { model?: string } }[]>`SELECT key, value FROM settings WHERE key LIKE 'models.%'`;
  const map: Record<string, string> = {};
  for (const r of rows) if (r.value?.model) map[r.key.slice("models.".length)] = r.value.model;
  cache = { at: Date.now(), overrides: map };
  return map;
}

export function invalidateModelCache() {
  cache = null;
}

/** 文件、环境变量和后台都使用同一校验，避免非法配置悄悄退回另一个模型。 */
export function validateCapabilityModel(capability: CapabilityKey, model: string, source = `models.${capability}`): ModelSpec {
  const c: Capability = CAPABILITIES[capability];
  const spec = Object.hasOwn(MODELS, model) ? MODELS[model] : undefined;
  if (!spec) throw new Error(`${source} 配置了未注册模型 ${model}`);
  if (spec.translationOnly && capability !== "translate" && capability !== "localize") {
    throw new Error(`${source} 的 ${model} 仅支持翻译和多语言本地化`);
  }
  if (model !== "default" && !!c.vision !== !!spec.vision) throw new Error(`${source} 的 ${model} 与环节 ${capability} 的视觉能力不匹配`);
  return spec;
}

function selection(capability: CapabilityKey, admin: Record<string, string>) {
  const c: Capability = CAPABILITIES[capability];
  const configuredModel = process.env[c.env] || c.default;
  const model = admin[capability] ?? configuredModel;
  const configuredSource = process.env[c.env] ? modelConfigSource(c.env) ?? "env" : "default";
  const source = admin[capability] ? "admin" as const : configuredSource === "default" ? "default" as const : "env" as const;
  return { model, source, configuredModel, configuredSource, overridden: !!admin[capability] && model !== configuredModel };
}

/** 后台覆盖 > 显式环境变量 > 模型文件 > 代码默认，只影响之后的任务。 */
export async function modelFor(capability: CapabilityKey): Promise<string> {
  const chosen = selection(capability, await overrides());
  validateCapabilityModel(capability, chosen.model, chosen.source === "admin" ? `后台 models.${capability}` : CAPABILITIES[capability].env);
  return chosen.model;
}

export interface ModelSource {
  model: string;
  source: "admin" | "env" | "default";
  error?: string;
}

function modelError(capability: CapabilityKey, model: string, source: string): string | undefined {
  try {
    validateCapabilityModel(capability, model, source);
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
}

/** 展示非法旧值供管理员修复，不影响后台读取；执行任务仍由 modelFor 严格校验。 */
export async function modelSources(): Promise<Record<string, ModelSource>> {
  const o = await overrides();
  const out: Record<string, ModelSource> = {};
  for (const key of Object.keys(CAPABILITIES) as CapabilityKey[]) {
    const { model, source } = selection(key, o);
    const error = modelError(key, model, source === "admin" ? `后台 models.${key}` : CAPABILITIES[key].env);
    out[key] = { model, source, ...(error ? { error } : {}) };
  }
  return out;
}

/** 启动前只读检查：不调用模型、不修改 settings，也不输出密钥或 URL 中的凭据。 */
export async function modelDiagnostics() {
  const o = await overrides();
  return (Object.keys(CAPABILITIES) as CapabilityKey[]).map((capability) => {
    const chosen = selection(capability, o);
    const error = modelError(capability, chosen.model, chosen.source === "admin" ? `后台 models.${capability}` : CAPABILITIES[capability].env);
    const configuredError = modelError(capability, chosen.configuredModel, CAPABILITIES[capability].env);
    const spec = Object.hasOwn(MODELS, chosen.model) ? MODELS[chosen.model] : undefined;
    const rawUrl = spec ? credential("models", spec.baseUrlEnv) : null;
    let baseUrl: string | null = null;
    if (rawUrl) {
      try {
        const safeUrl = new URL(rawUrl);
        safeUrl.username = "";
        safeUrl.password = "";
        safeUrl.search = "";
        safeUrl.hash = "";
        baseUrl = safeUrl.toString();
      } catch {
        baseUrl = "（无效 URL）";
      }
    }
    const credentialConfigured = !!spec && !!credential("models", spec.apiKeyEnv);
    return {
      capability, ...chosen, ...(error ? { error } : {}), ...(configuredError ? { configuredError } : {}),
      service: spec?.service ?? null, baseUrl, credentialConfigured,
      providerConfigured: !error && !!rawUrl && credentialConfigured && !!spec?.model,
    };
  });
}
