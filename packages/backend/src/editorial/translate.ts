// 公开全文由 worker 按目标语言翻译，公开读取不调用模型。
// 分段翻译保留正文结构；图片、代码及链接通过占位符保护，损坏的段落重试一次。
// 每批走回执和预算，未完成的正文保留完整性标记；引用帖按语言共享缓存。
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { z } from "zod";
import { DEFAULT_LOCALE, type Locale } from "@aihot/contracts/locale";
import { BODY_LOCALES, sourceLanguage, sourceLanguageSql, targetLanguage, translationMatchesLocale, translationMatchesLocaleSql } from "../content/language.ts";
import { sql } from "../db.ts";
import { sanitizeBody, textToHtml } from "../content/sanitize.ts";
import { chatJson, MODELS } from "../providers/llm.ts";
import { completeReceipt, rejectReceivedResponse, ProviderRejectedError, ReceiptBusyError } from "../providers/receipts.ts";
import { collapseWhitespace } from "../lib/text.ts";
import { sha256 } from "../lib/ids.ts";
import { modelFor } from "./models.ts";
import { shutdownSignal } from "../jobs/queue.ts";
import { promptText, promptVersion } from "./prompts.ts";
import { machineTranslateBatch, machineTranslateTextNodes, TranslationInterruptedError } from "./machine-translation.ts";
import { translationQualityVersion } from "./translation-policy.ts";

export const TRANSLATE_PROMPT_VERSION = promptVersion("translate-body", "translate-post");
const BATCH_CHARS = 3500;

const BLOCK = new Set(["p", "h2", "h3", "h4", "h5", "li", "blockquote", "figcaption", "td", "th", "dt", "dd", "caption"]);
const CONTAINER = /^(p|h[2-5]|li|blockquote|figcaption|td|th|dt|dd|caption|ul|ol|dl|table|thead|tbody|tfoot|tr|pre|figure|div|picture|video)$/;

const Output = z.object({ t: z.array(z.string()) });


const SYSTEM_BODY = promptText("translate-body");

const SYSTEM_POST = promptText("translate-post");

export interface TranslateResult {
  articleId: string;
  lang: Locale;
  status: "translated" | "partial" | "skipped";
  /** The article revision this result is about: the one read and translated, not a later one. */
  revision?: number;
  segments?: number;
  reason?: string;
}

/** 叶段落和容器中散落的文字按文档顺序分段，代码保持原样。 */
function segmentsOf($: cheerio.CheerioAPI): Element[] {
  const out: Element[] = [];
  const visit = (parent: AnyNode) => {
    if (parent.type === "tag" && /^(pre|code|picture|video)$/.test(parent.name)) return;
    const nodes = $(parent).contents().toArray();
    if (parent.type === "tag" && BLOCK.has(parent.name) && !nodes.some((node) => node.type === "tag" && CONTAINER.test(node.name))) {
      if (shield($(parent).html() ?? '').html.length > BATCH_CHARS) {
        const split = (node: AnyNode) => {
          if (node.type === 'tag' && /^(pre|code|picture|video)$/.test(node.name)) return;
          if (node.type !== 'text') { for (const child of $(node).contents().toArray()) split(child); return; }
          let text = node.data;
          if (!/\p{L}/u.test(text.replace(/https?:\/\/\S+/g,''))) return;
          while (text.length) {
            let end = Math.min(BATCH_CHARS, text.length);
            // 实际发送的是 HTML，实体转义后的片段也必须受上限约束。
            while ($('<span></span>').text(text.slice(0,end)).html()!.length > BATCH_CHARS) end = Math.max(1,Math.floor(end * 0.8));
            if (end < text.length) {
              const boundaries = [...text.slice(0,end).matchAll(/[\s。！？.!?;,，]/g)];
              const boundary = boundaries.at(-1)?.index;
              if (boundary !== undefined && boundary > end / 2) end = boundary + 1;
              else if (/[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
            }
            const part = text.slice(0,end);
            const wrapper = $('<span data-translation-run="" data-translation-text=""></span>').text(part).insertBefore(node);
            if (/\p{L}/u.test(part)) out.push(wrapper[0] as Element);
            text = text.slice(end);
          }
          $(node).remove();
        };
        for (const node of nodes) split(node);
      } else if (/\p{L}/u.test($(parent).text())) out.push(parent);
      return;
    }
    let run: AnyNode[] = [];
    const flush = () => {
      if (!run.length) return;
      const prose = run.map((node) => node.type === "tag" && node.name === "code" ? "" : $(node).text()).join("");
      if (/\p{L}/u.test(prose)) {
        const wrapper = $('<span data-translation-run=""></span>').insertBefore(run[0]!);
        for (const node of run) wrapper.append(node);
        out.push(wrapper[0] as Element);
      }
      run = [];
    };
    for (const node of nodes) {
      if (node.type === "tag" && CONTAINER.test(node.name)) { flush(); visit(node); }
      else if (node.type === "tag" || node.type === "text") run.push(node);
    }
    flush();
  };
  visit($.root()[0]!);
  return out;
}

type TranslationRun = { deadline: number; receipts: Set<number> };
async function translateBatch(articleId: string, revision: number, index: number, parts: string[], system: string, lang: Locale, run: TranslationRun, attemptTag?: string, shields?: Shielded[]): Promise<string[] | null> {
  if (shutdownSignal.signal.aborted) throw new TranslationInterruptedError("worker shutting down");
  const model = await modelFor("translate");
  if (shutdownSignal.signal.aborted) throw new TranslationInterruptedError("worker shutting down");
  const machine = MODELS[model]?.translationOnly;
  const machineOpts = { model, purpose: "translate_body",
    subject: `article:${articleId}@${revision}#${index}:${lang}`, promptVersion: TRANSLATE_PROMPT_VERSION,
    locale: lang, deadline: run.deadline, attemptTag, plain: !shields };
  const machineRes = machine ? (attemptTag === "retry" && shields
    ? await machineTranslateTextNodes(parts, machineOpts)
    : await machineTranslateBatch(parts, machineOpts)) : null;
  if (machineRes && !machineRes.parts) return null;
  const res = machineRes ? { data: { t: machineRes.parts! }, receiptId: null } : await chatJson({
    model,
    purpose: "translate_body",
    subject: `article:${articleId}@${revision}#${index}:${lang}`,
    promptVersion: TRANSLATE_PROMPT_VERSION,
    system,
    user: JSON.stringify({ targetLanguage: targetLanguage(lang), segments: parts }),
    schema: Output,
    temperature: 0.2,
    maxTokens: Math.min(8000, Math.ceil(parts.join("").length * 1.2) + 400),
    timeoutMs: Math.max(1, Math.min(180_000, run.deadline - Date.now())),
    attemptTag,
  });
  // 停机保留已收到的回执，恢复时再校验，不将中断记作失败。
  if (shutdownSignal.signal.aborted) throw new TranslationInterruptedError("worker shutting down");
  const prose = (text: string) => cheerio.load(text, null, false).root().text()
    .replace(/⟦\d+⟧|```[\s\S]*?```|`[^`]+`|https?:\/\/\S+/g, "");
  const valid = res.data.t.length === parts.length && res.data.t.every((text, index) => text.trim()
    && (!/\p{L}/u.test(prose(parts[index]!)) || /\p{L}/u.test(prose(text)))
    && translationMatchesLocale(prose(text), lang) && (!shields || unshield(text, shields[index]!) !== null));
  const receiptIds = machineRes?.receiptIds ?? [res.receiptId!];
  if (!valid) {
    for (const id of receiptIds) await rejectReceivedResponse(id, "invalid translation language, segments or protected content");
    return null;
  }
  for (const id of receiptIds) run.receipts.add(id);
  return res.data.t;
}

/** Translates batches, halving a batch once when the answer does not line up with the input. */
async function translateAll(articleId: string, revision: number, parts: string[], system: string, lang: Locale, run: TranslationRun, attemptTag?: string, shields?: Shielded[]): Promise<Array<string | null>> {
  const out: Array<string | null> = new Array(parts.length).fill(null);
  let start = 0;
  let index = 0;
  while (start < parts.length) {
    if (Date.now() >= run.deadline) break;
    let end = start;
    let chars = 0;
    while (end < parts.length && (end === start || chars + parts[end]!.length <= BATCH_CHARS)) chars += parts[end++]!.length;
    const batch = parts.slice(start, end);
    let done = await translateBatch(articleId, revision, index++, batch, system, lang, run, attemptTag, shields?.slice(start, end));
    if (!done && batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      const left = await translateBatch(articleId, revision, index++, batch.slice(0, mid), system, lang, run, attemptTag, shields?.slice(start, start + mid));
      const right = Date.now() < run.deadline ? await translateBatch(articleId, revision, index++, batch.slice(mid), system, lang, run, attemptTag, shields?.slice(start + mid, end)) : null;
      // 一半失败不能丢掉另一半已通过校验的译文。
      left?.forEach((text, i) => { out[start + i] = text; });
      right?.forEach((text, i) => { out[start + mid + i] = text; });
    }
    if (done) done.forEach((t, i) => (out[start + i] = t));
    start = end;
  }
  return out;
}

/** A block as the model sees it: media and inline code as ⟦n⟧, links as <a id="Ln"> with their attributes kept here. */
interface Shielded {
  html: string;
  tokens: string[];
  links: Array<Record<string, string>>;
}

export function shield(inner: string): Shielded {
  const $ = cheerio.load(inner, null, false);
  const tokens: string[] = [];
  for (const node of $("picture, video, img, code").toArray()) {
    if ($(node).parents("picture, video, code").length) continue;
    tokens.push($.html(node));
    $(node).replaceWith(`⟦${tokens.length - 1}⟧`);
  }
  // 文本节点中的裸 URL 和 Markdown 代码也不交给翻译模型改写。
  const nodes = new Set([...$.root().contents().toArray(), ...$("*").contents().toArray()]);
  for (const node of nodes) {
    if (node.type !== "text") continue;
    node.data = node.data.replace(/```[\s\S]*?```|`[^`]+`|https?:\/\/[^\s<>]+/g, (text) => {
      tokens.push($("<span></span>").text(text).html()!);
      return `⟦${tokens.length - 1}⟧`;
    });
  }
  const links: Shielded["links"] = [];
  $("a").each((i, a) => {
    links.push({ ...(a as Element).attribs });
    (a as Element).attribs = { id: `L${i}` };
  });
  return { html: $.html(), tokens, links };
}

/** The translated block with its media, code and links put back; null when the answer lost or repeated any. */
export function unshield(translated: string, s: Shielded): string | null {
  const counts = new Map<number, number>();
  for (const m of translated.matchAll(/⟦(\d+)⟧/g)) counts.set(Number(m[1]), (counts.get(Number(m[1])) ?? 0) + 1);
  if (counts.size !== s.tokens.length || s.tokens.some((_t, i) => counts.get(i) !== 1)) return null;
  const $ = cheerio.load(translated, null, false);
  const source = cheerio.load(s.html, null, false);
  const structure = (doc: cheerio.CheerioAPI) => doc('*').toArray().map((node) => (node as Element).name).sort().join(',');
  if (structure($) !== structure(source)) return null;
  const seen = new Set<number>();
  let intact = true;
  $("a").each((_i, a) => {
    const n = /^L(\d+)$/.exec((a as Element).attribs.id ?? "")?.[1];
    const attribs = n === undefined ? undefined : s.links[Number(n)];
    if (!attribs || seen.has(Number(n))) intact = false;
    else {
      seen.add(Number(n));
      (a as Element).attribs = attribs;
    }
  });
  if (!intact || seen.size !== s.links.length) return null;
  return $.html().replace(/⟦(\d+)⟧/g, (_m, n: string) => s.tokens[Number(n)]!);
}

export async function translateArticle(articleId: string, lang: Locale = DEFAULT_LOCALE, opts: { budgetMs?: number } = {}): Promise<TranslateResult> {
  const run: TranslationRun = { deadline: Date.now() + (opts.budgetMs ?? 4 * 60_000), receipts: new Set() };
  const finishReceipts = async () => { for (const id of run.receipts) await completeReceipt(sql, id); };
  const [row] = await sql<{ revision: number; channel: string; language: string | null; body_html: string | null; body_text: string | null; x_post: { text?: string } | null; title: string; selected: boolean; body_mode: string; visibility: string }[]>`
    SELECT a.revision, p.channel, a.language, a.body_html, a.body_text, a.x_post, p.title, p.selected, p.body_mode, p.visibility
    FROM publications p JOIN articles a ON a.id = p.article_id WHERE p.article_id = ${articleId}`;
  if (!row) return { articleId, lang, status: "skipped", reason: "not published" };
  const result = (r: Omit<TranslateResult, "articleId" | "lang" | "revision">): TranslateResult => ({ articleId, lang, revision: row.revision, ...r });
  if (row.visibility !== "public" || row.body_mode !== "full") return result({ status: "skipped", reason: "not a public full-text item" });

  if (sourceLanguage(row.language, row.body_text ?? row.x_post?.text ?? "") === lang) return result({ status: "skipped", reason: "same language" });

  const [cached] = await sql<{ body_html: string; body_text: string }[]>`
    SELECT body_html,body_text FROM translations WHERE article_id=${articleId} AND lang=${lang}
      AND revision=${row.revision} AND complete AND coverage_version >= 1
      AND quality_version = ${translationQualityVersion()}
      AND coalesce(body_html,'') <> '' AND coalesce(body_text,'') <> ''`;
  // 已完成的正文直接复用，避免重新尝试此前被拒绝的付费批次。
  if (cached && translationMatchesLocale(cached.body_html, lang)) return result({ status: "translated" });

  if (row.channel === "x") {
    const text = String(row.x_post?.text ?? row.body_text ?? "").trim();
    const meaningful = collapseWhitespace(text.replace(/https?:\/\/\S+/g, ""));
    if (!/\p{L}/u.test(meaningful)) return result({ status: "skipped", reason: "no translatable text" });
    const [t] = await translateAll(articleId, row.revision, [text], SYSTEM_POST, lang, run);
    if (!t?.trim()) return result({ status: "skipped", reason: "translation did not line up" });
    await store(articleId, row.revision, row.title, textToHtml(t), t, true, lang);
    await finishReceipts();
    return result({ status: "translated", segments: 1 });
  }

  if (!row.body_html) return result({ status: "skipped", reason: "no body" });
  const $ = cheerio.load(sanitizeBody(row.body_html), null, false);
  const blocks = segmentsOf($);
  if (!blocks.length) return result({ status: "skipped", reason: "no translatable text" });
  // 时间和费用仍受安全阀约束；已成功段落复用回执，长文可在后续轮次补齐。
  const chosen = blocks;
  const shielded = chosen.map((el) => shield($(el).html() ?? ""));
  const restore = (answers: Array<string | null>) => answers.map((t, i) => (t === null ? null : unshield(t, shielded[i]!)));
  const translations = restore(await translateAll(articleId, row.revision, shielded.map((b) => b.html), SYSTEM_BODY, lang, run, undefined, shielded));
  // Blocks whose answer dropped a link or an image are asked once more, on their own receipt.
  const missing = translations.flatMap((t, i) => (t === null ? [i] : []));
  if (missing.length && Date.now() < run.deadline) {
    const again = await translateAll(articleId, row.revision, missing.map((i) => shielded[i]!.html), SYSTEM_BODY, lang, run, "retry", missing.map((i) => shielded[i]!));
    missing.forEach((i, k) => (translations[i] = again[k] ? unshield(again[k]!, shielded[i]!) : null));
  }
  let done = 0;
  chosen.forEach((el, i) => {
    const t = translations[i];
    if (t) {
      const original = $(el).text();
      $(el).html(el.attribs['data-translation-text'] !== undefined ? `${original.match(/^\s*/)?.[0] ?? ''}${t.trim()}${original.match(/\s*$/)?.[0] ?? ''}` : t);
      done += 1;
    }
  });
  if (!done) return result({ status: "skipped", reason: "no batch translated" });
  const complete = done === blocks.length;
  $('[data-translation-run]').each((_i, el) => { $(el).replaceWith($(el).contents()); });
  const html = sanitizeBody($.html());
  await store(articleId, row.revision, row.title, html, cheerio.load(html, null, false).root().text().trim(), complete, lang);
  await finishReceipts();
  return result({ status: complete ? "translated" : "partial", segments: done });
}

async function store(articleId: string, revision: number, title: string, html: string, text: string, complete: boolean, lang: Locale) {
  // Never over a translation of a later revision (a slow run finishing after a newer one).
  await sql`
    INSERT INTO translations (article_id, lang, revision, title, body_html, body_text, complete, origin, coverage_version, quality_version)
    VALUES (${articleId}, ${lang}, ${revision}, ${title}, ${html}, ${text}, ${complete}, 'model', 1, ${translationQualityVersion()})
    ON CONFLICT (article_id, lang) DO UPDATE SET revision = EXCLUDED.revision, title = EXCLUDED.title, body_html = EXCLUDED.body_html,
      body_text = EXCLUDED.body_text, complete = EXCLUDED.complete, origin = 'model', coverage_version = EXCLUDED.coverage_version,
      quality_version = EXCLUDED.quality_version, created_at = now()
    WHERE translations.origin <> 'source' AND translations.revision <= EXCLUDED.revision
      AND (translations.revision < EXCLUDED.revision OR NOT translations.complete OR EXCLUDED.complete)`;
}

/** 引用帖缓存按目标语言共享；旧 text_zh 仍可作为中文缓存读取。 */
export async function translateQuotes(opts: { days?: number; limit?: number; budgetMs?: number; articleIds?: string[] } = {}): Promise<number> {
  const started = Date.now();
  const rows = await sql<{ tweet_id: string; text: string; discovered_at: Date }[]>`
    SELECT DISTINCT ON (q.tweet_id) q.tweet_id, a.x_post->'quoted'->>'text' AS text, p.discovered_at
    FROM publications p JOIN articles a ON a.id = p.article_id
    CROSS JOIN LATERAL (SELECT substring(a.x_post->'quoted'->>'url' from '/status/([0-9]+)') AS tweet_id) q
    WHERE p.channel = 'x' AND p.visibility = 'public' AND p.body_mode = 'full'
      AND ${opts.days === undefined ? sql`true` : sql`p.discovered_at > now() - make_interval(days => ${opts.days})`}
      AND ${opts.articleIds ? sql`p.article_id = ANY(${opts.articleIds}::text[])` : sql`true`}
      AND q.tweet_id IS NOT NULL AND coalesce(a.x_post->'quoted'->>'text', '') <> ''
    ORDER BY q.tweet_id, p.discovered_at DESC`;
  rows.sort((a, b) => b.discovered_at.getTime() - a.discovered_at.getTime());
  let stored = 0;
  for (const r of rows) {
    const hash = sha256(r.text);
    const meaningful = collapseWhitespace(r.text.replace(/https?:\/\/\S+/g, " "));
    if (!/\p{L}/u.test(meaningful)) continue;
    for (const lang of BODY_LOCALES) {
      if (stored >= (opts.limit ?? 30) || Date.now() - started > (opts.budgetMs ?? 2 * 60_000) || shutdownSignal.signal.aborted) return stored;
      if (sourceLanguage(null, r.text) === lang) continue;
      const caches = await sql`
        SELECT text_hash, text FROM quote_translations_lang WHERE tweet_id = ${r.tweet_id} AND lang = ${lang}
        UNION ALL SELECT text_hash, text_zh AS text FROM quote_translations WHERE tweet_id = ${r.tweet_id} AND ${lang} = 'zh'`;
      if (caches.some(cache => cache.text_hash === hash && cache.text?.trim() && translationMatchesLocale(cache.text, lang))) continue;
      const [own] = await sql<{ body_text: string | null }[]>`
        SELECT tr.body_text FROM articles o JOIN translations tr ON tr.article_id = o.id AND tr.lang = ${lang} AND tr.revision >= o.revision
        WHERE o.identity_key = 'x:' || ${r.tweet_id} AND tr.complete AND coalesce(tr.body_text, '') <> ''
          AND coalesce(o.x_post->>'text', o.body_text) = ${r.text}`;
      let text = own?.body_text;
      if (text && !translationMatchesLocale(text, lang)) text = null;
      let receiptIds: number[] = [];
      let origin: "reused" | "model" = "reused";
      if (!text) {
        origin = "model";
        try {
          if (shutdownSignal.signal.aborted) return stored;
          const model = await modelFor("translate");
          if (shutdownSignal.signal.aborted) return stored;
          const machineRes = MODELS[model]?.translationOnly ? await machineTranslateBatch([r.text], {
            model, purpose: "translate_quoted", subject: `quote:${r.tweet_id}:${lang}`,
            promptVersion: TRANSLATE_PROMPT_VERSION, locale: lang, deadline: started + (opts.budgetMs ?? 2 * 60_000), plain: true,
          }) : null;
          if (machineRes && !machineRes.parts) continue;
          const res = machineRes ? { data: { t: machineRes.parts! }, receiptId: machineRes.receiptId } : await chatJson({
            model, purpose: "translate_quoted", subject: `quote:${r.tweet_id}:${lang}`, promptVersion: TRANSLATE_PROMPT_VERSION,
            system: SYSTEM_POST, user: JSON.stringify({ targetLanguage: targetLanguage(lang), segments: [r.text] }), schema: Output, temperature: 0.2,
            maxTokens: Math.min(4000, Math.ceil(r.text.length * 1.5) + 200), timeoutMs: 120_000,
          });
          text = res.data.t.length === 1 ? res.data.t[0]!.trim() : null;
          if (!text || !translationMatchesLocale(text, lang)) {
            await rejectReceivedResponse(res.receiptId, "invalid quoted translation language or segments");
            continue;
          }
          receiptIds = machineRes?.receiptIds ?? [res.receiptId];
        } catch (error) {
          if (error instanceof ProviderRejectedError && error.status === 402) throw error;
          if (/disabled|not configured|budget/i.test((error as Error).message)) throw error;
          continue;
        }
      }
      if (!text) continue;
      await sql`
        INSERT INTO quote_translations_lang (tweet_id, lang, text_hash, text, origin) VALUES (${r.tweet_id}, ${lang}, ${hash}, ${text}, ${origin})
        ON CONFLICT (tweet_id, lang) DO UPDATE SET text_hash = EXCLUDED.text_hash, text = EXCLUDED.text, origin = EXCLUDED.origin, created_at = now()`;
      for (const id of receiptIds) await completeReceipt(sql, id);
      stored += 1;
    }
  }
  return stored;
}

/** 精选优先，覆盖历史公开全文；失败按语言独立冷却，成功段落复用回执。 */
export async function translatePending(opts: { limit?: number; budgetMs?: number; articleIds?: string[] } = {}): Promise<{ done: TranslateResult[]; quotes: number }> {
  const started = Date.now();
  const rows = await sql<{ article_id: string; lang: Locale; revision: number }[]>`
    SELECT p.article_id, target.lang, a.revision FROM publications p JOIN articles a ON a.id = p.article_id
    CROSS JOIN (VALUES ('zh'), ('ru'), ('en')) AS target(lang)
    LEFT JOIN translations tr ON tr.article_id = p.article_id AND tr.lang = target.lang
    WHERE p.visibility = 'public' AND p.body_mode = 'full' AND target.lang <> ${sourceLanguageSql()}
      AND ${opts.articleIds ? sql`p.article_id = ANY(${opts.articleIds}::text[])` : sql`true`}
      AND (coalesce(a.body_html, '') <> '' OR (p.channel = 'x' AND coalesce(a.x_post->>'text',a.body_text,'') <> ''))
      AND (tr.article_id IS NULL OR (tr.origin <> 'source' AND (tr.revision < a.revision OR NOT tr.complete OR tr.coverage_version < 1
        OR tr.quality_version <> ${translationQualityVersion()}
        OR coalesce(tr.body_html,'') = '' OR coalesce(tr.body_text,'') = ''
        OR NOT ${translationMatchesLocaleSql(sql`target.lang`, sql`tr.body_html`)})))
      AND NOT EXISTS (SELECT 1 FROM translation_attempts_lang t WHERE t.article_id = p.article_id AND t.lang = target.lang AND t.revision = a.revision
                      AND t.outcome <> 'translated' AND t.updated_at > now() - CASE WHEN t.attempts >= 3 THEN interval '1 day' ELSE interval '15 minutes' END)
    ORDER BY p.selected DESC, p.selected_ready_at DESC NULLS LAST, p.discovered_at DESC, p.article_id, target.lang DESC LIMIT ${opts.limit ?? 30}`;
  const done: TranslateResult[] = [];
  for (const r of rows) {
    if (Date.now() - started > (opts.budgetMs ?? 4 * 60_000) || shutdownSignal.signal.aborted) break;
    let outcome: "translated" | "partial" | "skipped" | "failed";
    let reason: string | null = null;
    let revision = r.revision;
    try {
      const result = await translateArticle(r.article_id, r.lang, { budgetMs: (opts.budgetMs ?? 4 * 60_000) - (Date.now() - started) });
      done.push(result);
      outcome = result.status;
      reason = result.reason ?? null;
      revision = result.revision ?? revision;
    } catch (error) {
      if (error instanceof TranslationInterruptedError) break;
      // 另一个任务已在翻译该语言，等待回执不会消耗失败重试。
      if (error instanceof ReceiptBusyError) continue;
      // 账户余额不足影响全部文章，等待充值，不能耗尽每篇文章的语言重试配额。
      if (error instanceof ProviderRejectedError && error.status === 402) return { done, quotes: 0 };
      const message = (error as Error).message;
      if (/disabled|not configured|budget/i.test(message)) break;
      done.push({ articleId: r.article_id, lang: r.lang, status: "skipped", reason: message.slice(0, 200) });
      outcome = "failed";
      reason = message.slice(0, 300);
    }
    await sql`
      INSERT INTO translation_attempts_lang (article_id, lang, revision, attempts, outcome, reason)
      VALUES (${r.article_id}, ${r.lang}, ${revision}, 1, ${outcome}, ${reason})
      ON CONFLICT (article_id, lang) DO UPDATE SET
        attempts = CASE WHEN translation_attempts_lang.revision = EXCLUDED.revision AND translation_attempts_lang.updated_at > now() - interval '1 day' THEN translation_attempts_lang.attempts + 1 ELSE 1 END,
        revision = EXCLUDED.revision, outcome = EXCLUDED.outcome, reason = EXCLUDED.reason, updated_at = now()`;
  }
  const budgetMs = opts.budgetMs ?? 4 * 60_000;
  let quotes = 0;
  const left = budgetMs - (Date.now() - started);
  if (left > 0 && !shutdownSignal.signal.aborted) {
    try {
      quotes = await translateQuotes({ budgetMs: left, articleIds: opts.articleIds });
    } catch (error) {
      if (error instanceof ProviderRejectedError && error.status === 402) return { done, quotes };
      if (error instanceof TranslationInterruptedError || /disabled|not configured|budget/i.test((error as Error).message)) return { done, quotes };
      throw error;
    }
  }
  return { done, quotes };
}
