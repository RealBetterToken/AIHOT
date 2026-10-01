// 1200×630 share images. satori lays out text with Noto Sans SC (assets/og-fonts) and emits glyphs
// as paths, so rasterising with sharp needs no system fonts. Output is cached on disk by content.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import satori from "satori";
import sharp from "sharp";
import { SITE } from "@aihot/industry/site";
import { config, REPO_ROOT } from "@aihot/backend/config";
import { DEFAULT_LOCALE, type Locale } from "@aihot/contracts/locale";

export const OG_TEMPLATE_VERSION = "og-2026-09-30.2";
const WIDTH = 1200;
const HEIGHT = 630;
const CACHE_DIR = path.join(config.dataDir, "ogcache");

export interface OgCard {
  locale?: Locale;
  kicker: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  /** Small emphasised figure on the right (e.g. an item score). */
  badge?: { value: string; label: string } | null;
  accent?: "teal" | "hot" | "amber";
}

let fontsPromise: Promise<Array<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }>> | null = null;

export function fonts() {
  fontsPromise ??= Promise.all([
    readFile(path.join(REPO_ROOT, "assets/og-fonts/noto-sans-sc-400.ttf")),
    readFile(path.join(REPO_ROOT, "assets/og-fonts/noto-sans-sc-700.ttf")),
  ]).then(([regular, bold]) => [
    { name: "Noto Sans SC", data: regular, weight: 400, style: "normal" },
    { name: "Noto Sans SC", data: bold, weight: 700, style: "normal" },
  ]);
  return fontsPromise;
}

/** The site's host as shown on cards. */
export const SITE_HOST = new URL(config.siteUrl).host;

/** The site name as a wordmark: bold, with the accent dot the cards use. */
export function nameMark(size: number, color: string, dot: string): Node {
  return h("div", { display: "flex", alignItems: "center" }, [
    h("div", { width: size * 0.36, height: size * 0.36, borderRadius: 999, backgroundColor: dot, marginRight: size * 0.28 }),
    h("div", { display: "flex", fontSize: size, fontWeight: 700, color, letterSpacing: 0.5 }, SITE.name),
  ]);
}

export type Node = { type: string; props: Record<string, unknown> & { style?: Record<string, unknown>; children?: unknown } };
export const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({ type, props: { style, children, ...extra } });

const ACCENTS = { teal: "#2ce2e8", hot: "#ff7a5f", amber: "#e2b454" } as const;

function clamp(text: string, max: number) {
  const chars = [...text.replace(/\s+/g, " ").trim()];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
}

async function tree(card: OgCard): Promise<Node> {
  const accent = ACCENTS[card.accent ?? "teal"];
  const chinese = (card.locale ?? DEFAULT_LOCALE) === "zh";
  const title = clamp(card.title, chinese ? 64 : 120);
  const length = [...title].length / (chinese ? 1 : 1.7);
  const titleSize = length > 55 ? 44 : length > 40 ? 50 : length > 24 ? 58 : 66;
  const longTitle = length > (card.badge ? 28 : 40);
  return h(
    "div",
    {
      width: WIDTH,
      height: HEIGHT,
      display: "flex",
      flexDirection: "column",
      padding: "64px 72px",
      fontFamily: "Noto Sans SC",
      color: "#e6eded",
      backgroundColor: "#0a1012",
      backgroundImage: "radial-gradient(circle at 88% 8%, rgba(44,226,232,0.28), rgba(10,16,18,0) 46%), radial-gradient(circle at 0% 100%, rgba(23,107,117,0.35), rgba(10,16,18,0) 50%)",
    },
    [
      h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [
        nameMark(34, "#e6eded", "#2ce2e8"),
        h("div", { display: "flex", fontSize: 24, color: "#82939a" }, SITE_HOST),
      ]),
      h("div", { display: "flex", marginTop: 56, alignItems: "center" }, [
        h("div", { width: 10, height: 10, borderRadius: 999, backgroundColor: accent, marginRight: 14 }),
        h("div", { display: "flex", fontSize: 28, fontWeight: 700, color: accent, letterSpacing: 1 }, clamp(card.kicker, chinese ? 30 : 45)),
      ]),
      h("div", { display: "flex", flex: 1, marginTop: 22, gap: 40 }, [
        h("div", { display: "flex", flexDirection: "column", flex: 1 }, [
          h("div", { display: "flex", fontSize: titleSize, fontWeight: 700, lineHeight: 1.25, color: "#ffffff" }, title),
          // 带评分的标题列更窄；长标题只留一行摘要，防止挤到页脚。
          card.subtitle ? h("div", { display: "flex", marginTop: 18, fontSize: 26, lineHeight: 1.5, color: "#b1bec0" }, clamp(card.subtitle, (longTitle ? 24 : length > 24 ? 50 : 78) * (chinese ? 1 : 2))) : null,
        ].filter(Boolean)),
        card.badge
          ? h("div", { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 170, height: 170, borderRadius: 999, border: `6px solid ${accent}` }, [
              h("div", { display: "flex", fontSize: 58, fontWeight: 700, color: "#ffffff" }, card.badge.value),
              h("div", { display: "flex", justifyContent: "center", textAlign: "center", width: 145, fontSize: chinese ? 22 : 20, lineHeight: 1.25, color: "#82939a" }, card.badge.label),
            ])
          : null,
      ].filter(Boolean)),
      card.meta ? h("div", { display: "flex", fontSize: 24, color: "#82939a", borderTop: "1px solid rgba(230,237,237,0.12)", paddingTop: 22 }, clamp(card.meta, 70)) : null,
    ].filter(Boolean),
  );
}

/**
 * Palette PNG at full quality with dithering: the flat card and its soft glow look the same as a
 * truecolour PNG at about half the bytes (117 → 62 KB for a typical article card). Share crawlers
 * keep getting PNG.
 */
export const OG_PNG = { compressionLevel: 9, palette: true, quality: 100, dither: 1, effort: 10 } as const;

export function ogEtag(card: OgCard): string {
  return createHash("sha256").update(OG_TEMPLATE_VERSION).update(SITE.name).update(SITE_HOST).update(JSON.stringify({ ...card, locale: card.locale ?? DEFAULT_LOCALE })).digest("hex").slice(0, 24);
}

/** PNG bytes for a card, from the disk cache when this exact card was rendered before. */
const inflight = new Map<string, Promise<{ png: Buffer; etag: string }>>();

export function renderOg(card: OgCard): Promise<{ png: Buffer; etag: string }> {
  const etag = ogEtag(card);
  let job = inflight.get(etag);
  if (!job) {
    job = render(card, etag).finally(() => inflight.delete(etag));
    inflight.set(etag, job);
  }
  return job;
}

async function render(card: OgCard, etag: string): Promise<{ png: Buffer; etag: string }> {
  const file = path.join(CACHE_DIR, `${etag}.png`);
  try {
    return { png: await readFile(file), etag };
  } catch {
    // not cached yet
  }
  const svg = await satori(await tree(card) as never, { width: WIDTH, height: HEIGHT, fonts: await fonts() });
  const png = await sharp(Buffer.from(svg)).png(OG_PNG).toBuffer();
  await mkdir(CACHE_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, png);
  await rename(tmp, file);
  return { png, etag };
}
