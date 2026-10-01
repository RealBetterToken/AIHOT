import { Link, LocaleAnchor } from "../../lib/locale-links";
import { useT, useKnownT } from "../../i18n/index";

import { SITE } from "@aihot/industry/site";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { Wordmark } from "../Logo";
import { useChangelogSeen } from "../../lib/local-state";
import { SIDEBAR, tabIsActive, type NavItem } from "./nav";
import { ThemeSwitch } from "./ThemeSwitch";

/** True while the changelog has an entry newer than the one this reader last opened. */
export function useChangelogDot(latestVersion: string | null): boolean {
  const seen = useChangelogSeen();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !latestVersion) return false;
  return !seen || seen < latestVersion;
}

function SideLink({ item, dot }: { item: NavItem; dot: boolean }) {
  const t = useT();
  const knownT = useKnownT();
  const { pathname } = useLocation();
  // Weekly and monthly reports belong to the daily report entry, as the phone tab bar has it.
  const isActive = tabIsActive(item, pathname);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      prefetch="intent"
      aria-current={isActive ? "page" : undefined}
      title={knownT(item.label)}
      className={`flex h-10 items-center gap-2.5 rounded-control px-2.5 text-[14px] transition-colors duration-150 ${
        isActive ? "bg-accent/10 font-semibold text-ink dark:bg-accent-soft" : "font-medium text-ink-3 hover:bg-bg-sunk hover:text-ink"
      }`}
    >
      <span className={`flex w-[22px] shrink-0 justify-center ${isActive ? "text-accent" : ""}`}>
        <Icon size={17} />
      </span>
      <span className="min-w-0 line-clamp-2 leading-snug">{knownT(item.label)}</span>
      {dot && item.changelog && <span className="ms-auto size-1.5 shrink-0 rounded-full bg-hot" aria-label={t("有新的更新")} />}
    </Link>
  );
}

export function Sidebar({ changelogVersion }: { changelogVersion: string | null }) {
  const t = useT();
  const knownT = useKnownT();
  const dot = useChangelogDot(changelogVersion);
  return (
    <aside className="sticky top-0 hidden h-dvh w-[180px] shrink-0 flex-col border-e border-line bg-sidebar px-3 pb-3.5 pt-6 lg:flex">
      <Link to="/" className="mb-4 flex h-[50px] items-center px-1 text-ink" aria-label={t("{value} 首页", { value: SITE.name })}>
        <Wordmark size={24} />
      </Link>
      <nav className="-mx-1 flex-1 overflow-y-auto px-1" aria-label={t("主导航")}>
        {SIDEBAR.map((section) => (
          <div key={knownT(section.title)}>
            <div className="px-2.5 pb-1 pt-3.5 text-[11px] text-ink-4">{knownT(section.title)}</div>
            <div className="flex flex-col gap-1">
              {section.items.map((item) => (
                <SideLink key={item.to} item={item} dot={dot} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-2 space-y-2.5 px-1 pt-1">
        <ThemeSwitch className="mx-1" />
        {SITE.icp && (
          <LocaleAnchor href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="block px-2 text-[10px] text-ink-4 hover:text-ink-3">
            {SITE.icp}
          </LocaleAnchor>
        )}
      </div>
    </aside>
  );
}
