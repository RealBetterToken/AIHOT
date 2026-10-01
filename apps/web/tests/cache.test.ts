// Run after `npm run build -w @aihot/web`. Real production server/router, synthetic HTTP API only.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { CATEGORY_KEYS } from "@aihot/contracts/taxonomy";
import { releaseBoundCache } from "../app/lib/api.server.ts";

let web: ChildProcess;
let origin: string;
let logs = "";
let deadline: number;
let refreshAt: string;
let metaDelayMs = 0;
const apiLocales: Array<{ path: string; locale: string | null }> = [];
const apiCookies: Array<string | undefined> = [];
const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://api.local");
  apiCookies.push(req.headers.cookie);
  if (url.pathname.startsWith("/api/site/")) apiLocales.push({ path: url.pathname, locale: url.searchParams.get("lang") });
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/api/site/meta") {
    const respond = () => res.end(JSON.stringify({ changelogVersion: "2026-09-28T12:00" }));
    return metaDelayMs ? setTimeout(respond, metaDelayMs) : respond();
  }
  if (url.pathname === "/api/site/timeline") {
    const filters = { channel: "all", category: url.searchParams.get("category"), tag: null, topic: null };
    res.setHeader("X-Accel-Expires", `@${deadline}`);
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
    return res.end(JSON.stringify({ filters, cards: [], nextCursor: null, refreshAt, dayCounts: [], hot: null, generatedAt: "2026-09-28T00:00:00Z" }));
  }
  if (url.pathname === "/api/site/hot") return res.end(JSON.stringify({ computedAt: null, ruleVersion: "v1", windowHours: 48, entries: [] }));
  if (url.pathname === "/api/site/pool") return res.end(JSON.stringify({ filters: { channel: "all", category: null, tag: null, topic: null, q: null, tab: "time" }, items: [], page: 1, pageCount: 1, total: 0, todayCount: 0, freshness: "2026-09-28T00:00:00Z", generatedAt: "2026-09-28T00:00:00Z" }));
  const topicLanguage = url.searchParams.get("lang") ?? "zh";
  const topicNames = { zh: ["数据库主题名", "数据库中的主题定义", "模型与工具", "按模型和工具追踪"], ru: ["Тема из базы", "Описание темы из базы", "Модели и инструменты", "Следите за моделями и инструментами"], en: ["Database topic", "Database topic definition", "Models and tools", "Follow models and tools"] };
  const topicCopy = topicNames[topicLanguage as keyof typeof topicNames] ?? topicNames.zh;
  if (url.pathname === "/api/site/topics") return res.end(JSON.stringify({ topics: [], groups: [{ key: "company", name: topicCopy[2], blurb: topicCopy[3] }] }));
  if (url.pathname === "/api/site/topics/example") return res.end(JSON.stringify({ topic: { slug: "example", name: topicCopy[0], group: "topic", definition: topicCopy[1], total: 0, indexable: true, related: [] }, items: [], page: Number(url.searchParams.get("page") ?? 1), pageCount: 2 }));
  const run = { id: "preview", methodologyVersion: "v15.1.3", generatedAt: "2026-09-28T00:00:00Z", fx: null };
  if (/^\/api\/site\/leaderboard\/boards\//.test(url.pathname)) return res.end(JSON.stringify({ run, board: { key: url.pathname.split("/").at(-1), name: "综合", title: "综合榜", description: "按多项公开评测的共同证据排名", howToRead: "", sourceCount: 0, operatorCount: 0, modelCount: 0 }, tabs: [], entries: [] }));
  if (url.pathname === "/api/site/leaderboard/sources") return res.end(JSON.stringify({ run, rankedCount: 0, totalCount: 0, groups: [] }));
  if (url.pathname === "/api/site/leaderboard/rules") return res.end(JSON.stringify({ run, budgets: [], anchors: ["Example v2.1.3"] }));
  if (url.pathname === "/api/site/leaderboard/models/example") return res.end(JSON.stringify({ run, model: { slug: "example", name: "Example v2.1.3", provider: "Example", releasedAt: null, brand: { src: null, monogram: "E", raster: false }, contextWindowTokens: null }, price: null, overall: { rank: null, score: null, onBoard: false, confidence: null, stability: null }, categories: [], metricCount: 0, evidence: [], unmeasured: [], comparisons: [] }));
  if (url.pathname === "/api/site/leaderboard/sources/example") return res.end(JSON.stringify({ run, source: { key: "example", name: "Example", operator: "Example", description: "", status: "awaiting", brand: null, budget: null, fullName: "Example v2.1.3", area: null, group: { key: "example", name: "Example" }, officialUrl: null, what: "", usage: "", limits: "", license: "", attribution: "" }, upstreamAt: null, syncedAt: null, collected: false, rows: [], systemRows: false, rowsNote: null }));
  if (url.pathname === "/api/site/codex-reset") return res.end(JSON.stringify({ schemaVersion: 1, timezone: "Asia/Shanghai", today: "2026-09-28", selectedDate: "2026-09-28", checkedAt: null, historyFrom: null, count: 0, events: [], current: null, lastLanded: null, authorAvatar: null, monitor: null, outage: null, stats: { resets90: 0, credits90: 0, medianIntervalDays: null, lastResetDate: null }, calendar: [], confirmMinutes: [], version: "v2.1.3" }));
  if (/^\/api\/site\/codex-reset\/days\//.test(url.pathname)) return res.end(JSON.stringify({ date: url.pathname.split("/").at(-1), version: "v2.1.3", events: [] }));
  if (url.pathname === "/api/site/codex-reset/version") return res.end(JSON.stringify({ version: "v2.1.3" }));
  if (/^\/api\/site\/reports\/(daily|weekly|monthly)\/latest-page$/.test(url.pathname)) return res.end(JSON.stringify({ index: [], report: null }));
  if (url.pathname === "/api/site/reports/daily") return res.end(JSON.stringify({ items: [] }));
  if (/^\/api\/site\/reports\/(daily|weekly|monthly)\/navigation\//.test(url.pathname)) return res.end(JSON.stringify({ items: [{ key: url.pathname.split("/").at(-1), title: "Example report", count: 0 }] }));
  if (/^\/api\/site\/reports\/(daily|weekly|monthly)\/(2026-09-28|2026-W40|2026-09)$/.test(url.pathname)) return res.end(JSON.stringify({ kind: url.pathname.split("/")[4], key: url.pathname.split("/").at(-1), title: "Example report", windowStart: "2026-09-27T16:00:00Z", windowEnd: "2026-09-28T16:00:00Z", generatedAt: "2026-09-28T00:00:00Z", revision: 1, lead: null, overview: null, highlights: [], sections: [], stories: [], flashes: [], cover: null, metrics: {}, readingMinutes: 0, prev: null, next: null }));
  if (url.pathname === "/api/site/changelog") return res.end(JSON.stringify({ latestVersion: "v2.1.3", releases: [] }));
  if (url.pathname === "/api/health") return res.end(JSON.stringify({ ok: true }));
  if (url.pathname === "/api/site/echo-client") return res.end(JSON.stringify({ forwarded: req.headers["x-forwarded-for"], real: req.headers["x-real-ip"] }));
  if (url.pathname === "/api/site/items/long-lived") return res.end(JSON.stringify({ id: "long-lived", title: "t" }));
  if (/^\/api\/site\/items\/body-example(?:\/original)?$/.test(url.pathname)) {
    const locale = url.searchParams.get("lang") ?? "zh";
    const original = url.pathname.endsWith("/original") || locale === "en";
    const text = {zh:"这是一篇中文正文译文。",ru:"Это русский перевод статьи.",en:"This is the original English body."}[locale as "zh"|"ru"|"en"];
    return res.end(JSON.stringify({id:"body-example",revision:1,title:"Body example",originalTitle:null,summary:"Body summary",reason:null,source:{id:"example",name:"Example",kind:"rss",firstParty:false,iconUrl:null},links:{aihot:"/items/body-example",original:"https://example.com"},publishedAt:"2026-09-28T00:00:00Z",discoveredAt:"2026-09-28T00:00:00Z",timelineAt:"2026-09-28T00:00:00Z",category:CATEGORY_KEYS[0],tags:[],score:null,selected:true,channel:"x",story:null,x:{authorName:"Author",handle:"author",avatarUrl:null,media:[],quoted:{authorName:"Quote",handle:"quote",url:"https://x.com/quote/status/7",text:"引用原文",translation:url.pathname.endsWith("/original")?null:"Localized quote"}},readingMode:"full",author:null,language:"en",body:{localized:original?null:`<p>${text}</p>`,original:original?"<p>This is the original English body.</p>":null,localizedLanguage:locale==="en"?null:locale,complete:true},outline:[],relatedStories:[],indexable:true,markdownAvailable:true,group:null,hasTranslation:locale!=="en",bodyLanguage:original?"original":locale}));
  }
  if (/^\/api\/site\/items\/example(?:\/original)?$/.test(url.pathname)) return res.end(JSON.stringify({ id: "example", revision: 1, title: `Example ${url.searchParams.get("lang")}`, originalTitle: "Example v2.1.3", summary: "Example summary", reason: null, source: { id: "example", name: "Example", kind: "rss", firstParty: false, iconUrl: null }, links: { aihot: "/items/example", original: "https://example.com" }, publishedAt: "2026-09-28T00:00:00Z", discoveredAt: "2026-09-28T00:00:00Z", timelineAt: "2026-09-28T00:00:00Z", category: CATEGORY_KEYS[0], tags: [], score: null, selected: false, channel: "news", story: null, x: null, readingMode: "summary-only", author: null, language: "en", body: null, outline: [], relatedStories: [], indexable: true, markdownAvailable: false, group: null, hasTranslation: false, bodyLanguage: "original" }));
  if (url.pathname === "/api/site/stories/example") return res.end(JSON.stringify({ publicId: "example", title: "Example event", status: "active", reportCount: 0, sourceCount: 0, firstReportAt: null, latestAt: null, digest: null, digestUpdatedAt: null, summary: null, excerpt: null, latest: null, whyHot: { participants48h: 0, newParticipants6h: 0, recentReports24h: 0, observationComplete: false, rank: null, heat: null }, developments: [], officialReports: [], timeline: [], heat: [], related: [] }));
  if (url.pathname === "/api/site/contact") return res.end(JSON.stringify({ wechatQr: "/qr.png", feishuQr: "/qr.png" }));
  if (url.pathname === "/api/site/stories/merged") {
    res.statusCode = 308;
    return res.end(JSON.stringify({ mergedInto: "surviving-story" }));
  }
  res.statusCode = url.pathname.startsWith("/api/admin/") ? 401 : 404;
  res.end(JSON.stringify({ code: "not_found" }));
});

test("detail pages preserve locale links, identifiers and localized database topics", async () => {
  for (const locale of ["zh", "ru", "en"]) {
    for (const path of ["/items/example", "/items/example/original", "/story/example", "/daily/2026-09-28", "/weekly/2026-W40", "/monthly/2026-09", "/topics/example", "/topics/example/page/2", "/leaderboard/example", "/leaderboard/sources/example", "/codex-reset/history/2026-09-28"]) {
      const start = apiLocales.length;
      const res = await fetch(`${origin}/${locale}${path}`);
      const html = await res.text();
      assert.equal(res.status, 200, `${locale}${path}: ${html.slice(0, 1000)}`);
      assert.ok(apiLocales.slice(start).every((entry) => entry.locale === locale), `${locale}${path}: lang`);
      assert.match(html, new RegExp(`href="/${locale}/all"`));
      if (path.startsWith("/items/")) assert.match(html, new RegExp(`Example ${locale}`));
      if (path.startsWith("/topics/")) {
        assert.ok(html.includes({ zh: "数据库中的主题定义", ru: "Описание темы из базы", en: "Database topic definition" }[locale]!));
      }
      assert.match(html, new RegExp(`property="og:image"[^>]*content="[^"]*lang=${locale}`));
      if (path === "/leaderboard/example") assert.match(html, /Example v2\.1\.3/);
    }
  }
});

before(async () => {
  deadline = Math.floor(Date.now() / 1000) + 20;
  refreshAt = new Date((deadline + 5) * 1000).toISOString();
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  web = spawn(process.execPath, [fileURLToPath(new URL("../server.ts", import.meta.url))], {
    env: { ...process.env, WEB_PORT: "0", TRUST_PROXY: "false", API_BASE_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`web did not start: ${logs}`)), 15_000);
    web.on("exit", () => { clearTimeout(timeout); reject(new Error(`web exited: ${logs}`)); });
    web.stderr!.on("data", (chunk) => { logs += String(chunk); });
    web.stdout!.on("data", (chunk) => {
      logs += String(chunk);
      const match = logs.match(/"msg":"web started","port":(\d+)/);
      if (match) {
        origin = `http://127.0.0.1:${match[1]}`;
        clearTimeout(timeout);
        resolve();
      }
    });
  });
});

after(async () => {
  if (web && web.exitCode === null) {
    web.kill("SIGTERM");
    await once(web, "exit");
  }
  api.closeAllConnections();
  await new Promise<void>((resolve) => api.close(() => resolve()));
});

test("public route subsets produce the same complete navigation data; filters still differ", async () => {
  const answers = await Promise.all(["", "?_routes=root", "?_routes=routes%2Fhome", "?_routes=unknown"].map(async (query) => {
    const res = await fetch(`${origin}/zh.data${query}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("Cache-Control")!, /^public,/);
    assert.equal(res.headers.get("X-Accel-Expires"), `@${deadline}`);
    assert.doesNotMatch(res.headers.get("Cache-Control")!, /stale/);
    const body = await res.text();
    assert.ok(body.includes("root") && body.includes("routes/home"));
    return body;
  }));
  assert.ok(answers.every((body) => body === answers[0]));
  const category = CATEGORY_KEYS.at(-1)!;
  const filtered = await fetch(`${origin}/zh.data?category=${category}&_routes=root`);
  const body = await filtered.text();
  assert.ok(body.includes(category));
  assert.notEqual(body, answers[0]);
});

test("HTML and navigation share freshness; cookies do not personalize public results", async () => {
  const html = await fetch(`${origin}/zh`);
  assert.equal(html.status, 200);
  assert.equal(html.headers.get("X-Accel-Expires"), `@${deadline}`);
  assert.match(await html.text(), /精选/);
  const plain = await fetch(`${origin}/zh/about.data`);
  const signedIn = await fetch(`${origin}/zh/about.data?_routes=root`, { headers: { cookie: "admin_session=private; aihot_vid=reader" } });
  assert.match(plain.headers.get("Cache-Control")!, /^public,/);
  assert.match(plain.headers.get("X-Accel-Expires")!, /^@\d+$/);
  assert.equal(plain.headers.get("Cache-Control"), "public, max-age=300, s-maxage=300, must-revalidate");
  assert.equal(Date.parse(plain.headers.get("Date")!) / 1000 + 300, Number(plain.headers.get("X-Accel-Expires")!.slice(1)));
  assert.equal(signedIn.headers.get("Set-Cookie"), null);
  assert.equal(await signedIn.text(), await plain.text());
  assert.ok(apiCookies.every((cookie) => !cookie));
});

test("missing routes cannot be hidden by a root-only request; errors and redirects stay uncached", async () => {
  for (const pathname of ["/zh/items/missing.data?_routes=root", "/zh/does-not-exist.data?_routes=root", "/zh/items/missing"]) {
    const res = await fetch(origin + pathname);
    assert.equal(res.status, 404, pathname);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.equal(res.headers.get("X-Accel-Expires"), "0");
    await res.text();
  }
  for (const [pathname, target] of [["/zh/story/merged.data?_routes=root", "/zh/story/surviving-story"], ["/zh.data?q=search&_routes=root", "/zh/all?q=search"]]) {
    const res = await fetch(origin + pathname);
    assert.equal(res.status, 202);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.match(await res.text(), new RegExp(target.replace("?", "\\?")));
  }
});

test("admin data and actions never become public cache entries", async () => {
  const admin = await fetch(`${origin}/admin/sources.data?_routes=admin-layout`);
  assert.equal(admin.status, 202);
  assert.equal(admin.headers.get("Cache-Control"), "private, no-store");
  assert.equal(admin.headers.get("X-Accel-Expires"), "0");
  assert.match(await admin.text(), /admin\/login/);
  const action = await fetch(`${origin}/zh/hot.data`, { method: "POST" });
  assert.equal(action.status, 405);
  assert.equal(action.headers.get("Cache-Control"), "private, no-store");
  assert.equal(action.headers.get("X-Accel-Expires"), "0");
  await action.text();
});

test("an elapsed release deadline cannot be extended by a fresh page/data response", async () => {
  const saved = refreshAt;
  refreshAt = new Date(Date.now() - 1000).toISOString();
  try {
    for (const pathname of ["/zh", "/zh.data?_routes=routes%2Fhome"]) {
      const res = await fetch(origin + pathname);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("Cache-Control"), "no-cache");
      assert.equal(res.headers.get("X-Accel-Expires"), "0");
      await res.text();
    }
  } finally {
    refreshAt = saved;
  }
  const now = Date.parse("2026-09-28T00:00:00Z");
  const upstream = new Headers({ "X-Accel-Expires": `@${now / 1000 + 7}` });
  const headers = releaseBoundCache(new Date(now + 20_000).toISOString(), 30, now + 2_000, upstream);
  assert.equal(headers["Cache-Control"], "public, max-age=0, s-maxage=5");
  assert.equal(headers["X-Accel-Expires"], upstream.get("X-Accel-Expires"));
});

test("browser freshness shares the selected deadline, including slow sibling loaders", async () => {
  const savedDeadline = deadline;
  const savedRefresh = refreshAt;
  try {
    deadline = Math.floor(Date.now() / 1000) + 20;
    refreshAt = new Date((deadline + 5) * 1000).toISOString();
    for (const pathname of ["/zh", "/zh.data?_routes=routes%2Fhome"]) {
      const res = await fetch(origin + pathname);
      const cc = res.headers.get("Cache-Control")!;
      const browser = Number(cc.match(/(?:^|,)\s*max-age=(\d+)/)![1]);
      const shared = Number(cc.match(/(?:^|,)\s*s-maxage=(\d+)/)![1]);
      assert.ok(browser > 0 && browser === shared);
      assert.ok(Date.parse(res.headers.get("Date")!) / 1000 + browser <= deadline);
      assert.equal(res.headers.get("X-Accel-Expires"), `@${deadline}`);
      assert.match(cc, /must-revalidate/);
      assert.doesNotMatch(cc, /stale/);
      await res.text();
    }
    // The selected loader initially grants a positive TTL, but root metadata finishes after it.
    deadline = Math.floor(Date.now() / 1000) + 2;
    refreshAt = new Date((deadline + 5) * 1000).toISOString();
    metaDelayMs = 2300;
    await Promise.all(["/zh", "/zh.data?_routes=routes%2Fhome"].map(async (pathname) => {
      const res = await fetch(origin + pathname);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("Cache-Control"), "no-cache");
      assert.equal(res.headers.get("X-Accel-Expires"), "0");
      await res.text();
    }));
  } finally {
    deadline = savedDeadline;
    refreshAt = savedRefresh;
    metaDelayMs = 0;
  }
});

test("the edge may keep a page longer than browsers, which a withdrawal purge cannot reach", async () => {
  const res = await fetch(`${origin}/zh/items/long-lived.data`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=300, s-maxage=600, must-revalidate");
  await res.text();
});

test("browser caching preserves noindex and private sign-in responses", async () => {
  const feedback = await fetch(origin + "/zh/feedback");
  assert.equal(feedback.status, 200);
  assert.match(await feedback.text(), /name="robots" content="noindex/);
  assert.equal(feedback.headers.get("Cache-Control"), "public, max-age=300, s-maxage=300, must-revalidate");
  const login = await fetch(origin + "/admin/login");
  assert.equal(login.status, 200);
  assert.equal(login.headers.get("Cache-Control"), "private, no-store");
  assert.equal(login.headers.get("X-Robots-Tag"), "noindex, nofollow");
  await login.text();
});

test("a visitor cannot name its own address to the api without a trusted proxy in front", async () => {
  const res = await fetch(`${origin}/api/site/echo-client`, { headers: { "X-Forwarded-For": "6.6.6.6", "X-Real-IP": "6.6.6.6" } });
  assert.deepEqual(await res.json(), { forwarded: "127.0.0.1", real: "127.0.0.1" });
});

test("root and legacy public paths negotiate the language and preserve query parameters", async () => {
  for (const [language, target] of [["zh-CN,ru;q=0.8", "zh"], ["ru-RU,en;q=0.5", "ru"], ["fa-IR", "en"], ["en-GB", "en"], ["de-DE", "en"], ["ru;q=0.1,fa-IR;q=0.9", "ru"], ["ru;q=0,en;q=0.5", "en"]]) {
    const res = await fetch(origin + "/?tag=api", { redirect: "manual", headers: { "Accept-Language": language! } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("Location"), `/${target}?tag=api`);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.match(res.headers.get("Vary")!, /Accept-Language, Cookie/);
  }
  const remembered = await fetch(origin + "/", { redirect: "manual", headers: { "Accept-Language": "ru", Cookie: "site_lang=en; admin_session=private" } });
  assert.equal(remembered.headers.get("Location"), "/en");
  const invalid = await fetch(origin + "/", { redirect: "manual", headers: { "Accept-Language": "ru", Cookie: "site_lang=bogus" } });
  assert.equal(invalid.headers.get("Location"), "/ru");
  for (const pathname of ["/all", "/items/example", "/items/example/original", "/story/example", "/daily/2026-09-28", "/topics/testing/page/2", "/terms", "/privacy", "/leaderboard"]) {
    const res = await fetch(origin + pathname + "?from=old&tag=c%2B%2B", { redirect: "manual", headers: { "Accept-Language": "ru-RU" } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("Location"), `/ru${pathname}?from=old&tag=c%2B%2B`);
  }
});

test("public HTML has language, direction, localized links, RSS and reciprocal SEO alternates", async () => {
  for (const locale of ["zh", "ru", "en"]) {
    const before = apiLocales.length;
    const res = await fetch(`${origin}/${locale}`, { headers: { Cookie: "site_lang=en", "Accept-Language": "zh" } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, new RegExp(`<html[^>]*lang="${locale === "zh" ? "zh-CN" : locale}"[^>]*dir="ltr"`));
    assert.match(html, new RegExp(`rel="canonical" href="[^"]+/${locale}"`));
    for (const lang of ["zh-CN", "ru", "en", "x-default"]) assert.match(html, new RegExp(`href[Ll]ang="${lang}"`));
    assert.match(html, /href[Ll]ang="x-default" href="[^\"]+\/en"/);
    assert.match(html, new RegExp(`href="/feed.xml\\?lang=${locale}"`));
    assert.match(html, new RegExp(`href="/${locale}/all"`));
    assert.equal((html.match(/property="og:locale:alternate"/g) ?? []).length, 2);
    assert.equal(html.includes("font-family:Vazirmatn"), false);
    assert.ok(apiLocales.slice(before).filter((entry) => entry.path === "/api/site/timeline" || entry.path === "/api/site/meta").every((entry) => entry.locale === locale));
    const beforeData = apiLocales.length;
    const navigation = await fetch(`${origin}/${locale}.data`);
    assert.equal(navigation.status, 200);
    await navigation.text();
    assert.ok(apiLocales.slice(beforeData).every((entry) => entry.locale === locale), `${locale}.data: lang`);
  }
  const admin = await fetch(origin + "/admin/login");
  assert.match(await admin.text(), /<html[^>]*lang="zh-CN"[^>]*dir="ltr"/);
  assert.equal((await fetch(origin + "/xx/all")).status, 404);
});

test("public sections render in all three languages using locale-scoped API requests", async () => {
  for (const locale of ["zh", "ru", "en"]) {
    for (const path of ["/all", "/hot", "/daily", "/weekly", "/monthly", "/daily/archive", "/topics", "/about", "/terms", "/privacy", "/changelog", "/feedback", "/more", "/starred", "/agent", "/leaderboard", "/leaderboard/category/coding", "/leaderboard/sources", "/leaderboard/rules", "/codex-reset"]) {
      const start = apiLocales.length;
      const res = await fetch(`${origin}/${locale}${path}`);
      const html = await res.text();
      assert.equal(res.status, 200, `${locale}${path}: ${html.slice(0, 1000)}`);
      assert.match(html, new RegExp(`rel="canonical" href="[^"]+/${locale}${path}"`));
      assert.ok(apiLocales.slice(start).every((entry) => entry.locale === locale), `${locale}${path}: every frontend API read carries lang`);
      if (locale !== "zh") {
        assert.doesNotMatch(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "", /精选|日报|周报|月报|使用规则|隐私说明|收藏|主题|关于|更新日志|全部动态/);
      }
    }
  }
});


test("详情 SSR 显示当前语言正文，原文切换保持语言路径，引用帖独立按 locale 展示", async () => {
  for(const locale of ["zh","ru","en"] as const) {
    const response = await fetch(`${origin}/${locale}/items/body-example`);
    assert.equal(response.status,200);
    const html=await response.text();
    assert.ok(html.includes({zh:"这是一篇中文正文译文。",ru:"Это русский перевод статьи.",en:"This is the original English body."}[locale]));
    assert.ok(html.includes("Localized quote"),'原帖已是当前语言时引用帖仍显示译文');
    if(locale!=="en") assert.ok(html.includes(`/${locale}/items/body-example/original`));
    const original=await fetch(`${origin}/${locale}/items/body-example/original`);
    const originalHtml=await original.text();
    assert.equal(original.status,200);
    assert.ok(originalHtml.includes("This is the original English body."));
    assert.ok(!originalHtml.includes("Localized quote"),'原文切换不带引用帖译文');
  }
});
