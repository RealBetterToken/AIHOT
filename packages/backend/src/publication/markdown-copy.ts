import type { Locale } from "@aihot/contracts/locale";

const zh = { originalTitle: "原标题", source: "来源", published: "发布时间", original: "原文", summary: "摘要", reason: "推荐理由", body: "正文", translated: "译文", quote: "引用", translatedQuote: "引用译文", translatedBody: "正文 · 译文", originalBody: "正文 · 原文" };
const copy: Record<Locale, Record<keyof typeof zh, string>> = {
  zh,
  ru: { originalTitle: "Исходный заголовок", source: "Источник", published: "Опубликовано", original: "Оригинал", summary: "Краткое изложение", reason: "Почему стоит прочитать", body: "Текст", translated: "Перевод", quote: "Цитата", translatedQuote: "Перевод цитаты", translatedBody: "Текст · перевод", originalBody: "Текст · оригинал" },
  en: { originalTitle: "Original title", source: "Source", published: "Published", original: "Original", summary: "Summary", reason: "Why read this", body: "Body", translated: "Translation", quote: "Quoted", translatedQuote: "Translated quote", translatedBody: "Body · Translation", originalBody: "Body · original" },
};
export const markdownCopy = (locale: Locale) => copy[locale];
