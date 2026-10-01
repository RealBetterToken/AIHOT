// 站点身份和读者看得到的文案。换成你的行业时，先改这个文件。
// 网页和后端都读它；改完重新构建（docker compose up --build）即可生效。
// 域名不在这里：部署时用环境变量 SITE_URL 设置。

export const SITE = {
  /** 站名：导航、页面标题、分享图、RSS、MCP、后台都用它。 */
  name: "VibeHot",
  /**
   * 行业词：拼进默认说法里，比如“AI 日报”“AI 动态”。
   * 改成“法律”“HR”“黄金”之类，页面上就会变成“法律日报”“法律动态”。
   */
  subject: "AI",
  /** 首页的完整标题（浏览器标签、搜索结果）。 */
  homeTitle: "VibeHot — AI 行业动态 · 每日精选与日报",
  /** 一句话介绍：搜索引擎、分享卡片、RSS、llms.txt 会用。 */
  description: "自动盯住上百个信源，用模型摘要、打分、精选，把同一件事的多篇报道归到一起，每天早上出一份日报。",
  /** 首页左上角和侧边栏下面的一行小字。 */
  tagline: "值得关注的 AI 动态",
  /** 界面语言（HTML lang、og:locale）。 */
  locale: "zh-CN",
  /** 默认域名，只在没设置 SITE_URL 时使用。 */
  defaultUrl: "http://localhost:3000",
  /**
   * MCP 工具名的前缀（小写字母、数字、下划线），工具会叫 vibehot_get_latest、vibehot_search……
   * 已经有人接入后就不要再改。
   */
  mcpPrefix: "vibehot",
  /** 对外联系邮箱（选填）：使用规则、llms.txt、响应头里会写。 */
  contactEmail: null as string | null,
  /** 页脚的一行小字（选填）。 */
  footerNote: "基于开源框架构建",
  /** 中国大陆网站的 ICP 备案号（选填），填了就显示在页脚并链接到工信部备案系统。 */
  icp: null as string | null,
  /** 结构化数据里的网站运营者（搜索引擎用）。 */
  organization: {
    name: "VibeHot",
    /** 创始人（选填）：{ name, url, description }。 */
    founder: null as null | { name: string; url?: string; description?: string },
  },
  /** 抓取信源时报上的名字（User-Agent 里用），不要冒用别的站。 */
  crawlerName: "VibeHotBot",
} as const;

/** 关于页的文案。数字（信源数、收录数、精选数、日报期数）来自站内实时统计，不用写在这里。 */
export const ABOUT = {
  kicker: `关于 ${SITE.name}`,
  /** 大标题：第一行正常颜色，第二行强调色。 */
  headline: ["AI 圈每天都有新动静，", "值得看的，只有几条。"] as [string, string],
  /** 标题下面的一段话。{sources} 会换成实时的信源数。 */
  lead: `${SITE.name} 替你盯着 {sources} 个信源：抓取、归并、打分、精选，每天早上 8 点出一份日报。免费，不用注册。`,
  /** 信源河动画下面的四个环节。 */
  steps: {
    collect: "官方博客、媒体、X 账号、公众号和各类订阅源都在看；活跃的源 15 分钟就看一次。",
    store: "抓到的都存下来，同一件事的报道归到一起；只计入热度的账号也算在内，热点榜就是从这里算出来的。",
    select: "模型先看是不是这个行业的事、有没有实际信息，再写中文标题、摘要和推荐理由；营销稿和重复转发进不来。",
    publish: "每天 08:00 出日报，周一出周报，每月 1 日出月报；最精选的几条可以推到飞书群。",
  },
  /**
   * 作者块（选填），null 就不显示。
   * avatarSourceId：一个 X 账号信源的 id，头像取它的（选填）。
   * 二维码在后台“设置”里上传，或者放进 industry/brand/contact/；没有二维码就不显示那张卡片。
   */
  maker: null as null | {
    name: string;
    greeting: string[];
    avatarSourceId?: string | null;
    wechat?: { title: string; note: string };
    feishu?: { title: string; note: string };
  },
  /** 页面底部的版权与下架说明（结尾会接“反馈页”的链接）。 */
  copyright: `${SITE.name} 是聚合摘要和阅读索引，原文版权归各来源所有。如果你是来源方，希望更正、下架或调整展示方式，可以通过`,
} as const;

/** “AI 日报”这类说法：行业词和名词之间，英文词加空格，中文词不加。 */
export function withSubject(noun: string): string {
  return /[A-Za-z0-9]$/.test(SITE.subject) ? `${SITE.subject} ${noun}` : `${SITE.subject}${noun}`;
}

/** 本地化只影响读者文案；站名、联系资料与机器接口身份保持现有配置。 */
export type SiteLocale = "zh" | "ru" | "en";
const SITE_COPY = {
  ru: { homeTitle: `${SITE.name} — Новости ИИ · Избранное и ежедневный обзор`, description: "Автоматически следим за сотнями источников, с помощью моделей составляем краткие изложения, оцениваем и отбираем материалы, объединяем публикации об одном событии и каждое утро выпускаем обзор.", tagline: "Новости ИИ, заслуживающие внимания", locale: "ru-RU", footerNote: "Создано на основе открытой платформы" },
  en: { homeTitle: `${SITE.name} — AI news · Daily picks and briefings`, description: "Automatically follows hundreds of sources, uses models to summarize, score and select stories, groups coverage of the same event, and publishes a briefing every morning.", tagline: "AI news worth following", locale: "en-US", footerNote: "Built on an open-source framework" },
} as const;

export function getSite(locale: SiteLocale = "zh") {
  return locale === "zh" ? SITE : { ...SITE, ...SITE_COPY[locale] };
}

const ABOUT_COPY = {
  ru: {
    kicker: `О ${SITE.name}`,
    headline: ["В мире ИИ каждый день что-то новое,", "но внимания заслуживают лишь немногие новости."] as [string, string],
    lead: `${SITE.name} следит за {sources} источниками: собирает, объединяет, оценивает и отбирает материалы, выпуская обзор каждый день в 08:00 по пекинскому времени. Бесплатно, без регистрации.`,
    steps: { collect: "Следим за официальными блогами, СМИ, аккаунтами X, публичными аккаунтами WeChat и лентами подписок; активные источники проверяем каждые 15 минут.", store: "Сохраняем всё собранное и объединяем публикации об одном событии; учитываем и аккаунты, используемые только для оценки интереса. На этих данных строится рейтинг событий.", select: "Модель сначала проверяет связь с отраслью и наличие полезной информации, затем пишет китайский заголовок, краткое изложение и обоснование выбора; реклама и повторные репосты не проходят.", publish: "Ежедневный обзор выходит в 08:00, недельный — по понедельникам, месячный — первого числа; лучшие материалы можно отправлять в группу Feishu." },
    copyright: `${SITE.name} — агрегатор кратких изложений и указатель для чтения; права на оригиналы принадлежат их источникам. Если вы представляете источник и хотите исправить, удалить или изменить показ материала, свяжитесь с нами через`,
  },
  en: {
    kicker: `About ${SITE.name}`,
    headline: ["AI news arrives every day,", "only a few stories deserve your attention."] as [string, string],
    lead: `${SITE.name} follows {sources} sources for you: collecting, grouping, scoring and selecting stories, with a daily briefing at 08:00 Beijing time. Free, no registration required.`,
    steps: { collect: "We follow official blogs, media, X accounts, WeChat public accounts and subscription feeds; active sources are checked every 15 minutes.", store: "Everything collected is saved and coverage of the same event is grouped together; accounts used only to measure interest are included too. These records power the trending chart.", select: "A model checks whether a story belongs to the industry and contains useful information, then writes a Chinese headline, summary and recommendation; marketing copy and duplicate reposts are excluded.", publish: "Daily briefings appear at 08:00, weekly reviews on Mondays and monthly reviews on the first day of the month; the best picks can also be sent to a Feishu group." },
    copyright: `${SITE.name} aggregates summaries and provides a reading index; copyright in original articles belongs to their sources. If you represent a source and would like a correction, removal or display change, contact us through the`,
  },
} as const;

export function getAbout(locale: SiteLocale = "zh") {
  return locale === "zh" ? ABOUT : { ...ABOUT, ...ABOUT_COPY[locale] };
}
