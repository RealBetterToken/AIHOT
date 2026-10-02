import { z } from "zod";
import { LOCALES } from "@aihot/contracts/locale";
import { sql } from "../db.ts";
import { shutdownSignal } from "../jobs/queue.ts";
import { chatJson, MODELS } from "../providers/llm.ts";
import { completeReceipt, rejectReceivedResponse } from "../providers/receipts.ts";
import { articleSourceHash, articleTextLocale, refreshLocalizedSearch, validArticleFields } from "../publication/localized.ts";
import { modelFor } from "./models.ts";
import { promptText, promptVersion } from "./prompts.ts";
import { machineLocalizations } from "./machine-translation.ts";
import { translationQualityVersion } from "./translation-policy.ts";

const Fields = z.object({ title: z.string().trim().min(1), summary: z.string().nullable(), reason: z.string().nullable() });
const Item = z.object({ id: z.string(), zh: z.unknown().optional(), ru: z.unknown().optional(), en: z.unknown().optional() });
const Output = z.object({ items: z.array(z.unknown()) });
type Card = { id: string; title: string; summary: string | null; reason: string | null };
const targets = (card: Card) => LOCALES.filter((locale) => locale !== articleTextLocale(card));

export async function localizePending(opts: { limit?: number; budgetMs?: number; batch?: number; articleIds?: string[] } = {}): Promise<{ stored: number; batches: number; errors: string[] }> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 4 * 60_000;
  const rows: Card[] = [];
  const limit = opts.limit ?? 60;
  // 分页校验完整字段，历史卡片以及哈希正确但内容损坏的记录同样进入补译。
  for (let offset = 0; rows.length < limit && Date.now() - started < budget; offset += 200) {
    const candidates = await sql<Card[]>`
      SELECT p.article_id AS id, p.title, p.summary, p.reason FROM publications p
      WHERE p.visibility = 'public'
        AND ${opts.articleIds ? sql`p.article_id = ANY(${opts.articleIds}::text[])` : sql`true`}
        AND btrim(coalesce(p.title, '')) <> ''
      ORDER BY p.selected DESC, p.discovered_at DESC, p.article_id DESC LIMIT 200 OFFSET ${offset}`;
    if (!candidates.length) break;
    const stored = await sql<{ ref_id: string; locale: string; source_hash: string; fields: z.infer<typeof Fields>; quality_version: string }[]>`
      SELECT ref_id, locale, source_hash, fields, quality_version FROM localizations WHERE kind = 'article'
        AND ref_id = ANY(${candidates.map((row) => row.id)}::text[])`;
    for (const card of candidates) {
      if (targets(card).some((locale) => !stored.some((row) => row.ref_id === card.id && row.locale === locale
        && row.source_hash === articleSourceHash(card) && row.quality_version === translationQualityVersion()
        && validArticleFields(row.fields, card, locale)))) rows.push(card);
      if (rows.length >= limit) break;
    }
    if (candidates.length < 200) break;
  }
  const errors: string[] = [];
  let stored = 0;
  let batches = 0;
  const size = Math.max(1, Math.floor(opts.batch ?? 5));
  for (let i = 0; i < rows.length; i += size) {
    if (shutdownSignal.signal.aborted || Date.now() - started >= budget) break;
    const cards = rows.slice(i, i + size);
    const snapshot = new Map(cards.map((r) => [r.id, articleSourceHash(r)]));
    try {
      const model = await modelFor("localize");
      if (shutdownSignal.signal.aborted || Date.now() - started >= budget) break;
      const responses = async function* () {
        if (MODELS[model]?.translationOnly) {
          yield* machineLocalizations(cards.map(({ id, ...fields }) => ({ id, fields, locales: targets({ id, ...fields }) })), {
            model, purpose: "localize_article", subject: `articles:${cards.map((r) => r.id).join(",")}`,
            promptVersion: promptVersion("localize"), deadline: started + budget,
          });
        } else {
          const res = await chatJson({ model, purpose: "localize_article", subject: `articles:${cards.map((r) => r.id).join(",")}`,
            system: promptText("localize"), user: JSON.stringify({ items: cards.map((r) => ({ ...r, reason: r.reason ?? "", targetLocales: targets(r) })) }),
            promptVersion: promptVersion("localize"), schema: Output, temperature: 0.2, maxTokens: 16000,
            timeoutMs: Math.max(1, Math.min(180_000, budget - (Date.now() - started))) });
          yield { ...res, receiptIds: [res.receiptId], locales: LOCALES };
        }
      };
      for await (const res of responses()) {
        batches++;
        const valid = new Map<string, Map<string, z.infer<typeof Fields>>>();
        for (const raw of res.data.items) {
          const parsedItem = Item.safeParse(raw);
          if (!parsedItem.success) continue;
          const item = parsedItem.data;
          if (!snapshot.has(item.id)) continue;
          const languages = valid.get(item.id) ?? new Map();
          for (const locale of targets(cards.find((card) => card.id === item.id)!).filter((locale) => res.locales.includes(locale))) {
            const parsed = Fields.safeParse(item[locale]);
            const card = cards.find((card) => card.id === item.id)!;
            if (parsed.success && validArticleFields(parsed.data, card, locale)) languages.set(locale, parsed.data);
          }
          valid.set(item.id, languages);
        }
        const saved = await sql.begin(async (tx) => {
          let saved = 0;
          for (const card of cards) {
            const [current] = await tx<Card[]>`SELECT article_id AS id, title, summary, reason FROM publications
              WHERE article_id = ${card.id} FOR UPDATE`;
            if (!current || articleSourceHash(current) !== snapshot.get(card.id)) continue;
            for (const [locale, fields] of valid.get(card.id) ?? []) {
              await tx`INSERT INTO localizations (kind, ref_id, locale, source_hash, fields, receipt_id, quality_version)
                VALUES ('article', ${card.id}, ${locale}, ${snapshot.get(card.id)!}, ${tx.json(fields)}, ${res.receiptId}, ${translationQualityVersion()})
                ON CONFLICT (kind, ref_id, locale) DO UPDATE SET source_hash = EXCLUDED.source_hash, fields = EXCLUDED.fields,
                  receipt_id = EXCLUDED.receipt_id, quality_version = EXCLUDED.quality_version, updated_at = now()`;
              saved++;
            }
            await refreshLocalizedSearch(tx, card.id);
          }
          return saved;
        });
        stored += saved;
        // Retry incomplete receipts; complete answers remain reusable after interruption.
        if (cards.some((card) => (valid.get(card.id)?.size ?? 0) !== targets(card).filter((locale) => res.locales.includes(locale)).length)) {
          for (const id of res.receiptIds) await rejectReceivedResponse(id, "incomplete localization languages");
        } else {
          for (const id of res.receiptIds) await completeReceipt(sql, id);
        }
      }
    } catch (error) {
      if (/disabled|not configured|budget/i.test((error as Error).message)) break;
      if (shutdownSignal.signal.aborted || Date.now() - started >= budget) break;
      errors.push((error as Error).message.slice(0, 300));
    }
  }
  return { stored, batches, errors };
}

export { localizePendingStories, localizePendingReports } from "./localize-story-report.ts";
