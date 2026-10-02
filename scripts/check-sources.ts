// 实抓行业配置中的信源，复用正式采集器，不入库、不排任务、不调用付费接口。
// node scripts/check-sources.ts --output /tmp/vibehot-source-check.json
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Candidate, SourceRow } from "../packages/backend/src/sources/types.ts";

const args = process.argv.slice(2);
let output: string | null = null;
let ids: string[] | null = null;
let enabledOnly = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--output" && args[i + 1]) output = args[++i]!;
  else if (args[i] === "--source" && args[i + 1]) ids = args[++i]!.split(",");
  else if (args[i] === "--enabled") enabledOnly = true;
  else throw new Error("用法：check-sources.ts [--enabled] [--source ID,ID] [--output 路径]");
}

// 配置模块在下方动态加载，确保这些开关在读取环境变量之前已关闭。
for (const key of ["COLLECT_ENABLED", "MODEL_CALLS_ENABLED", "FEISHU_CONTENT_PUSH_ENABLED", "FEISHU_INTERNAL_ENABLED", "INDEXNOW_SUBMIT_ENABLED"]) {
  process.env[key] = "false";
}
const { fetchRss } = await import("../packages/backend/src/sources/rss.ts");
const { fetchJsonList } = await import("../packages/backend/src/sources/json-list.ts");
const { fetchWebList, allowed, fetchDetail } = await import("../packages/backend/src/sources/web-list.ts");
const { noiseFiltered } = await import("../packages/backend/src/sources/collect.ts");
const { assertSupportedConfig } = await import("../packages/backend/src/sources/config-keys.ts");
const { guardedFetch } = await import("../packages/backend/src/lib/http-fetch.ts");
const { readable } = await import("../packages/backend/src/content/extract.ts");

const input = readFileSync(path.resolve(import.meta.dirname, "../industry/sources.json"), "utf8");
const sources = (JSON.parse(input) as { sources: SourceRow[] }).sources
  .map((source) => ({ ...source, enabled: source.enabled !== false, cursor: null, fail_count: 0 }));
if (ids?.some((id) => !sources.some((source) => source.id === id))) throw new Error("--source 包含未知信源 ID");
const selected = sources.filter((source) => (!enabledOnly || source.enabled) && (!ids || ids.includes(source.id)));

interface BodyCheck {
  via: "feed" | "detail" | "page" | "none";
  url: string | null;
  chars: number;
  httpStatus?: number;
  error?: string;
}
interface Result {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  checkedAt: string;
  ms: number;
  attempts: number;
  status: "passed" | "failed" | "needs_credentials";
  parsed: number;
  accepted: number;
  dated: number;
  withExcerpt: number;
  withBody: number;
  body: BodyCheck | null;
  samples: Array<{ title: string; url: string; publishedAt: string | null; excerptChars: number; bodyChars: number }>;
  error?: string;
}
const message = (error: unknown) => {
  if (!(error instanceof Error)) return String(error).slice(0, 500);
  const cause = error.cause as { code?: string; message?: string } | undefined;
  return [error.message, cause?.code ?? cause?.message].filter(Boolean).join(": ").slice(0, 500);
};
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const pageCache = new Map<string, Promise<BodyCheck>>();

function checkPage(url: string): Promise<BodyCheck> {
  let pending = pageCache.get(url);
  if (!pending) {
    pending = (async () => {
      try {
        const page = new URL(url);
        if (page.hostname === "t.me" && /^\/[A-Za-z0-9_]+\/[0-9]+\/?$/.test(page.pathname)) page.searchParams.set("embed", "1");
        const res = await guardedFetch(page.href, { timeoutMs: 20_000, maxBytes: 6 * 1024 * 1024 });
        const body = res.status === 200 && /html/.test(res.headers.get("content-type") ?? "") ? readable(res.text(), res.url) : null;
        return { via: body ? "page" : "none", url, chars: body?.text.length ?? 0, httpStatus: res.status };
      } catch (error) {
        return { via: "none", url, chars: 0, error: message(error) };
      }
    })();
    pageCache.set(url, pending);
  }
  return pending;
}

async function check(source: SourceRow): Promise<Result> {
  const started = Date.now();
  const result: Result = { id: source.id, name: source.name, kind: source.kind, enabled: source.enabled,
    checkedAt: new Date().toISOString(), ms: 0, attempts: 1, status: "failed", parsed: 0, accepted: 0, dated: 0,
    withExcerpt: 0, withBody: 0, body: null, samples: [] };
  try {
    assertSupportedConfig(source.kind, source.config);
    if (source.kind === "x_search" || source.kind === "mp_account" || /^https:\/\/r\.jina\.ai\//.test(String(source.config.url ?? ""))) {
      result.status = "needs_credentials";
      result.error = "需要付费服务的凭证、数据库回执和预算；本次公开接口核查不调用该服务";
      return result;
    }
    let candidates: Candidate[];
    if (source.kind === "rss") candidates = (await fetchRss(source, { force: true })).candidates;
    else if (source.kind === "json_list") candidates = await fetchJsonList(source);
    else if (source.kind === "web_list") candidates = await fetchWebList(source);
    else throw new Error(`不支持主动抓取 ${source.kind} 信源`);
    result.parsed = candidates.length;
    candidates = candidates.filter((c) => allowed(c.url, source)).map((c) => {
      const rw = source.config.itemUrlPrefixRewrite;
      return rw?.from && rw?.to && c.url.startsWith(rw.from) ? { ...c, url: rw.to + c.url.slice(rw.from.length) } : c;
    }).filter((c) => !noiseFiltered(c, source));
    if (source.config.sortByPublishedAt) candidates.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
    const cutoff = Date.now() - Number(source.config._aihot?.initialBackfillMonths ?? 12) * 30 * 86_400_000;
    candidates = candidates.filter((c) => !c.publishedAt || c.publishedAt.getTime() >= cutoff)
      .slice(0, Number(source.config._aihot?.initialBackfillLimit ?? 30));
    const seen = new Set<string>();
    candidates = candidates.filter((c) => {
      if (!c.title.trim() || seen.has(c.url)) return false;
      try {
        if (!/^https?:$/.test(new URL(c.url).protocol)) return false;
      } catch { return false; }
      seen.add(c.url);
      return true;
    });
    if (!candidates.length) throw new Error(result.parsed ? "正式过滤与首次回灌窗口内没有有效条目" : "采集器未解析到任何条目");

    // 列表缺日期时复用正式详情规则，最多查一篇，不走付费后备。
    const sample = candidates[0]!;
    if (source.config.detail && (!sample.publishedAt || !sample.bodyText)) {
      try {
        const got = await fetchDetail(sample.url, source, { date: !sample.publishedAt, title: false, summary: !sample.excerpt, body: !sample.bodyText });
        if (got.publishedAt) sample.publishedAt = got.publishedAt;
        if (got.summary) sample.excerpt = got.summary;
        if (got.body) {
          sample.bodyText = got.body.text;
          result.body = { via: "detail", url: sample.url, chars: got.body.text.length };
        }
      } catch (error) {
        result.body = { via: "none", url: sample.url, chars: 0, error: message(error) };
      }
    }
    const whole = candidates.find((c) => c.bodyText?.trim());
    if (whole && !result.body?.chars) result.body = { via: "feed", url: whole.url, chars: whole.bodyText!.length };
    else if (!result.body?.chars) {
      result.body = await checkPage(sample.url);
      // 单篇原文受限或过短时再看一篇，不把整个平台的正文能力等同于首篇结果。
      if (!result.body.chars && candidates[1]) {
        const next = await checkPage(candidates[1].url);
        if (next.chars) result.body = next;
      }
    }
    result.accepted = candidates.length;
    result.dated = candidates.filter((c) => c.publishedAt && Number.isFinite(c.publishedAt.getTime())).length;
    result.withExcerpt = candidates.filter((c) => c.excerpt?.trim()).length;
    result.withBody = candidates.filter((c) => c.bodyText?.trim()).length;
    result.samples = candidates.slice(0, 3).map((c) => ({ title: c.title, url: c.url,
      publishedAt: c.publishedAt && Number.isFinite(c.publishedAt.getTime()) ? c.publishedAt.toISOString() : null,
      excerptChars: c.excerpt?.length ?? 0, bodyChars: c.bodyText?.length ?? 0 }));
    if (source.participation_mode === "editorial" && !result.withExcerpt && !result.withBody && !result.body?.chars) {
      throw new Error("只取得标题、链接等元数据；正文样本和摘要均未取得");
    }
    result.status = "passed";
    return result;
  } catch (error) {
    result.error = message(error);
    return result;
  } finally {
    result.ms = Date.now() - started;
  }
}

// 同一域名串行；最多四个域名同时抓，避免压满公共接口。
const groups = new Map<string, SourceRow[]>();
for (const source of selected) {
  const endpoint = String(source.config.feedUrl ?? source.config.url ?? "");
  const host = endpoint ? new URL(endpoint).hostname : source.kind;
  groups.set(host, [...(groups.get(host) ?? []), source]);
}
const pending = [...groups.values()];
const results: Result[] = [];
const startedAt = new Date().toISOString();
const worker = async () => {
  while (pending.length) {
    const group = pending.shift()!;
    for (let i = 0; i < group.length; i++) {
      if (i && group[i]!.kind !== "x_search" && group[i]!.kind !== "mp_account") await wait(1500);
      let result = await check(group[i]!);
      if (result.status === "failed" && /HTTP (408|425|429|5\d\d)|fetch failed|timeout|aborted/i.test(result.error ?? "")) {
        const first = result;
        await wait(/HTTP 429/.test(result.error ?? "") ? 20_000 : 5000);
        result = await check(group[i]!);
        result.attempts = 2;
        result.ms += first.ms;
        result.checkedAt = first.checkedAt;
      }
      results.push(result);
      console.log(`${results.length}/${selected.length} ${result.status} ${result.id}：解析 ${result.parsed}，接收 ${result.accepted}，正文样本 ${result.body?.chars ?? 0} 字${result.error ? `；${result.error}` : ""}`);
    }
  }
};
await Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker));
results.sort((a, b) => sources.findIndex((s) => s.id === a.id) - sources.findIndex((s) => s.id === b.id));
const failures = results.filter((result) => result.enabled && result.status !== "passed");
const report = { startedAt, finishedAt: new Date().toISOString(), configSha256: createHash("sha256").update(input).digest("hex"),
  totals: { checked: results.length, passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length, needsCredentials: results.filter((r) => r.status === "needs_credentials").length,
    enabled: results.filter((r) => r.enabled).length, enabledFailures: failures.length }, results };
if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`完成：${JSON.stringify(report.totals)}${output ? `；结果：${output}` : ""}`);
process.exitCode = failures.length ? 1 : 0;
