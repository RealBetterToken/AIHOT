// Small site-wide facts for the web shell (e.g. the changelog red-dot anchor).
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../config.ts";
import type { ChangelogData } from "@aihot/contracts/changelog";
export type { ChangelogRelease } from "@aihot/contracts/changelog";

let changelogCache: ChangelogData | null = null;

/** Changelog is published as a data file in the industry pack (industry/changelog.json), newest first. */
export function loadChangelog() {
  if (!changelogCache) {
    const file = process.env.AIHOT_CHANGELOG_FILE || path.join(REPO_ROOT, "industry/changelog.json");
    const data = JSON.parse(readFileSync(file, "utf8")) as ChangelogData;
    changelogCache = data;
  }
  return changelogCache;
}

export function siteMeta() {
  return { changelogVersion: loadChangelog().latestVersion };
}
