import { useLocation } from "react-router";
import { useLocale, useT } from "./index";
import { LANGUAGE_COOKIE, LOCALES, languageSwitchPath } from "./locale";

const NAMES = { zh: "中文", ru: "Русский", en: "English" };

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useT();
  const location = useLocation();
  return (
    <nav aria-label={t("语言")} className="flex flex-wrap justify-end gap-x-3 gap-y-1 py-2 text-[12px] text-ink-3">
      {LOCALES.map((lang) => (
        <a key={lang} href={languageSwitchPath(location.pathname + location.search + location.hash, lang)} lang={lang} dir="auto" aria-current={lang === locale ? "true" : undefined}
          className={lang === locale ? "font-semibold text-accent" : "hover:text-ink"}
          onClick={(event) => { event.currentTarget.href = languageSwitchPath(window.location.pathname + window.location.search + window.location.hash, lang); document.cookie = `${LANGUAGE_COOKIE}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`; }}>
          {NAMES[lang]}
        </a>
      ))}
    </nav>
  );
}
