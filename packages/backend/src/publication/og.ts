// Share images only need public title/summary metadata. Keep the same page visibility rule without
// loading bodies, translations, related stories or signed media that never appear on these cards.
import type { CategoryKey } from '@aihot/contracts/taxonomy';
import { sql } from '../db.ts';
import { hasItemPage } from './rules.ts';
import { DEFAULT_LOCALE, type Locale } from '@aihot/contracts/locale';
import { localizeArticles } from './localized.ts';

export async function loadItemShare(id: string, locale: Locale = DEFAULT_LOCALE) {
  const [row] = await sql<{
    id: string; title: string; summary: string | null; reason: string | null; category: CategoryKey | null; selected: boolean;
    score: number | null; timeline_at: Date; source_name: string; source_mode: string; visibility: string;
  }[]>`SELECT p.article_id AS id, p.title, p.summary, p.reason, p.category, p.selected, p.score, p.timeline_at,
      s.name AS source_name, s.participation_mode AS source_mode, p.visibility
    FROM publications p JOIN sources s ON s.id = p.source_id WHERE p.article_id = ${id}`;
  if (!row || !hasItemPage({ visibility: row.visibility, sourceMode: row.source_mode })) return null;
  const [localized] = await localizeArticles([row], locale);
  return { id: row.id, title: localized!.title, summary: localized!.summary, category: row.category, selected: row.selected,
    score: row.score === null ? null : Math.round(Number(row.score)), timelineAt: row.timeline_at.toISOString(),
    source: { name: row.source_name } };
}
