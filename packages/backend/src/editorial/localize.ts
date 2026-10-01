import { z } from "zod";
import { TARGET_LOCALES } from "@aihot/contracts/locale";
import { sql } from "../db.ts";
import { shutdownSignal } from "../jobs/queue.ts";
import { chatJson } from "../providers/llm.ts";
import { completeReceipt, rejectReceivedResponse } from "../providers/receipts.ts";
import { articleSourceHash, refreshLocalizedSearch } from "../publication/localized.ts";
import { modelFor } from "./models.ts";
import { promptText, promptVersion } from "./prompts.ts";

const Fields = z.object({ title: z.string().trim().min(1), summary: z.string().trim().min(1), reason: z.string() });
const Item = z.object({ id: z.string(), ru: z.unknown().optional(), en: z.unknown().optional() });
const Output = z.object({ items: z.array(z.unknown()) });
type Card = { id: string; title: string; summary: string; reason: string | null };

export async function localizePending(opts: { limit?: number; budgetMs?: number; batch?: number; articleIds?: string[] } = {}): Promise<{ stored: number; batches: number; errors: string[] }> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 4 * 60_000;
  const rows = await sql<Card[]>`
    SELECT p.article_id AS id, p.title, p.summary, p.reason FROM publications p
    WHERE p.visibility = 'public' AND p.discovered_at > now() - interval '7 days'
      AND ${opts.articleIds ? sql`p.article_id = ANY(${opts.articleIds}::text[])` : sql`true`}
      AND btrim(coalesce(p.title, '')) <> '' AND btrim(coalesce(p.summary, '')) <> ''
      AND EXISTS (SELECT 1 FROM unnest(${[...TARGET_LOCALES]}::text[]) AS target(locale)
        WHERE NOT EXISTS (SELECT 1 FROM localizations l WHERE l.kind = 'article' AND l.ref_id = p.article_id
          AND l.locale = target.locale AND l.source_hash = md5(coalesce(p.title,'') || chr(31) || coalesce(p.summary,'') || chr(31) || coalesce(p.reason,''))))
    ORDER BY p.selected DESC, p.discovered_at DESC, p.article_id DESC LIMIT ${opts.limit ?? 60}`;
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
      const res = await chatJson({ model, purpose: "localize_article", subject: `articles:${cards.map((r) => r.id).join(",")}`,
        system: promptText("localize"), user: JSON.stringify({ items: cards.map((r) => ({ ...r, reason: r.reason ?? "" })) }),
        promptVersion: promptVersion("localize"), schema: Output, temperature: 0.2, maxTokens: 16000,
        timeoutMs: Math.max(1, Math.min(180_000, budget - (Date.now() - started))) });
      batches++;
      const valid = new Map<string, Map<string, z.infer<typeof Fields>>>();
      for (const raw of res.data.items) {
        const parsedItem = Item.safeParse(raw);
        if (!parsedItem.success) continue;
        const item = parsedItem.data;
        if (!snapshot.has(item.id)) continue;
        const languages = valid.get(item.id) ?? new Map();
        for (const locale of TARGET_LOCALES) {
          const parsed = Fields.safeParse(item[locale]);
          if (parsed.success) languages.set(locale, parsed.data);
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
            await tx`INSERT INTO localizations (kind, ref_id, locale, source_hash, fields, receipt_id)
              VALUES ('article', ${card.id}, ${locale}, ${snapshot.get(card.id)!}, ${tx.json(fields)}, ${res.receiptId})
              ON CONFLICT (kind, ref_id, locale) DO UPDATE SET source_hash = EXCLUDED.source_hash, fields = EXCLUDED.fields,
                receipt_id = EXCLUDED.receipt_id, updated_at = now()`;
            saved++;
          }
          await refreshLocalizedSearch(tx, card.id);
        }
        return saved;
      });
      stored += saved;
      // Retry incomplete receipts; complete answers remain reusable after interruption.
      if (cards.some((card) => valid.get(card.id)?.size !== TARGET_LOCALES.length)) {
        await rejectReceivedResponse(res.receiptId, "incomplete localization languages");
      } else {
        await completeReceipt(sql, res.receiptId);
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
