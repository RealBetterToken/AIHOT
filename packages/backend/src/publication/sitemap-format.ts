import { LOCALES, type Locale } from "@aihot/contracts/locale";
import { escapeXml } from "../lib/text.ts";

export const SITEMAP_MAX_URLS = 45_000;
const MAX_BYTES = 45 * 1024 * 1024;

export interface SitemapEntry {
  loc: string;
  lastmod?: Date | null;
  changefreq?: string;
  priority?: number;
}

/** 每个公开地址作为一组输出各语言版本，达到文件限制时整组截断。 */
export function formatSitemap(entries: SitemapEntry[], base: string): string {
  const blocks: string[] = [];
  let bytes = 0;
  for (const entry of entries.slice(0, Math.floor(SITEMAP_MAX_URLS / LOCALES.length))) {
    const address = (locale: Locale) => `${base.replace(/\/+$/, "")}/${locale}${entry.loc === "/" ? "" : entry.loc}`;
    const block = LOCALES.map((locale) => {
      const parts = [`<loc>${escapeXml(address(locale))}</loc>`];
      for (const lang of LOCALES) parts.push(`<xhtml:link rel="alternate" hreflang="${lang === "zh" ? "zh-CN" : lang}" href="${escapeXml(address(lang))}" />`);
      parts.push(`<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(address("en"))}" />`);
      if (entry.lastmod) parts.push(`<lastmod>${entry.lastmod.toISOString()}</lastmod>`);
      if (entry.changefreq) parts.push(`<changefreq>${entry.changefreq}</changefreq>`);
      if (entry.priority !== undefined) parts.push(`<priority>${entry.priority}</priority>`);
      return `<url>\n${parts.join("\n")}\n</url>`;
    }).join("\n");
    bytes += Buffer.byteLength(block) + 1;
    if (bytes > MAX_BYTES) break;
    blocks.push(block);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${blocks.join("\n")}\n</urlset>\n`;
}
