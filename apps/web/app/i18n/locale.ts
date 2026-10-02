import { isLocale, LOCALES, type Locale } from "@aihot/contracts/locale";
import { isApiOwned } from "@aihot/contracts/http-policy";

export { LOCALES, isLocale, type Locale };
export const LANGUAGE_COOKIE = "site_lang";
export const HTML_LANG: Record<Locale, string> = { zh: "zh-CN", ru: "ru", en: "en" };
export const INTL_LOCALE: Record<Locale, string> = { zh: "zh-CN", ru: "ru-RU", en: "en-US" };

export function localeFromPath(path: string): Locale {
  const pathname = (/^https?:\/\//.test(path) ? new URL(path).pathname : path).replace(/\.data$/, "");
  const lang = pathname.split("/")[1];
  return isLocale(lang) ? lang : /^\/admin(?:\/|$)/.test(pathname) ? "zh" : "en";
}

export function stripLocale(path: string): string {
  return path.replace(/^\/(zh|ru|en)(?=\/|\?|#|$)/, "") || "/";
}

/** 公开页面路径加前缀；后台、资源和接口路径保持原样。 */
export function localePath(path: string, locale: Locale): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const bare = stripLocale(path);
  if (isApiOwned(bare.split(/[?#]/)[0]!) || /^\/(?:admin|assets|brand|fonts)(?:[/.]|$)/.test(bare) || /\.(?:xml|txt|json|ico|png|svg|webmanifest)(?:[?#]|$)/.test(bare)) return bare;
  return `/${locale}${bare === "/" ? "" : /^\/[?#]/.test(bare) ? bare.slice(1) : bare}`;
}

/** 原文页切到另一种阅读语言时，回到该语言的正文；其他路径与参数保持不变。 */
export function languageSwitchPath(path: string, locale: Locale): string {
  const target = localeFromPath(path) === locale ? path : stripLocale(path).replace(/^(\/items\/[^/?#]+)\/original(?=[?#]|$)/, "$1");
  return localePath(target, locale);
}

export function apiPath(path: string, locale: Locale): string {
  const url = new URL(path, "http://site.local");
  url.searchParams.set("lang", locale);
  return url.pathname + url.search + url.hash;
}

export function preferredLocale(headers: Headers): Locale {
  const cookies = (headers.get("cookie") ?? "").split(";");
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.trim().split("=");
    if (name !== LANGUAGE_COOKIE) continue;
    try {
      const value = decodeURIComponent(rest.join("="));
      if (isLocale(value)) return value;
    } catch { /* 忽略损坏的 cookie。 */ }
  }
  const candidates = (headers.get("accept-language") ?? "").split(",").map((entry, index) => {
    const [language, ...parameters] = entry.trim().toLowerCase().split(";");
    const quality = parameters.find((p) => p.trim().startsWith("q="));
    return { language: language?.split("-")[0], q: quality ? Number(quality.trim().slice(2)) : 1, index };
  }).filter((entry) => Number.isFinite(entry.q) && entry.q > 0 && entry.q <= 1).sort((a, b) => b.q - a.q || a.index - b.index);
  const selected = candidates.find((entry) => isLocale(entry.language))?.language;
  return isLocale(selected) ? selected : "en";
}

export function legacyLocation(pathname: string, search: string, headers: Headers): string | null {
  if (isApiOwned(pathname)) return null;
  if (pathname !== "/" && !/^\/(?:all|search-busy|items|hot|story|daily|weekly|monthly|topics|about|terms|privacy|changelog|feedback|more|starred|agent|codex-reset|leaderboard)(?:\/|$)/.test(pathname)) return null;
  return localePath(pathname, preferredLocale(headers)) + search;
}
