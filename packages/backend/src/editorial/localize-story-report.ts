import { z } from "zod";
import { TARGET_LOCALES, type Locale } from "@aihot/contracts/locale";
import { sql, type Db } from "../db.ts";
import { shutdownSignal } from "../jobs/queue.ts";
import { chatJson, MODELS } from "../providers/llm.ts";
import { completeReceipt, rejectReceivedResponse } from "../providers/receipts.ts";
import { hasReportProse, reportProse, reportSourceHash, storySources, validReportFields, validStoryFields, type ReportSource } from "../publication/localized-story-report.ts";
import { modelFor } from "./models.ts";
import { promptText, promptVersion } from "./prompts.ts";
import { machineLocalizations } from "./machine-translation.ts";
import { translationQualityVersion } from "./translation-policy.ts";

const Output = z.object({ items: z.array(z.unknown()) });
const Item = z.object({ id: z.string(), zh: z.unknown().optional(), ru: z.unknown().optional(), en: z.unknown().optional() });
type Options = { limit?: number; budgetMs?: number; batch?: number };
type Source = { id: string; hash: string; fields: Record<string, unknown> };
type Result = { stored: number; batches: number; errors: string[] };

/** 收到回复后，即使停机也先保存有效语言并结清回执；下一批才检查停机信号。 */
async function localize(kind: "story" | "report", sources: Source[], opts: Options,
  started: number, reload: (db: Db, ids: string[]) => Promise<Source[]>,
  validate: (fields: unknown, source: Source, locale: Locale) => Record<string, unknown> | null): Promise<Result> {
  const budget = opts.budgetMs ?? 4 * 60_000;
  const size = Math.max(1, Math.floor(opts.batch ?? (kind === "story" ? 3 : 1)));
  const errors: string[] = [];
  let stored = 0;
  let batches = 0;
  for (let i = 0; i < sources.length; i += size) {
    if (shutdownSignal.signal.aborted || Date.now() - started >= budget) break;
    const cards = sources.slice(i, i + size);
    const snapshot = new Map(cards.map((r) => [r.id, r]));
    try {
      const model = await modelFor("localize");
      if (shutdownSignal.signal.aborted || Date.now() - started >= budget) break;
      const name = `localize-${kind}`;
      const responses = async function* () {
        if (MODELS[model]?.translationOnly) {
          yield* machineLocalizations(cards.map((card) => ({ ...card, locales: TARGET_LOCALES })), {
            model, purpose: `localize_${kind}`, subject: `${kind}s:${cards.map((r) => r.id).join(",")}`,
            promptVersion: promptVersion(name), deadline: started + budget,
          });
        } else {
          const res = await chatJson({ model, purpose: `localize_${kind}`, subject: `${kind}s:${cards.map((r) => r.id).join(",")}`,
            system: promptText(name), user: JSON.stringify({ items: cards.map((r) => ({ id: r.id, ...r.fields })) }),
            promptVersion: promptVersion(name), schema: Output, temperature: 0.2, maxTokens: 24000,
            timeoutMs: Math.max(1, Math.min(180_000, budget - (Date.now() - started))) });
          yield { ...res, receiptIds: [res.receiptId], locales: TARGET_LOCALES };
        }
      };
      for await (const res of responses()) {
        batches++;
        const valid = new Map<string, Map<string, Record<string, unknown>>>();
        for (const raw of res.data.items) {
          const item = Item.safeParse(raw);
          if (!item.success) continue;
          const source = snapshot.get(item.data.id);
          if (!source) continue;
          const languages = valid.get(source.id) ?? new Map<string, Record<string, unknown>>();
          for (const locale of res.locales) {
            const fields = validate(item.data[locale], source, locale);
            if (fields) languages.set(locale, fields);
          }
          valid.set(source.id, languages);
        }
        stored += await sql.begin(async (tx) => {
          let saved = 0;
          const current = new Map((await reload(tx, cards.map((r) => r.id))).map((r) => [r.id, r]));
          for (const card of cards) {
            // 行锁内重新读取；源文变化、撤回或合并时不写入旧结果。
            if (current.get(card.id)?.hash !== card.hash) continue;
            for (const [locale, fields] of valid.get(card.id) ?? []) {
              await tx`INSERT INTO localizations (kind, ref_id, locale, source_hash, fields, receipt_id, quality_version)
                VALUES (${kind}, ${card.id}, ${locale}, ${card.hash}, ${tx.json(fields as never)}, ${res.receiptId}, ${translationQualityVersion()})
                ON CONFLICT (kind, ref_id, locale) DO UPDATE SET source_hash = EXCLUDED.source_hash, fields = EXCLUDED.fields,
                  receipt_id = EXCLUDED.receipt_id, quality_version = EXCLUDED.quality_version, updated_at = now()`;
              saved++;
            }
          }
          return saved;
        });
        if (cards.some((card) => valid.get(card.id)?.size !== res.locales.length)) {
          for (const id of res.receiptIds) await rejectReceivedResponse(id, "incomplete localization languages");
        } else for (const id of res.receiptIds) await completeReceipt(sql, id);
      }
    } catch (error) {
      if (/disabled|not configured|budget/i.test((error as Error).message)) break;
      if (shutdownSignal.signal.aborted || Date.now() - started >= budget) break;
      errors.push((error as Error).message.slice(0, 300));
    }
  }
  return { stored, batches, errors };
}

const storySource = (r: Awaited<ReturnType<typeof storySources>>[number]): Source => ({
  id: r.public_id, hash: r.source_hash,
  fields: { title: r.title, summary: r.summary, digest: r.digest, latest: r.latest, developments: r.developments },
});

export async function localizePendingStories(opts: Options & { storyIds?: string[] } = {}): Promise<Result> {
  const started = Date.now();
  if (shutdownSignal.signal.aborted || (opts.budgetMs ?? 1) <= 0) return { stored: 0, batches: 0, errors: [] };
  const sources = (await storySources(sql, { ids: opts.storyIds, limit: opts.limit ?? 30, pending: true,
    qualityVersion: translationQualityVersion(), budgetMs: opts.budgetMs })).map(storySource);
  return localize("story", sources, opts, started,
    async (db, ids) => (await storySources(db, { ids, lock: true })).map(storySource),
    (fields, source, locale) => validStoryFields(fields, source.fields as Parameters<typeof validStoryFields>[1], locale));
}

const reportSource = (r: ReportSource): Source => ({ id: `${r.kind}:${r.key}`, hash: reportSourceHash(r.content), fields: reportProse(r.content) });

export async function localizePendingReports(opts: Options & { reportIds?: string[] } = {}): Promise<Result> {
  const started = Date.now();
  const sources: Source[] = [];
  const limit = Math.max(0, Math.floor(opts.limit ?? 12));
  const budget = opts.budgetMs ?? 4 * 60_000;
  // 分页跳过已经完成的期次，既优先近期也能逐步补齐历史；不把完整报刊一次装进内存。
  for (let offset = 0; sources.length < limit && Date.now() - started < budget && !shutdownSignal.signal.aborted; offset += 100) {
    const rows = await sql<ReportSource[]>`SELECT kind, key, content FROM reports
      WHERE ${opts.reportIds ? sql`kind || ':' || key = ANY(${opts.reportIds}::text[])` : sql`true`}
      ORDER BY window_end DESC, kind, key DESC LIMIT 100 OFFSET ${offset}`;
    if (!rows.length) break;
    const stored = await sql<{ ref_id: string; locale: string; source_hash: string; fields: unknown; quality_version: string }[]>`
      SELECT ref_id, locale, source_hash, fields, quality_version FROM localizations WHERE kind = 'report'
        AND ref_id = ANY(${rows.map((r) => `${r.kind}:${r.key}`)}::text[]) AND locale = ANY(${[...TARGET_LOCALES]}::text[])`;
    const byId = new Map(stored.map((r) => [`${r.ref_id}:${r.locale}`, r]));
    for (const row of rows) {
      if (!hasReportProse(row.content)) continue;
      const source = reportSource(row);
      if (TARGET_LOCALES.some((locale) => {
        const found = byId.get(`${source.id}:${locale}`);
        return found?.source_hash !== source.hash || found?.quality_version !== translationQualityVersion()
          || !validReportFields(found.fields, source.fields as Parameters<typeof validReportFields>[1], locale);
      })) sources.push(source);
      if (sources.length >= limit) break;
    }
    if (rows.length < 100) break;
  }
  return localize("report", sources, opts, started, async (db, ids) => {
    const rows = await db<ReportSource[]>`SELECT kind, key, content FROM reports
      WHERE kind || ':' || key = ANY(${ids}::text[]) FOR UPDATE`;
    return rows.filter((r) => hasReportProse(r.content)).map(reportSource);
  }, (fields, source, locale) => validReportFields(fields, source.fields as Parameters<typeof validReportFields>[1], locale));
}
