import type { Locale } from "./locale.ts";

export interface ChangelogCopy {
  title: string;
  body: string[];
}

export interface ChangelogRelease extends ChangelogCopy {
  date: string;
  time: string;
  kind: "更新" | "优化" | "公告" | "下线";
  /** 默认文案保留在 title/body；缺少对应语言时兼容旧条目的已知词典。 */
  translations?: Partial<Record<Locale, ChangelogCopy>>;
}

export interface ChangelogData {
  latestVersion: string;
  releases: ChangelogRelease[];
}
