# 模型配置

VibeHot 可按处理环节选择模型。当前预设使用 DeepSeek 和阿里云 DashScope 两家服务商：DeepSeek Flash 负责判断与写作，Qwen3.7 Flash 负责预筛与结构抽取，Qwen MT Flash 负责中文、俄语、英语之间的全文与读者文字翻译。

这套组合以质量和低成本为目标。已做授权的小批真实三语试跑，记录见 [真实试跑](live-preview.md)；样本效果仍需读者逐篇评估，填写配置本身不会开启付费任务。

## 填写一个文件

在仓库根目录执行：

```bash
cp .env.models.example .env.models
chmod 600 .env.models
```

打开 `.env.models`，只需填写 `DEEPSEEK_API_KEY` 和 `DASHSCOPE_API_KEY`。两家的 Base URL 已填好，可改成自己使用的 OpenAI 兼容地址；该接口须提供对应模型名称，且 Qwen MT 须支持 `translation_options` 翻译请求协议。两个 API Key 不会传给网站前端，文件已被 Git 和 Docker 构建上下文忽略。

| 环节 | 配置项 | 预设模型 |
|---|---|---|
| 行业预筛 | `PREFILTER_MODEL` | `qwen3.7-flash` |
| 两次独立精选评分 | `SCORE_MODEL` | `deepseek-flash` |
| 入选内容理解与写作 | `UNDERSTAND_MODEL` | `deepseek-flash` |
| 普通标题、摘要 | `SUMMARIZE_MODEL` | `deepseek-flash` |
| 翻译母语审校 | `TRANSLATION_REVIEW_MODEL` | `deepseek-flash` |
| 分类、标签、事实抽取 | `STRUCTURE_MODEL` | `qwen3.7-flash` |
| 事件归组 | `GROUP_MODEL` | `deepseek-flash` |
| 归组复核 | `GROUP_REVIEW_MODEL` | `deepseek-flash` |
| 事件综述 | `DIGEST_MODEL` | `deepseek-flash` |
| 日报、周报、月报 | `REPORT_MODEL` | `deepseek-flash` |
| 公开全文与引用帖翻译 | `TRANSLATE_MODEL` | `qwen-mt-flash` |
| 文章、事件、报刊的读者文字翻译 | `LOCALIZE_MODEL` | `qwen-mt-flash` |
| Codex 重置公告识别 | `MONITOR_MODEL` | `deepseek-flash` |

监控模块仍默认关闭；配置型号不会打开模块。评分仍为两次独立评分，评分维度、权重和精选门槛没有改变。归组和复核当前使用同一家模型，也需要用样本检查误合并。

`qwen-mt-flash` 是翻译专用模型，仅允许用于 `TRANSLATE_MODEL` 和 `LOCALIZE_MODEL`；预筛、评分、抽取、归组等环节设置它会明确报错。未注册的模型名称也会报错，不会悄悄换成默认模型。

## 本机加载与覆盖

API、worker 及后端脚本导入配置时，自动读取仓库根目录的 `.env.models`，与执行命令的工作目录无关，无须逐个修改启动命令。文件缺失时继续使用原配置。可通过环境变量 `MODEL_CONFIG_FILE=/绝对路径/模型.env` 指定另一文件；相对路径按仓库根目录解析。

本机优先级为：**后台管理员选择 > 显式环境变量（包括 `node --env-file=.env` 加载的值）> `.env.models` > 代码默认 `default`**。显式环境变量的空值也不会被文件填充；空的环节模型恢复到 `default`，空 API Key 仍视为未配置。后台切换有审计，只影响之后的新任务，已发表内容不会自动重新处理。

默认自动加载仅接受模型字段：表中的环节路由，`LLM_*` 单模型字段，DeepSeek、DashScope、智谱、MiMo 的 Base URL / API Key，以及 `EMBEDDING_BASE_URL`、`EMBEDDING_API_KEY`、`EMBEDDING_MODEL`。文件里的数据库、登录密钥、安全阀和未知字段都会被忽略。

原来的单模型方式仍然支持：在主 `.env` 中填写 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` 及可选的 `LLM_EXTRA_JSON`、`LLM_VISION`、`LLM_JSON_MODE`。不使用分环节路由时，可不创建 `.env.models`，或移除其中的环节路由；也可以把这些路由全部设为 `default`。旧 `AIHOT_CREDENTIALS_DIR/models.env` 凭据方式保留，环境中已经存在的凭据仍然优先。

## Docker

`docker-compose.yml` 仅为 `api` 和 `worker` 增加可选的模型 `env_file`，顺序是主 `.env`、再 `.env.models`；没有第二个文件时旧部署继续运行。Docker 环境注入会让 `.env.models` 中同名模型字段覆盖主 `.env`；Compose 显式 `environment` 的值优先于 `env_file`。Docker 中这些路由的诊断来源会显示 `env`。`MODEL_CONFIG_FILE` 可指定 Compose 第二份 env_file 的路径。

Docker 的 env_file 直接注入环境变量，因此 `.env.models` 只应包含模板里的模型字段。采集、模型、飞书和 IndexNow 的安全阀由主 `.env` 或启动 Compose 时的显式环境变量控制，已经在后端服务的 `environment` 中固定，不会被第二份文件打开。`web` 和 `setup` 不读取第二份 env_file，镜像也不包含 `.env.models`。

修改模型文件后，本机重启 API、worker；Docker 重新创建这两个服务使环境配置更新：

```bash
docker compose up -d api worker
```

## 启动前检查实际使用的模型

已有数据库可能保留后台管理员的选择，改文件不会取消它。保持所有外部调用安全阀关闭，在仓库根目录运行下面的只读检查；它只读取配置和 `settings`，不会调用模型或修改数据库：

```bash
COLLECT_ENABLED=false MODEL_CALLS_ENABLED=false FEISHU_CONTENT_PUSH_ENABLED=false FEISHU_INTERNAL_ENABLED=false INDEXNOW_SUBMIT_ENABLED=false \
node --env-file-if-exists=.env --input-type=module -e '
  const { modelDiagnostics } = await import("./packages/backend/src/editorial/models.ts");
  const { closeDb } = await import("./packages/backend/src/db.ts");
  try { console.table(await modelDiagnostics()); } finally { await closeDb(); }
'
```

Docker 已启动时可检查容器内的实际配置：

```bash
docker compose exec -T api node --input-type=module -e '
  const { modelDiagnostics } = await import("./packages/backend/src/editorial/models.ts");
  const { closeDb } = await import("./packages/backend/src/db.ts");
  try { console.table(await modelDiagnostics()); } finally { await closeDb(); }
'
```

检查 `model`（最终模型）、`configuredModel`（文件或环境选择）、`source`（后台 / 环境 / 默认）、`configuredSource`（本机可区分文件和环境）、`overridden`（后台是否选了不同模型），以及 `credentialConfigured`、`providerConfigured`。输出不会包含 API Key；Base URL 中的用户名、密码、查询参数和片段会被去除。

如果 `source=admin` 且 `overridden=true`，在后台“模型与评测”逐项切换到新型号，或选择“恢复默认”让它采用文件或环境值，并填写切换理由。不要直接清空生产 `settings`。后台页面把本机文件载入的路由归类为“环境变量”，精确来源以诊断结果为准。非法路由会指明出错的环境变量或 `models.<环节>`，先修正该配置再启动处理任务。

## 开启付费调用前

`.env.models` 只表示模型配置就绪。开发和测试期间，主 `.env` 中的 `COLLECT_ENABLED`、`MODEL_CALLS_ENABLED`、`FEISHU_CONTENT_PUSH_ENABLED`、`FEISHU_INTERNAL_ENABLED`、`INDEXNOW_SUBMIT_ENABLED` 均保持 `false`；填写 API Key 不代表可以跳过验证。

先确认实际路由和凭据就绪，再按 [精选与校准](selection.md) 使用同一批人工标注样本对照旧结果，检查中文评分、标题摘要、结构抽取和归组。另取中文、俄文、英文原文，逐条检查三语读者文字与全文：意思、事实、数字、专有名词、链接和段落格式应保留，读者语言应一致；同语言内容应沿用原文，不应重复翻译。必须经过有授权的小样本验证才考虑开启常规付费任务；真实小样本与费用记录见 [试跑记录](live-preview.md)。

千问专用翻译接口接收单条用户文本和 `translation_options`，不会收到普通聊天的 System Message 或 JSON 输出要求。程序按目标语言将段落与字段包装成 HTML，校验对应关系；批次边界丢失时缩小批次重试。事件和引用的标识、空值、数组顺序由程序复制，代码和 URL 用占位符保护；只收到空 HTML 或错误语言不会标记为完整翻译。译文逐语言保存，长文分块，成功回执在恢复时复用。

付费请求仍经过已有回执与预算熔断。预算按服务商统计，当前两家分别是 `deepseek`、`dashscope`；不要为试跑绕开预算或更改精选门槛。字段分块、包装和失败重试会改变实际 Token 用量，费用节省以真实回执统计为准。

## 自然翻译和技术术语

推荐配置启用 `TRANSLATION_REVIEW_ENABLED=true`：千问 MT Flash 初译后，DeepSeek Flash 对照原文审校句式、语气和术语。初译的文风要求通过千问实际支持的英文 `translation_options.domains` 传递，各目标语言分别使用 `industry/prompts/translate-native-*.md`。术语在 `industry/translation.ts` 中维护，只发送当前文字出现的词组；checkout、token 等多义词结合工程上下文处理，不能全局替换。

审校只编辑现有内容，保留作者归因、人称、观点的不确定性和信息量。数字临时以占位符保护，本地恢复后检查数值、符号、货币、常见单位及月份；代码、链接与 HTML 嵌套也要保留。标题、摘要、正文、事件与报刊读者文字都走同一配置。两步分别记回执并受服务商预算限制；审校增加费用，不能沿用纯千问翻译的成本估算。

把审校开关设为 `false` 可只使用有文风提示与术语干预的千问初译。文风版本变化时，worker 按原有批量限制和预算逐步升级旧译文；已有完整译文在升级期间继续提供，失败或部分完成不会覆盖同修订的完整缓存。阅读页面始终不调用模型。

千问参数能力依据：[阿里云翻译模型文档](https://www.alibabacloud.com/help/zh/model-studio/machine-translation)。
