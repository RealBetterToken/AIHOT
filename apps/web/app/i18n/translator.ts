import { zh, type Key, type Dictionary } from "./zh.ts";
import { ru } from "./ru.ts";
import { en } from "./en.ts";
import { INTL_LOCALE, type Locale } from "./locale.ts";
import type { Values } from "./message.ts";

const dictionaries: Record<Locale, Dictionary> = { zh, ru, en };
const plurals = new Map<Locale, Intl.PluralRules>();
const numbers = new Map<Locale, Intl.NumberFormat>();

export function t(locale: Locale, key: Key, values: Values = {}): string {
  const message = dictionaries[locale][key];
  let text: string;
  if (typeof message === "string") text = message;
  else {
    let rules = plurals.get(locale);
    if (!rules) { rules = new Intl.PluralRules(INTL_LOCALE[locale]); plurals.set(locale, rules); }
    text = message[rules.select(Number(values.count ?? 0))] ?? message.other;
  }
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    if (value === undefined) return match;
    if (typeof value !== "number") return value;
    let formatter = numbers.get(locale);
    if (!formatter) { formatter = new Intl.NumberFormat(INTL_LOCALE[locale]); numbers.set(locale, formatter); }
    return formatter.format(value);
  });
}

export function createT(locale: Locale) {
  return (key: Key, values?: Values) => t(locale, key, values);
}
export type Translator = ReturnType<typeof createT>;

/** API 中的固定界面词可翻译；主题名、产品名和正文保持原内容。 */
export function translateKnown(locale: Locale, text: string, values?: Values): string {
  return Object.hasOwn(zh, text) ? t(locale, text as Key, values) : text;
}
