// Share images (1200×630 PNG) for pages, items, reports, topics and events. Only public content
// gets a card; anything else is a real 404.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { categoryLabel } from "@aihot/industry/taxonomy";
import type { Locale } from "@aihot/contracts/locale";
import { pageUrl } from "@aihot/backend/publication/links";
import { localeParam, looseQuery, QueryError, sendProblem } from "../http/respond.ts";
import { pageCards, ogText } from "../og/copy.ts";
import { beijingDate } from "@aihot/contracts/time";
import { loadItemShare } from "@aihot/backend/publication/og";
import { loadReport, type ReportKind } from "@aihot/backend/publication/reports";
import { loadTopic } from "@aihot/backend/publication/topics";
import { loadStoryDetail, resolveStory } from "@aihot/backend/publication/stories";
import { FEATURES } from "@aihot/industry/features";
import { ogEtag, renderOg, type OgCard } from "../og/render.ts";
import { posterEtag, renderPoster, type Poster } from "../og/poster.ts";

/**
 * Article share images carry the title and summary, so shared caches keep them for an hour at most:
 * after a withdrawal or a correction they are gone from any cache within the hour.
 */
export const ARTICLE_IMAGE_CACHE = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600";
const ARTICLE_IMAGE_ORIGIN_SECONDS = "300";

async function send(req: FastifyRequest, reply: FastifyReply, card: OgCard, maxAge: number, cacheControl = `public, max-age=${maxAge}, s-maxage=${maxAge * 7}, stale-while-revalidate=86400`) {
  const tag = `"og-${ogEtag(card)}"`;
  reply.header("ETag", tag).header("Cache-Control", cacheControl);
  if (String(req.headers["if-none-match"] ?? "").split(",").some((t) => t.trim().replace(/^W\//, "") === tag)) return reply.code(304).send();
  return reply.type("image/png").send((await renderOg(card)).png);
}

function notFound(reply: FastifyReply) {
  return reply.code(404).header("Cache-Control", "public, max-age=300").type("text/plain; charset=utf-8").send("Not found");
}

function localized(run: (req: FastifyRequest, reply: FastifyReply, locale: Locale) => Promise<unknown>) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try { return await run(req, reply, localeParam(looseQuery(req).lang)); }
    catch (error) {
      if (error instanceof QueryError) return sendProblem(req, reply, { status: 400, code: "invalid_request", detail: error.message });
      throw error;
    }
  };
}

export function registerOg(app: FastifyInstance) {
  app.get("/og/site.png", localized((req, reply, locale) => send(req, reply, { ...pageCards(locale).site!, locale }, 86400)));

  app.get("/og/pages/:file", localized(async (req, reply, locale) => {
    const name = (req.params as { file: string }).file.replace(/\.png$/, "");
    const card = pageCards(locale)[name];
    if ((name === "leaderboard" && !FEATURES.leaderboard) || (name === "codex-reset" && !FEATURES.codexResetMonitor)) return notFound(reply);
    if (!card || !(req.params as { file: string }).file.endsWith(".png")) return notFound(reply);
    return send(req, reply, { ...card, locale }, 86400);
  }));

  app.get("/og/items/:file", localized(async (req, reply, locale) => {
    const file = (req.params as { file: string }).file;
    if (!file.endsWith(".png")) return notFound(reply);
    const d = await loadItemShare(file.slice(0, -4), locale);
    if (!d) return notFound(reply);
    reply.header("X-Accel-Expires", ARTICLE_IMAGE_ORIGIN_SECONDS);
    return send(req, reply, {
      kicker: d.category ? categoryLabel(d.category, locale) : ogText(locale, "update"),
      title: d.title,
      subtitle: d.summary,
      meta: `${d.source.name.replace(/（[^）]*）\s*$/, "")} · ${beijingDate(d.timelineAt)}`,
      badge: d.selected && d.score !== null ? { value: new Intl.NumberFormat(locale).format(Math.round(d.score)), label: ogText(locale, "score") } : null,
      locale,
    }, 3600, ARTICLE_IMAGE_CACHE);
  }));

  // Phone share poster for an article (1080×1440), generated on first request and cached by content.
  app.get("/og/posters/:file", localized(async (req, reply, locale) => {
    const file = (req.params as { file: string }).file;
    if (!file.endsWith(".png")) return notFound(reply);
    const d = await loadItemShare(file.slice(0, -4), locale);
    if (!d) return notFound(reply);
    const poster: Poster = {
      url: pageUrl(`/items/${d.id}`, locale),
      kicker: d.category ? categoryLabel(d.category, locale) : ogText(locale, "update"),
      title: d.title,
      summary: d.summary,
      source: d.source.name.replace(/（[^）]*）\s*$/, ""),
      date: beijingDate(d.timelineAt),
      score: d.selected ? d.score : null,
      locale,
    };
    const tag = `"poster-${posterEtag(poster)}"`;
    reply.header("ETag", tag).header("Cache-Control", ARTICLE_IMAGE_CACHE).header("X-Accel-Expires", ARTICLE_IMAGE_ORIGIN_SECONDS);
    if (String(req.headers["if-none-match"] ?? "").split(",").some((t) => t.trim().replace(/^W\//, "") === tag)) return reply.code(304).send();
    return reply.type("image/png").send((await renderPoster(poster)).png);
  }));

  app.get("/og/reports/:kind/:file", localized(async (req, reply, locale) => {
    const { kind, file } = req.params as { kind: string; file: string };
    if (!["daily", "weekly", "monthly"].includes(kind) || !file.endsWith(".png")) return notFound(reply);
    const r = await loadReport(kind as ReportKind, file.slice(0, -4), locale);
    if (!r) return notFound(reply);
    return send(req, reply, {
      kicker: `${ogText(locale, r.kind)} · ${r.key}`,
      title: r.lead?.title ?? r.title,
      subtitle: r.lead?.leadParagraph ?? r.overview,
      meta: ogText(locale, "reportMeta", { count: r.stories.length, minutes: r.readingMinutes }),
      locale,
    }, 86400);
  }));

  app.get("/og/topics/:file", localized(async (req, reply, locale) => {
    const file = (req.params as { file: string }).file;
    const t = file.endsWith(".png") ? await loadTopic(file.slice(0, -4), locale) : null;
    if (!t) return notFound(reply);
    return send(req, reply, { kicker: ogText(locale, "topic"), title: t.name, subtitle: t.definition, locale }, 86400);
  }));

  app.get("/og/stories/:file", localized(async (req, reply, locale) => {
    const file = (req.params as { file: string }).file;
    if (!file.endsWith(".png")) return notFound(reply);
    const found = await resolveStory(file.slice(0, -4));
    if (found.kind !== "found") return notFound(reply);
    const s = await loadStoryDetail(found.storyId, new Date(), locale);
    if (!s) return notFound(reply);
    return send(req, reply, {
      kicker: s.whyHot.rank ? ogText(locale, "rank", { rank: s.whyHot.rank }) : ogText(locale, "story"),
      title: s.title,
      subtitle: s.latest ?? s.digest,
      meta: ogText(locale, "storyMeta", { sources: s.sourceCount, reports: s.reportCount }),
      locale,
      accent: s.whyHot.rank ? "hot" : "teal",
    }, 3600);
  }));
}
