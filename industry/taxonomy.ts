// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉模型怎么归类。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 */
export const CATEGORIES = [
  { key: "tip", label: "实践", section: "实践与教程", guide: "最佳实践、可复现的工作流、教程、CLAUDE.md / AGENTS.md / Skills / Hooks / Subagent 的具体配置、上下文与成本技巧、同一任务下的工具或模型对比实测" },
  { key: "pitfall", label: "踩坑", section: "问题与事故", guide: "使用 AI 编程工具遇到的问题、bug 与绕过办法、Agent 事故（误删、泄密、提示词注入、账单失控）、失败复盘、供应链与安全事件" },
  { key: "tools", label: "工具", section: "新工具与 Skill", guide: "值得一用的新工具、新 Skill、新 MCP Server、开源项目与插件，重点是用法和为什么好用" },
  { key: "opinion", label: "观点", section: "思想与讨论", guide: "资深工程师和工具作者的工程思想、编程方法论、AI 时代软件工程的观点，以及程序员社区正在热议的话题与趋势" },
  { key: "release", label: "发布", section: "发布与更新", guide: "AI 编程工具、模型和 API 的版本发布、功能上线、价格与额度变化、评测榜单结果" },
  { key: "industry", label: "行业", section: "行业动态", guide: "公司经营、融资并购、人事、合作、诉讼与监管，以及不属于以上类别的其他动态" },
] as const;

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["model_release", "product_launch", "tool_or_prompt", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "教程/实践", "问题/踩坑", "工具/Skill", "开源/仓库", "大佬观点", "现象/趋势", "产品更新", "模型发布", "评测/基准", "安全/事故", "论文/研究",
  "行业动态", "非AI/通用工具", "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "工作流", "上下文/记忆", "Skills", "MCP/工具调用", "Hooks/自动化", "多Agent", "测试/验证", "代码评审", "规范驱动", "成本/额度",
  "本地模型", "开源模型", "CLI/终端", "IDE/编辑器", "Agent",
] as const;

/** 可选的实体标签（公司、机构、平台）。 */
export const ENTITY_TAGS = ["OpenAI", "Anthropic", "DeepSeek", "Google", "Cursor", "GitHub", "Qwen", "Kimi", "智谱", "MiniMax"] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  "教程/玩法": "教程/实践", "技巧/最佳实践": "教程/实践", 教程: "教程/实践", 指南: "教程/实践", 技巧: "教程/实践", 最佳实践: "教程/实践", 实践: "教程/实践", 工作流: "教程/实践",
  踩坑: "问题/踩坑", 问题: "问题/踩坑", 排障: "问题/踩坑", 故障: "问题/踩坑", 复盘: "问题/踩坑", bug: "问题/踩坑",
  工具: "工具/Skill", Skill: "工具/Skill", 插件: "工具/Skill", MCP: "工具/Skill",
  安全: "安全/事故", 事故: "安全/事故", "安全/对齐": "安全/事故",
  "open-source": "开源/仓库", 开源: "开源/仓库", 仓库: "开源/仓库", repo: "开源/仓库",
  论文: "论文/研究", 研究: "论文/研究", paper: "论文/研究", 评测: "评测/基准", 基准: "评测/基准", benchmark: "评测/基准",
  产品: "产品更新", 更新: "产品更新", 发布: "产品更新", 模型: "模型发布", 趋势: "现象/趋势", 现象: "现象/趋势", 讨论: "现象/趋势", 观点: "大佬观点",
  合作: "行业动态", 融资: "行业动态", 收购: "行业动态", 投资: "行业动态", 并购: "行业动态", 行业: "行业动态", 动态: "行业动态", 政策: "行业动态", 监管: "行业动态",
  非ai: "非AI/通用工具", "non-ai": "非AI/通用工具", 通用工具: "非AI/通用工具",
};

/** 模型漏了分类标签时，按内容类型补一个。 */
export const CATEGORY_BY_ITEM_TYPE: Readonly<Record<string, string>> = {
  model_release: "模型发布", product_launch: "产品更新", tool_or_prompt: "教程/实践", research_paper: "论文/研究",
  industry_event: "行业动态", opinion_analysis: "大佬观点", tutorial_explainer: "教程/实践",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/** 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[] }> = {
  openai: { name: "OpenAI", displayTag: "OpenAI", aliases: ["OpenAI", "ChatGPT", "Sora", "Codex", "GPT"] },
  anthropic: { name: "Anthropic", displayTag: "Anthropic", aliases: ["Anthropic", "Claude"] },
  google: { name: "Google", displayTag: "Google", aliases: ["Google", "DeepMind", "Gemini", "Gemini CLI", "谷歌"] },
  deepseek: { name: "DeepSeek", displayTag: "DeepSeek", aliases: ["DeepSeek", "深度求索"] },
  qwen: { name: "千问 Qwen", displayTag: "Qwen", aliases: ["Qwen", "通义", "阿里"] },
  kimi: { name: "Kimi / 月之暗面", displayTag: "Kimi", aliases: ["Kimi", "月之暗面", "Moonshot"] },
  minimax: { name: "MiniMax", displayTag: "MiniMax", aliases: ["MiniMax", "海螺"] },
  zhipu: { name: "智谱 GLM", displayTag: "智谱", aliases: ["智谱", "GLM", "Z.ai"] },
  xai: { name: "xAI", displayTag: null, aliases: ["xAI", "Grok"] },
  meta: { name: "Meta", displayTag: null, aliases: ["Meta", "Llama"] },
  microsoft: { name: "Microsoft", displayTag: null, aliases: ["Microsoft", "微软", "Copilot"] },
  nvidia: { name: "NVIDIA", displayTag: null, aliases: ["NVIDIA", "英伟达"] },
  "hugging-face": { name: "Hugging Face", displayTag: null, aliases: ["Hugging Face"] },
  cursor: { name: "Cursor", displayTag: "Cursor", aliases: ["Cursor", "Anysphere"] },
  openrouter: { name: "OpenRouter", displayTag: null, aliases: ["OpenRouter"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "openai", name: "OpenAI", patterns: [/openai|chatgpt|\bgpt-?[o\d]|\bsora\b|\bcodex\b/i] },
  { id: "anthropic", name: "Anthropic", patterns: [/anthropic|\bclaude\b/i, /\b(?:opus|sonnet|haiku)\s*\d+(?:[.\-]\d+)*\b/i, /\bfable\s*\d+(?:[.\-]\d+)*\b|\bmythos\b/i] },
  { id: "google", name: "Google / Gemini", patterns: [/google|deepmind|\bgemini\b|notebooklm|\bveo\s?\d|\bAlphaFold\b|\bAMIE\b/i] },
  { id: "deepseek", name: "DeepSeek", patterns: [/deepseek|深度求索/i] },
  { id: "xai", name: "xAI / Grok", patterns: [/\bxai\b|\bgrok\b/i] },
  { id: "meta", name: "Meta / Llama", patterns: [/\bMeta\b/, /\bmeta\s?ai\b|\bllama\b/i] },
  { id: "microsoft", name: "Microsoft / Copilot", patterns: [/microsoft|copilot|微软/i] },
  { id: "nvidia", name: "NVIDIA", patterns: [/nvidia|英伟达|\bnemotron\b|\bnemo\b|\bblackwell\b|\brubin(?:\s+ultra)?\b|\bcuda\b/i] },
  { id: "qwen", name: "千问 Qwen", patterns: [/\bqwen|通义|千问/i] },
  { id: "hugging-face", name: "Hugging Face", patterns: [/hugging\s?face/i] },
  { id: "cursor", name: "Cursor", patterns: [/\bCursor\b/] },
  { id: "kimi", name: "Kimi / 月之暗面", patterns: [/\bkimi\b|月之暗面|\bmoonshot\s?ai\b/i] },
  { id: "openrouter", name: "OpenRouter", patterns: [/openrouter/i] },
  { id: "minimax", name: "MiniMax", patterns: [/minimax/i] },
  { id: "zhipu", name: "智谱 GLM", patterns: [/智谱|\bglm-?[4-9]/i] },
  { id: "hunyuan", name: "腾讯混元", patterns: [/混元|hunyuan/i] },
  { id: "doubao", name: "字节豆包", patterns: [/豆包|doubao|字节跳动|bytedance/i] },
  { id: "mistral", name: "Mistral", patterns: [/mistral/i] },
  { id: "perplexity", name: "Perplexity", patterns: [/\bPerplexity\b/] },
  { id: "runway", name: "Runway", patterns: [/\brunway\b/i] },
  { id: "suno", name: "Suno", patterns: [/\bsuno\b/i] },
  { id: "midjourney", name: "Midjourney", patterns: [/midjourney/i] },
  { id: "stability-ai", name: "Stability AI", patterns: [/stability\s?ai/i] },
  { id: "elevenlabs", name: "ElevenLabs", patterns: [/eleven\s?labs/i] },
  { id: "vllm", name: "vLLM", patterns: [/\bvllm\b/i] },
  { id: "ollama", name: "Ollama", patterns: [/\bollama\b/i] },
  { id: "windsurf", name: "Windsurf", patterns: [/windsurf/i] },
  { id: "devin", name: "Devin", patterns: [/\bdevin\b/i] },
  { id: "manus", name: "Manus", patterns: [/\bmanus\b/i] },
  { id: "apple", name: "Apple AI", patterns: [/\bapple\s?(intelligence|silicon|ai)\b|苹果(智能|\s?AI)/i] },
  { id: "amazon", name: "Amazon / AWS", patterns: [/amazon|\baws\b|亚马逊/i] },
  { id: "baidu", name: "百度文心", patterns: [/百度|baidu|文心|\bernie\s?bot\b/i] },
];

/** 这些域名上的文章，发布方就是对应的公司（托管平台如 GitHub、arXiv 不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "openai", domains: ["openai.com"] },
  { entityId: "anthropic", domains: ["anthropic.com", "claude.com"] },
  { entityId: "google", domains: ["deepmind.google", "ai.google", "blog.google"] },
  { entityId: "deepseek", domains: ["deepseek.com"] },
  { entityId: "xai", domains: ["x.ai"] },
  { entityId: "meta", domains: ["ai.meta.com"] },
  { entityId: "microsoft", domains: ["microsoft.com"] },
  { entityId: "nvidia", domains: ["nvidia.com"] },
  { entityId: "qwen", domains: ["qwen.ai"] },
  { entityId: "cursor", domains: ["cursor.com"] },
  { entityId: "openrouter", domains: ["openrouter.ai"] },
];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "meta", pattern: /@AIatMeta\b/i },
  { entityId: "zhipu", pattern: /\bZhipu(?:\s+AI\b|['’]s\b)/i },
];

/** 类别身份不变，显示名称按界面语言切换。 */
const CATEGORY_COPY = {
  zh: Object.fromEntries(CATEGORIES.map((category) => [category.key, [category.label, category.section]])),
  ru: { tip: ["Практика", "Практика и руководства"], pitfall: ["Проблемы", "Проблемы и инциденты"], tools: ["Инструменты", "Новые инструменты и Skills"], opinion: ["Мнения", "Идеи и обсуждения"], release: ["Релизы", "Релизы и обновления"], industry: ["Отрасль", "Новости отрасли"] },
  en: { tip: ["Practice", "Practice and tutorials"], pitfall: ["Pitfalls", "Problems and incidents"], tools: ["Tools", "New tools and Skills"], opinion: ["Opinion", "Ideas and discussion"], release: ["Releases", "Releases and updates"], industry: ["Industry", "Industry news"] },
} satisfies Record<"zh" | "ru" | "en", Record<string, readonly string[]>>;

export function categoryLabel(key: string, locale: "zh" | "ru" | "en" = "zh"): string {
  return (CATEGORY_COPY[locale] as Record<string, readonly string[]>)[key]?.[0] ?? CATEGORIES.find((category) => category.key === key)?.label ?? key;
}

export function categorySection(key: string, locale: "zh" | "ru" | "en" = "zh"): string {
  return (CATEGORY_COPY[locale] as Record<string, readonly string[]>)[key]?.[1] ?? CATEGORIES.find((category) => category.key === key)?.section ?? key;
}

type Tag = (typeof CATEGORY_TAGS)[number] | (typeof TOPIC_TAGS)[number] | (typeof ENTITY_TAGS)[number];

/** 标签的身份沿用中文词表，公开展示时才按阅读语言换显示名。 */
const TAG_COPY = {
  en: {
    "教程/实践": "Tutorials/practice", "问题/踩坑": "Problems/pitfalls", "工具/Skill": "Tools/Skills", "开源/仓库": "Open source/repositories",
    "大佬观点": "Expert opinions", "现象/趋势": "Trends", "产品更新": "Product updates", "模型发布": "Model releases",
    "评测/基准": "Reviews/benchmarks", "安全/事故": "Security/incidents", "论文/研究": "Papers/research", "行业动态": "Industry news",
    "非AI/通用工具": "General/non-AI tools", "其他": "Other", "工作流": "Workflows", "上下文/记忆": "Context/memory",
    "Skills": "Skills", "MCP/工具调用": "MCP/tool use", "Hooks/自动化": "Hooks/automation", "多Agent": "Multi-agent",
    "测试/验证": "Testing/verification", "代码评审": "Code review", "规范驱动": "Spec-driven development", "成本/额度": "Costs/usage limits",
    "本地模型": "Local models", "开源模型": "Open-source models", "CLI/终端": "CLI/terminal", "IDE/编辑器": "IDE/editors", "Agent": "Agent",
    "OpenAI": "OpenAI", "Anthropic": "Anthropic", "DeepSeek": "DeepSeek", "Google": "Google", "Cursor": "Cursor", "GitHub": "GitHub",
    "Qwen": "Qwen", "Kimi": "Kimi", "智谱": "Zhipu", "MiniMax": "MiniMax",
  },
  ru: {
    "教程/实践": "Руководства/практика", "问题/踩坑": "Проблемы/ошибки", "工具/Skill": "Инструменты/Skills", "开源/仓库": "Открытый код/репозитории",
    "大佬观点": "Мнения экспертов", "现象/趋势": "Тенденции", "产品更新": "Обновления продуктов", "模型发布": "Релизы моделей",
    "评测/基准": "Обзоры/бенчмарки", "安全/事故": "Безопасность/инциденты", "论文/研究": "Статьи/исследования", "行业动态": "Новости отрасли",
    "非AI/通用工具": "Общие инструменты/без ИИ", "其他": "Другое", "工作流": "Рабочие процессы", "上下文/记忆": "Контекст/память",
    "Skills": "Skills", "MCP/工具调用": "MCP/вызов инструментов", "Hooks/自动化": "Hooks/автоматизация", "多Agent": "Несколько агентов",
    "测试/验证": "Тестирование/проверка", "代码评审": "Ревью кода", "规范驱动": "Разработка по спецификации", "成本/额度": "Стоимость/лимиты",
    "本地模型": "Локальные модели", "开源模型": "Открытые модели", "CLI/终端": "CLI/терминал", "IDE/编辑器": "IDE/редакторы", "Agent": "Агент",
    "OpenAI": "OpenAI", "Anthropic": "Anthropic", "DeepSeek": "DeepSeek", "Google": "Google", "Cursor": "Cursor", "GitHub": "GitHub",
    "Qwen": "Qwen", "Kimi": "Kimi", "智谱": "Zhipu", "MiniMax": "MiniMax",
  },
} satisfies Record<"en" | "ru", Record<Tag, string>>;

/** 品牌名保留通用写法，中文附名在非中文界面使用对应的国际名称。 */
const ENTITY_COPY: Readonly<Record<string, string>> = {
  qwen: "Qwen", kimi: "Kimi / Moonshot AI", zhipu: "Zhipu GLM",
  hunyuan: "Tencent Hunyuan", doubao: "ByteDance Doubao", baidu: "Baidu ERNIE",
};

export function entityLabel(id: string, locale: "zh" | "ru" | "en" = "zh"): string {
  const translated = locale !== "zh" && Object.hasOwn(ENTITY_COPY, id) ? ENTITY_COPY[id] : undefined;
  const configured = Object.hasOwn(ENTITIES, id) ? ENTITIES[id]?.name : undefined;
  return translated ?? configured ?? IDENTITY_LEXICON.find((entry) => entry.id === id)?.name ?? id;
}

export function tagLabel(tag: string, locale: "zh" | "ru" | "en" = "zh"): string {
  if (tag.startsWith("entity:")) return entityLabel(tag.slice(7), locale);
  if (locale === "zh") return tag;
  const copy = TAG_COPY[locale] as Record<string, string>;
  const translated = Object.hasOwn(copy, tag) ? copy[tag] : undefined;
  const canonical = Object.hasOwn(TAG_SYNONYMS, tag) ? TAG_SYNONYMS[tag] : undefined;
  return translated ?? (canonical && Object.hasOwn(copy, canonical) ? copy[canonical] : undefined) ?? tag;
}
