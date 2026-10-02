import type { ItemDetail } from "@aihot/contracts/site";
import { useLocale, useT } from "../../i18n/index";
import { LANGUAGE_COOKIE, LOCALES, localePath } from "../../i18n/locale";

const names = { zh: "中文", ru: "Русский", en: "English" };

/** 语言入口始终可用；缺译状态由后台返回，点击只读取现有内容。 */
export function ReadingLanguages({ itemId, choices, hasBody, original }: {
  itemId: string;
  choices: ItemDetail["readingLanguages"];
  hasBody: boolean;
  original: boolean;
}) {
  const locale = useLocale();
  const t = useT();
  const classes = (active: boolean) => `inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium ${active ? "bg-surface text-ink shadow-[var(--shadow-thumb)]" : "text-ink-3 hover:text-ink"}`;
  return <nav aria-label={t("正文语言")} className="mt-4 flex flex-wrap gap-1 rounded-control bg-bg-sunk p-1">
    {LOCALES.map((language) => {
      const status = choices.find((choice) => choice.locale === language)?.status;
      return <a key={language} href={localePath(`/items/${encodeURIComponent(itemId)}`, language)}
        aria-current={!original && language === locale ? "page" : undefined} hrefLang={language}
        className={classes(!original && language === locale)}
        onClick={() => { document.cookie = `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=31536000; SameSite=Lax`; }}>
        <span lang={language}>{names[language]}</span>
        {(status === "pending" || status === "partial") && <span className="text-[11px] font-normal text-ink-4">· {t(status === "pending" ? "等待翻译" : "部分译文")}</span>}
      </a>;
    })}
    {hasBody && <a href={localePath(`/items/${encodeURIComponent(itemId)}/original`, locale)} aria-current={original ? "page" : undefined} className={classes(original)}>{t("原文")}</a>}
  </nav>;
}
