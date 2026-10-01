import assert from "node:assert/strict";
import { test } from "node:test";
import { apiPath, localePath, localeFromPath, preferredLocale, stripLocale } from "../app/i18n/locale.ts";
import { createT } from "../app/i18n/translator.ts";
import { dayLabel, relativeTime, fullDateTime, formatNumber } from "../app/lib/format.ts";
import { beijingDate, beijingWeekday } from "@aihot/contracts/time";

test("locale paths preserve public identities, query, fragments and API/admin paths", () => {
  assert.equal(localePath("/items/123?from=hot#summary", "en"), "/en/items/123?from=hot#summary");
  assert.equal(localePath("/ru/topics/acme/page/2?tag=x", "en"), "/en/topics/acme/page/2?tag=x");
  assert.equal(localePath("/", "ru"), "/ru");
  assert.equal(localePath("/?tag=x#article", "en"), "/en?tag=x#article");
  assert.equal(stripLocale("/en"), "/");
  assert.equal(localeFromPath("http://site.local/ru.data?category=tip"), "ru");
  assert.equal(localeFromPath("/admin.data"), "zh");
  for (const path of ["/admin/sources", "/api/site/items/123", "/feed.xml", "/items/123/markdown", "https://example.com", "//example.com", "#section"]) assert.equal(localePath(path, "en"), path);
  assert.equal(apiPath("/api/site/timeline?tag=c%2B%2B&lang=zh", "ru"), "/api/site/timeline?tag=c%2B%2B&lang=ru");
  assert.equal(preferredLocale(new Headers({ cookie: "site_lang=%xx", "accept-language": "fa-IR" })), "en");
});

test("Russian plurals and numeric interpolation follow Intl without changing string identifiers", () => {
  const t = createT("ru");
  for (const [count, ending] of [[1, "публикация"], [2, "публикации"], [5, "публикаций"], [21, "публикация"], [22, "публикации"], [11, "публикаций"]] as const) assert.equal(t("{count} 篇报道", { count }), `${count} ${ending}`);
  assert.equal(createT("en")("{count} 篇报道", { count: 1 }), "1 report");
  assert.equal(createT("en")("{count} 篇报道", { count: 2 }), "2 reports");
  assert.equal(createT("en")("{count} 篇报道", { count: "v2.1.3" }), "v2.1.3 reports");
});

test("localized dates retain the Beijing day, weekday and time", () => {
  const instant = "2026-09-28T16:30:00Z";
  assert.equal(beijingDate(instant), "2026-09-29");
  assert.equal(beijingWeekday("2026-09-29", "en"), "Tuesday");
  assert.equal(dayLabel("2026-09-29", "2026-09-29", "en"), "Today · September 29");
  assert.equal(dayLabel("2026-09-28", "2026-09-29", "ru"), "Вчера · 28 сентября");
  assert.match(fullDateTime(instant, "en"), /00:30/);
  assert.equal(relativeTime(instant, Date.parse(instant) + 120_000, "ru"), "2 минуты назад");
  assert.equal(formatNumber(123, "en"), "123");
});
