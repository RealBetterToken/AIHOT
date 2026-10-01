import type { Locale } from "@aihot/contracts/locale";
import { getSite, SITE, withSubject } from "@aihot/industry/site";
import type { OgCard } from "./render.ts";

const zh = {
  update: withSubject("动态"), topic: "主题", story: "事件", score: "精选评分", source: "来源",
  daily: withSubject("日报"), weekly: withSubject("周报"), monthly: withSubject("月报"),
  rank: "热点第 {rank} · 事件", reportMeta: "{count} 条核心新闻 · 约 {minutes} 分钟读完", storyMeta: "{sources} 个来源 · {reports} 篇报道",
  selectedScore: "精选 · {score} 分", scan: "长按识别二维码", read: "阅读全文、中文译文与原文链接",
};
const copy: Record<Locale, Record<keyof typeof zh, string>> = {
  zh,
  ru: { update: "Новости", topic: "Тема", story: "Событие", score: "Оценка редакции", source: "Источник",
    daily: "Ежедневный обзор", weekly: "Недельный обзор", monthly: "Месячный обзор", rank: "Событие · место {rank}",
    reportMeta: "Главные материалы: {count} · Чтение: ≈ {minutes} мин", storyMeta: "Источники: {sources} · Публикации: {reports}",
    selectedScore: "Выбор редакции · {score}", scan: "Сканируйте QR-код", read: "Материал, перевод на китайский и ссылка на оригинал" },
  en: { update: "Updates", topic: "Topic", story: "Story", score: "Editorial score", source: "Source",
    daily: "Daily briefing", weekly: "Weekly review", monthly: "Monthly review", rank: "Trending #{rank} · Story",
    reportMeta: "{count} key stories · About {minutes} min to read", storyMeta: "Sources: {sources} · Reports: {reports}",
    selectedScore: "Editorial pick · {score}", scan: "Scan the QR code", read: "Article, Chinese translation, and original link" },
};

export function ogText(locale: Locale, key: keyof typeof zh, values: Record<string, number> = {}) {
  return copy[locale][key].replace(/\{(\w+)\}/g, (match, name: string) => values[name] === undefined ? match : new Intl.NumberFormat(locale).format(values[name]));
}

export function pageCards(locale: Locale): Record<string, OgCard> {
  const site = getSite(locale);
  const base = { site: { kicker: SITE.name, title: site.tagline, subtitle: site.description }, about: { kicker: locale === "ru" ? "О сайте" : locale === "en" ? "About" : "关于", title: locale === "ru" ? `О ${SITE.name}` : locale === "en" ? `About ${SITE.name}` : `关于 ${SITE.name}`, subtitle: site.description } };
  const texts: Record<Locale, Record<string, [string, string, string]>> = {
    zh: {
      all: [`全部${withSubject("动态")}`, "所有信源的最新动态，一站看完", "按时间汇总各信源的最新动态，可按类别与标签筛选。"],
      hot: ["热点榜", "过去 48 小时，大家在讨论什么", "热度指数、趋势与组成热度的公开来源。"],
      daily: [copy.zh.daily, `每天 8 点，一份读得完的${copy.zh.daily}`, `前一天值得关注的${SITE.subject}动态。`],
      weekly: [copy.zh.weekly, "一周大事，一次看清", "本周的主线、重要发布与值得回看的讨论。"],
      monthly: [copy.zh.monthly, "一个月的变化", "月度主线与关键事件回顾。"], topics: ["主题", "长期追踪的方向", "公司与机构、专题方向、内容形态。"],
      leaderboard: ["AI 模型排行榜", "多家公开评测的共识排名", "综合、编程、推理、知识、专业办公；缺测不补零，价格不影响排名。"],
      "codex-reset": ["Tibo 重置监控", "Codex 额度重置什么时候生效", "推算的北京时间窗口、适用范围与 Tibo 原话。"],
      terms: ["使用规则", `${SITE.name} 使用规则`, "网站、API、RSS 与 MCP 的使用范围。"], privacy: ["隐私说明", `${SITE.name} 隐私说明`, "访问日志、浏览器本地数据与反馈资料的处理方式。"],
      changelog: ["更新日志", `${SITE.name} 更新日志`, "功能更新、优化、公告与下线记录。"], feedback: ["反馈", "告诉我们哪里可以更好", "内容、功能、接入，或来源方的更正与下架请求。"], agent: ["Agent 接入", `让 Agent 直接使用 ${SITE.name}`, "MCP、RSS 与 REST API v1，匿名只读。"],
    },
    ru: {
      all: ["Все материалы", "Последние новости из всех источников в одном месте", "Обновления по времени публикации с фильтрами по категориям и тегам."],
      hot: ["Актуальные события", "Что обсуждали за последние 48 часов", "Индекс интереса, тенденции и публичные источники обсуждений."],
      daily: [copy.ru.daily, "Каждый день в 08:00 — краткий обзор", "Важные новости за предыдущий день."], weekly: [copy.ru.weekly, "Главное за неделю", "Основные темы, важные релизы и обсуждения, к которым стоит вернуться."],
      monthly: [copy.ru.monthly, "Что изменилось за месяц", "Обзор основных тем и ключевых событий месяца."], topics: ["Темы", "Направления, за которыми мы следим", "Компании, технические направления и форматы материалов."],
      leaderboard: ["Рейтинг ИИ-моделей", "Сводный рейтинг по открытым оценкам", "Общие задачи, код, рассуждения, знания и работа. Пропуски не равны нулю; цена не влияет на рейтинг."],
      "codex-reset": ["Мониторинг Tibo", "Когда сбросятся лимиты Codex", "Расчётное окно по пекинскому времени, область действия и исходное сообщение Tibo."],
      terms: ["Условия использования", `${SITE.name}: условия использования`, "Использование сайта, API, RSS и MCP."], privacy: ["Конфиденциальность", `${SITE.name}: конфиденциальность`, "Обработка журналов посещений, локальных данных браузера и обратной связи."],
      changelog: ["История изменений", `${SITE.name}: история изменений`, "Новые функции, улучшения, объявления и отключённые возможности."], feedback: ["Обратная связь", "Расскажите, что можно улучшить", "Материалы, функции, интеграции, исправления и запросы источников на удаление."], agent: ["Для агентов", `Подключите агента к ${SITE.name}`, "MCP, RSS и REST API v1: анонимный доступ только для чтения."],
    },
    en: {
      all: ["All updates", "The latest from every source, in one place", "Updates in chronological order, with category and tag filters."], hot: ["Trending events", "What people discussed in the past 48 hours", "Interest levels, trends, and the public sources behind them."],
      daily: [copy.en.daily, "A readable briefing every day at 08:00", "News worth following from the previous day."], weekly: [copy.en.weekly, "The week’s key stories", "Main themes, major releases, and discussions worth revisiting."], monthly: [copy.en.monthly, "A month of change", "A review of the month’s main themes and key events."],
      topics: ["Topics", "Areas we follow over time", "Companies, technical topics, and content formats."], leaderboard: ["AI model rankings", "Consensus rankings from public evaluations", "Overall, coding, reasoning, knowledge, and professional work. Missing scores are not zero; price does not affect rank."],
      "codex-reset": ["Tibo reset monitor", "When Codex usage limits reset", "Estimated Beijing-time windows, scope, and Tibo’s original words."],
      terms: ["Terms of use", `${SITE.name} terms of use`, "Use of the website, API, RSS, and MCP."], privacy: ["Privacy", `${SITE.name} privacy notice`, "How access logs, browser-local data, and feedback are handled."],
      changelog: ["Changelog", `${SITE.name} changelog`, "Feature updates, improvements, announcements, and retirements."], feedback: ["Feedback", "Tell us what could be better", "Content, features, integrations, and source requests for corrections or removal."], agent: ["Agent access", `Connect your agent to ${SITE.name}`, "MCP, RSS, and REST API v1: anonymous, read-only access."],
    },
  };
  return { ...base, ...Object.fromEntries(Object.entries(texts[locale]).map(([key, [kicker, title, subtitle]]) => [key, { kicker, title, subtitle, ...(key === "hot" ? { accent: "hot" as const } : key === "codex-reset" ? { accent: "amber" as const } : {}) }])) };
}
