import * as cheerio from "cheerio";
import type { Locale } from "@aihot/contracts/locale";
import { TRANSLATION_TERMS } from "@aihot/industry/translation";
import { sha256 } from "../lib/ids.ts";
import { promptText, promptVersion } from "./prompts.ts";

const prompts = ["translate-domain", "translate-native-zh", "translate-native-ru", "translate-native-en", "translation-edit"];
export const reviewEnabled = () => /^(true|1)$/i.test(process.env.TRANSLATION_REVIEW_ENABLED ?? "");
const version = `${promptVersion(...prompts)}:${sha256(JSON.stringify(TRANSLATION_TERMS)).slice(0, 10)}`;
export const translationQualityVersion = () => `${version}:${reviewEnabled() ? "reviewed" : "mt"}`;

/** 文风写进专用接口实际支持的英文 domains；术语只发送当前文字里出现的词组。 */
export function translationPolicy(text: string, locale: Locale): { domains: string; terms: Array<{ source: string; target: string }> } {
  // 标签属性、代码和链接不是待翻译文字，不用它们触发术语干预。
  const doc = cheerio.load(text, null, false);
  doc("code,pre,script,style").remove();
  const prose = doc.root().text().replace(/```[\s\S]*?```|`[^`]+`|https?:\/\/\S+/g, " ");
  const terms = TRANSLATION_TERMS.flatMap((term) => term.sources.flatMap((source) => {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const boundary = /[A-Za-zА-Яа-я]/.test(source) ? `(?<![\\p{L}\\p{N}_-])${escaped}(?![\\p{L}\\p{N}_-])` : escaped;
    return new RegExp(boundary, "iu").test(prose) ? [{ source, target: term[locale] }] : [];
  }));
  return { domains: `${promptText("translate-domain")}\n${promptText(`translate-native-${locale}`)}`, terms };
}
