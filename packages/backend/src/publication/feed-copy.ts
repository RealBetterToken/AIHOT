import type { Locale } from "@aihot/contracts/locale";
import { SITE, withSubject } from "@aihot/industry/site";

const zh = {
  selected: "精选", selectedFull: "精选全文", all: "全部动态", daily: withSubject("日报"),
  selectedDescription: `最新 50 条 ${SITE.name} 精选摘要，保留标题、站内阅读与原文入口；需要阅读器内全文可改订 /feed/full.xml。`,
  selectedFullDescription: "与精选摘要相同的最新 50 条；默认内联已成功抽取的正文；关闭全文的来源或正文缺失时提供摘要和阅读入口。",
  allDescription: "最近 7 天公开动态，按真实发布时间倒序；不含未审内容、低相关条目和已合并的重复条目。",
  dailyDescription: `${SITE.name} 每天 08:00 北京时间发布的${withSubject("日报")}，保留最近 30 期。`,
  original: "阅读原文", quoted: "引用", attribution: `—— 本文由 ${SITE.name} 聚合整理，完整版与更多动态见`,
  readDaily: "点击查看完整日报", full: "全文",
  categoryDescription: `${SITE.name} 每日精选「{label}」分类摘要，按分类订阅、不被全量精选刷屏。`,
  fullCategoryDescription: `${SITE.name} 每日精选「{label}」分类全文源。默认内联已成功抽取的正文，可按信源关闭。`,
};
const copy: Record<Locale, Record<keyof typeof zh, string>> = {
  zh,
  ru: {
    selected: "Выбор редакции", selectedFull: "Выбор редакции: полные тексты", all: "Все материалы", daily: "Ежедневный обзор",
    selectedDescription: `Последние 50 избранных материалов ${SITE.name}: заголовки, краткие изложения и ссылки на сайт и оригиналы. Для полных текстов в RSS подпишитесь на /feed/full.xml.`,
    selectedFullDescription: "Те же последние 50 избранных материалов. По умолчанию включается извлечённый текст; если он недоступен или отключён для источника, остаются краткое изложение и ссылки.",
    allDescription: "Публичные материалы за последние 7 дней, от новых к старым по времени исходной публикации. Непроверенные, малорелевантные и объединённые дубликаты исключены.",
    dailyDescription: `Ежедневный обзор ${SITE.name} выходит в 08:00 по пекинскому времени. В ленте доступны последние 30 выпусков.`,
    original: "Читать оригинал", quoted: "Цитата", attribution: `— Материал собран и подготовлен ${SITE.name}. Полная версия и другие публикации:`,
    readDaily: "Открыть полный ежедневный обзор", full: "полные тексты",
    categoryDescription: `Избранные материалы ${SITE.name} в категории «{label}». Подписывайтесь только на нужную категорию.`,
    fullCategoryDescription: `Полные тексты избранных материалов ${SITE.name} в категории «{label}». Извлечённый текст включается по умолчанию; его можно отключить для отдельных источников.`,
  },
  en: {
    selected: "Editorial picks", selectedFull: "Editorial picks: full text", all: "All updates", daily: "Daily briefing",
    selectedDescription: `The latest 50 editorial picks from ${SITE.name}, with titles, summaries, and links to the site and originals. Subscribe to /feed/full.xml for full text in your reader.`,
    selectedFullDescription: "The same latest 50 editorial picks. Extracted bodies are included by default; items with unavailable or disabled full text retain summaries and reading links.",
    allDescription: "Public updates from the past 7 days, newest first by original publication time. Unreviewed items, low-relevance content, and merged duplicates are excluded.",
    dailyDescription: `${SITE.name} publishes its daily briefing at 08:00 Beijing time. The latest 30 issues are included.`,
    original: "Read the original", quoted: "Quoted", attribution: `— Aggregated and prepared by ${SITE.name}. Full version and more updates:`,
    readDaily: "Read the full daily briefing", full: "full text",
    categoryDescription: `${SITE.name} editorial picks in “{label}”. Subscribe to this category without receiving every editorial pick.`,
    fullCategoryDescription: `${SITE.name} full-text editorial picks in “{label}”. Extracted bodies are included by default and can be disabled per source.`,
  },
};
export const feedCopy = (locale: Locale) => copy[locale];
