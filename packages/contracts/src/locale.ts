export const LOCALES = ["zh", "ru", "en"] as const;
export type Locale = typeof LOCALES[number];
export const DEFAULT_LOCALE: Locale = "zh";
export const TARGET_LOCALES = ["ru", "en"] as const;
export const RTL_LOCALES: readonly Locale[] = [];
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
