// 只收录含义明确的技术词组；有歧义的单词由领域提示结合上下文处理。
export const TRANSLATION_TERMS: ReadonlyArray<{ sources: readonly string[]; zh: string; ru: string; en: string }> = [
  { sources: ["coding agent", "编程智能体", "编码智能体"], zh: "编程智能体", ru: "ИИ-агент для разработки", en: "coding agent" },
  { sources: ["AI agent", "AI 智能体", "ИИ-агент"], zh: "AI 智能体", ru: "ИИ-агент", en: "AI agent" },
  { sources: ["deploy gate", "deployment gate", "部署闸门", "部署门禁", "发布门禁"], zh: "发布门禁", ru: "контроль развёртывания", en: "deploy gate" },
  { sources: ["blast radius", "爆炸半径", "影响范围"], zh: "影响范围", ru: "зона воздействия", en: "blast radius" },
  { sources: ["pre-flight contract", "preflight contract", "预检契约"], zh: "部署前检查约定", ru: "условия проверки перед развёртыванием", en: "pre-flight contract" },
  { sources: ["checkout endpoint"], zh: "结账接口", ru: "эндпоинт оформления заказа", en: "checkout endpoint" },
  { sources: ["pull request", "拉取请求", "пул-реквест"], zh: "PR", ru: "пул-реквест", en: "pull request" },
  { sources: ["context window", "上下文窗口", "контекстное окно"], zh: "上下文窗口", ru: "контекстное окно", en: "context window" },
  { sources: ["prompt engineering", "提示词工程"], zh: "提示词工程", ru: "промпт-инжиниринг", en: "prompt engineering" },
  { sources: ["提示词", "промпт"], zh: "提示词", ru: "промпт", en: "prompt" },
  { sources: ["vibe coding", "вайб-кодинг"], zh: "Vibe Coding", ru: "вайб-кодинг", en: "vibe coding" },
  { sources: ["large language model", "大语言模型"], zh: "大语言模型", ru: "большая языковая модель", en: "large language model" },
  { sources: ["fine-tuning", "fine tuning", "微调"], zh: "微调", ru: "дообучение", en: "fine-tuning" },
  { sources: ["retrieval-augmented generation", "检索增强生成"], zh: "检索增强生成", ru: "генерация с дополнением из поиска", en: "retrieval-augmented generation" },
  { sources: ["backlog", "бэклог"], zh: "backlog", ru: "бэклог", en: "backlog" },
];
