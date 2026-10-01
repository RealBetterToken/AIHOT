import { useT, useKnownT } from "../../i18n/index";
import { stripLocale } from "../../i18n/locale";
import { useLocation } from "react-router";
import { LEADERBOARD_BOARD_LABELS, LEADERBOARD_PUBLIC_BOARDS } from "@aihot/contracts/taxonomy";
import { PillTabs } from "../../components/ui/Tabs";
import { boardHref } from "./format";

/** Board switcher. It lives in the shared layout, so the thumb glides between boards. */
export function BoardTabs() {
  const t = useT();
  const knownT = useKnownT();
  const { pathname } = useLocation();
  const active = LEADERBOARD_PUBLIC_BOARDS.find((k) => boardHref(k) === stripLocale(pathname)) ?? "overall";
  return (
    <PillTabs
      layoutId="lb-board"
      label={t("榜单")}
      active={active}
      items={LEADERBOARD_PUBLIC_BOARDS.map((k) => ({ key: k, label: knownT(LEADERBOARD_BOARD_LABELS[k]), to: boardHref(k) }))}
    />
  );
}
