import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSitemap } from "../packages/backend/src/publication/sitemap-format.ts";

test("站点地图每个公开地址包含三语言版本和互相对应的 alternate", () => {
  const updated = new Date("2026-09-28T00:00:00Z");
  const xml = formatSitemap([{ loc: "/" }, { loc: "/items/example?a=1&b=2", lastmod: updated, priority: 0.5 }], "https://news.example/");
  assert.match(xml, /xmlns:xhtml="http:\/\/www.w3.org\/1999\/xhtml"/);
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => match[1]!);
  assert.equal(urls.length, 6);
  for (const [index, url] of urls.entries()) {
    const suffix = index < 3 ? "" : "/items/example?a=1&amp;b=2";
    for (const lang of ["zh", "ru", "en"]) assert.ok(url.includes(`hreflang="${lang === "zh" ? "zh-CN" : lang}" href="https://news.example/${lang}${suffix}"`));
    assert.ok(url.includes(`hreflang="x-default" href="https://news.example/en${suffix}"`));
    if (index >= 3) assert.ok(url.includes(`<lastmod>${updated.toISOString()}</lastmod>`));
  }
});
