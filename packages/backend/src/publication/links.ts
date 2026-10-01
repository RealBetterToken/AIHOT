import { config } from "../config.ts";
import type { Locale } from "@aihot/contracts/locale";

// Absolute links always use the configured address (SITE_URL), never the request Host: a CDN or proxy
// may send a different Host to the origin.
export const siteUrl = (path: string): string => `${config.siteUrl}${path}`;
/** 读者页面链接保留语言；API 与资源链接继续使用 siteUrl。 */
export const pageUrl = (path: string, locale: Locale): string => siteUrl(`/${locale}${path === "/" ? "" : path}`);
export const itemUrl = (id: string): string => siteUrl(`/items/${id}`);
export const storyUrl = (publicId: string): string => siteUrl(`/story/${publicId}`);
export const dailyUrl = (date: string): string => siteUrl(`/daily/${date}`);
export const storyApiUrl = (publicId: string): string => siteUrl(`/api/v1/stories/${publicId}`);
