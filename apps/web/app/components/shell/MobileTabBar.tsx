import { Link } from "../../lib/locale-links";
import { useT, useKnownT } from "../../i18n/index";

import { useLocation } from "react-router";
import { TABBAR, tabIsActive } from "./nav";
import { useChangelogDot } from "./Sidebar";

/** Bottom tab bar of the mobile shell (up to 960px), as on the original site. */
export function MobileTabBar({ changelogVersion }: { changelogVersion: string | null }) {
  const t = useT();
  const knownT = useKnownT();
  const { pathname } = useLocation();
  const dot = useChangelogDot(changelogVersion);
  return (
    <nav aria-label={t("底部导航")} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="mx-auto grid h-[54px] max-w-[640px] grid-cols-4">
        {TABBAR.map((item) => {
          const active = tabIsActive(item, pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              prefetch="intent"
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-[3px] text-[11px] transition-colors ${active ? "font-semibold text-accent" : "text-ink-3 active:text-ink"}`}
            >
              <Icon size={21} />
              <span>{item.to === "/" ? t("精选短标签") : item.to === "/daily" ? t("日报导航标签") : knownT(item.label)}</span>
              {dot && item.changelog && <span className="absolute end-[calc(50%-17px)] top-2 size-1.5 rounded-full bg-hot" aria-label={t("有新的更新")} />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
