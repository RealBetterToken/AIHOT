import * as core from "./catalogs/core.ts";
import * as feed from "./catalogs/feed.ts";
import * as report from "./catalogs/report.ts";
import * as extras from "./catalogs/extras.ts";
import * as publicCopy from "./catalogs/public.ts";
import type { Dictionary } from "./zh.ts";
export const ru: Dictionary = { ...core.ru, ...feed.ru, ...report.ru, ...extras.ru, ...publicCopy.ru };
