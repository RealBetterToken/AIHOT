import type { Locale } from "@aihot/contracts/locale";
import { sql } from "../db.ts";

/** 优先采用来源语言；缺失时沿用中文检测，并识别俄文。 */
export function sourceLanguage(language: string | null | undefined, sample: string): string {
  const code = language?.toLowerCase().replace(/_/g, "-").split("-")[0];
  if (code === "zh" || code === "ru" || code === "en") return code;
  const opening = sample.replace(/```[\s\S]*?```|`[^`]+`/g, " ")
    .replace(/https?:\/\/\S+/g, "").slice(0, 400);
  const letters = (opening.match(/\p{L}/gu) ?? []).length;
  const chinese = (opening.match(/[一-鿿]/g) ?? []).length;
  const russian = (opening.match(/[А-Яа-яЁё]/g) ?? []).length;
  // 少量中文日期、术语或引用不应把英文/俄文正文误判成中文。
  if (chinese > 0 && chinese * 2 >= letters) return "zh";
  if (russian > 0 && russian * 2 >= letters) return "ru";
  return code && code !== "und" ? code : "en";
}

export const BODY_LOCALES: readonly Locale[] = ["zh", "ru", "en"];
export const targetLanguage = (locale: Locale) => ({ zh: "简体中文", ru: "俄语", en: "英语" })[locale];

/** 拒绝明显的错语输出；代码、链接和短品牌名称不参与判定。 */
export function translationMatchesLocale(text: string, locale: Locale): boolean {
  const prose = text.replace(/<(code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/```[\s\S]*?```|`[^`]+`/g, " ")
    .replace(/<[^>]*>/g, " ").replace(/https?:\/\/\S+/g, " ").replace(/⟦\d+⟧/g, " ");
  const letters = (prose.match(/\p{L}/gu) ?? []).length;
  if (!letters) return true;
  const han = (prose.match(/[一-鿿]/g) ?? []).length;
  const cyrillic = (prose.match(/[А-Яа-яЁё]/g) ?? []).length;
  if (locale !== "zh" && han * 2 >= letters) return false;
  if (locale !== "ru" && cyrillic * 2 >= letters) return false;
  const words = prose.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
  if (locale === "zh" && !han && words.length >= 3) return false;
  if (locale === "ru" && !cyrillic && words.length >= 3) return false;
  return true;
}

/** 公开 SQL 读取和补译查询拒绝明显错语的已完成缓存。 */
export function translationMatchesLocaleSql(locale: Locale | ReturnType<typeof sql>, text: ReturnType<typeof sql>) {
  const withoutHtmlCode = sql`regexp_replace(coalesce(${text}, ''), ${'(?s)<(code|pre)[^>]*>.*?</\\1>'}, ' ', 'gi')`;
  const withoutMarkdownCode = sql`regexp_replace(${withoutHtmlCode}, ${'(?s)```.*?```|`[^`]+`'}, ' ', 'g')`;
  const prose = sql`regexp_replace(${withoutMarkdownCode}, '<[^>]*>|https?://[^[:space:]]+|⟦[0-9]+⟧', ' ', 'g')`;
  const letters = sql`length(regexp_replace(${prose}, '[^A-Za-z一-鿿А-Яа-яЁё]', '', 'g'))`;
  const chinese = sql`length(regexp_replace(${prose}, '[^一-鿿]', '', 'g'))`;
  const russian = sql`length(regexp_replace(${prose}, '[^А-Яа-яЁё]', '', 'g'))`;
  const englishProse = sql`regexp_count(lower(${prose}), ${'\\m[a-z]{3,}\\M'}) >= 3`;
  return sql`(${letters} = 0 OR (
    (${locale} = 'zh' OR ${chinese} * 2 < ${letters})
    AND (${locale} = 'ru' OR ${russian} * 2 < ${letters})
    AND (${locale} <> 'zh' OR ${chinese} > 0 OR NOT ${englishProse})
    AND (${locale} <> 'ru' OR ${russian} > 0 OR NOT ${englishProse})))`;
}

/** 与 sourceLanguage 相同的判定，供公开读取和待翻译查询使用。 */
export function sourceLanguageSql(language = sql`a.language`, sample = sql`coalesce(a.body_text, a.x_post->>'text', '')`) {
  const code = sql`lower(split_part(replace(coalesce(${language}, ''), '_', '-'), '-', 1))`;
  const withoutMarkdownCode = sql`regexp_replace(${sample}, ${'(?s)```.*?```|`[^`]+`'}, ' ', 'g')`;
  const opening = sql`left(regexp_replace(${withoutMarkdownCode}, 'https?://[^[:space:]]+', '', 'g'), 400)`;
  const letters = sql`length(regexp_replace(${opening}, '[^[:alpha:]]', '', 'g'))`;
  const chinese = sql`length(regexp_replace(${opening}, '[^一-鿿]', '', 'g'))`;
  const russian = sql`length(regexp_replace(${opening}, '[^А-Яа-яЁё]', '', 'g'))`;
  return sql`CASE WHEN ${code} IN ('zh', 'ru', 'en') THEN ${code}
    WHEN ${chinese} > 0 AND ${chinese} * 2 >= ${letters} THEN 'zh'
    WHEN ${russian} > 0 AND ${russian} * 2 >= ${letters} THEN 'ru'
    WHEN ${code} NOT IN ('', 'und') THEN ${code} ELSE 'en' END`;
}
