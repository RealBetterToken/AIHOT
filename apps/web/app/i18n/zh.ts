import * as core from "./catalogs/core.ts";
import * as feed from "./catalogs/feed.ts";
import * as report from "./catalogs/report.ts";
import * as extras from "./catalogs/extras.ts";
import * as publicCopy from "./catalogs/public.ts";
export const zh = { ...core.zh, ...feed.zh, ...report.zh, ...extras.zh, ...publicCopy.zh };
export type Key = keyof typeof zh;
export type Dictionary = Record<Key, import("./message").Message>;
