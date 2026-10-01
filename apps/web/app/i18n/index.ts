import { useMemo } from "react";
import { useLocation } from "react-router";
import { localeFromPath } from "./locale.ts";
import { createT, translateKnown } from "./translator.ts";

export { createT, t, translateKnown, type Translator } from "./translator.ts";
export { localeFromPath, localePath, stripLocale, apiPath, type Locale } from "./locale.ts";
export type { Key } from "./zh.ts";

export function useLocale() {
  return localeFromPath(useLocation().pathname);
}

export function useT() {
  const locale = useLocale();
  return useMemo(() => createT(locale), [locale]);
}

export function useKnownT() {
  const locale = useLocale();
  return useMemo(() => (text: string, values?: import("./message.ts").Values) => translateKnown(locale, text, values), [locale]);
}
