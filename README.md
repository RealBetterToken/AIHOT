# VibeHot

面向 Vibe Coding 和 AI 编程实践的热点与资讯网站。自动采集公开信源，用模型筛选、摘要和归组事件，发布精选与日报，支持中文、俄语和英文阅读。

[![MIT License](https://img.shields.io/badge/license-MIT-176b75?style=flat-square)](LICENSE)
![Node.js 24](https://img.shields.io/badge/Node.js-24-176b75?style=flat-square&logo=nodedotjs&logoColor=white)
![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-176b75?style=flat-square&logo=postgresql&logoColor=white)
![Docker Compose](https://img.shields.io/badge/Docker-Compose-176b75?style=flat-square&logo=docker&logoColor=white)

## 功能

- 采集 RSS、网页列表、JSON 接口、X 账号、微信公众号和外部推送内容。
- 预筛、两次独立评分、中文标题与摘要写作、标签提取和事件归组。
- 按独立信源和时间衰减计算热点，生成日报、周报和月报。
- 中文、俄语和英文界面，支持多语言摘要与全文阅读。
- 主题浏览、搜索、精选与全部动态，以及信源管理和内容诊断后台。
- 匿名访问的网站、RSS、公开 API、MCP 和 `llms.txt`。
- 模型调用回执、预算熔断、运行记录与告警。

当前信源以程序员社区的实践、问题和讨论为重点，覆盖 Hacker News、Reddit、DEV Community、V2EX、CSDN、稀土掘金、Habr 等社区，并保留官方更新与开发者博客。接入方式与已有站点的调整方法见 [信源](docs/sources.md)。模型榜和 Codex 重置监控模块默认关闭，可在 `industry/features.ts` 配置。

## 跑起来

需要 Docker（带 Compose），以及一个 OpenAI 兼容的模型 API Key。初始化脚本需要 Node.js 24.11 以上。

```bash
git clone https://github.com/RealBetterToken/VibeHot.git
cd VibeHot
node scripts/init-env.ts --llm-key <你的模型 API Key>
docker compose up -d --build
```

打开 <http://localhost:3000>，后台在 `/admin`，管理员密码由初始化脚本生成并保存在 `.env`。本机运行、域名和 HTTPS 配置见 [部署文档](docs/deploy.md)。

## 配置

行业和站点配置集中在 [`industry/`](industry/)：

| 文件 | 配置内容 |
|---|---|
| `site.ts` | 站名、首页文案、关于页、MCP 前缀与抓取身份 |
| `taxonomy.ts`、`topics.json` | 分类、标签和主题 |
| `sources.json` | 首次启动导入的信源 |
| `prompts/` | 预筛、评分、写作、归组、综述与翻译提示词 |
| `selection.ts` | 精选门槛 |
| `features.ts` | 可选模块开关 |
| `brand/`、`pages/` | 站点图标、使用规则与隐私说明 |

站点地址通过环境变量 `SITE_URL` 设置。已有信源可在后台管理；评分标准和门槛的校准方法见 [精选与校准](docs/selection.md)。

按环节使用两家服务商的三种模型时，复制 [`.env.models.example`](.env.models.example) 为 `.env.models`，填写 DeepSeek、DashScope 的 API Key 即可；路由已经预设。旧 `LLM_*` 单模型配置继续兼容。加载优先级、Docker 配置和上线前检查见 [模型配置](docs/model-configuration.md)。

## 检查

后端测试使用独立的空数据库，名称必须以 `_test` 或 `_ci` 结尾。开发和测试期间关闭采集、模型、飞书和 IndexNow 的外部调用开关。

```bash
npm ci
npm run typecheck
createdb vibehot_test
DATABASE_URL=postgres://127.0.0.1:5432/vibehot_test node scripts/migrate.ts
COLLECT_ENABLED=false MODEL_CALLS_ENABLED=false DATABASE_URL=postgres://127.0.0.1:5432/vibehot_test npm test
npm run build -w @aihot/web
node --test apps/web/tests/*.test.ts
node scripts/smoke.ts --base http://localhost:3000
```

## 文档

| 文档 | 内容 |
|---|---|
| [配置与定制](docs/customize.md) | 站名、分类、信源、提示词、品牌与页面 |
| [信源](docs/sources.md) | 信源类型、全文展示与外部推送 |
| [信源精简](docs/source-pruning.md) | 暂停入口、实际产出依据与恢复方式 |
| [精选与校准](docs/selection.md) | 处理流程、评分标准与门槛校准 |
| [部署](docs/deploy.md) | Docker、本机运行、HTTPS、更新与备份 |
| [模型配置](docs/model-configuration.md) | 统一凭据、环节路由、覆盖诊断与三语样本检查 |
| [模型费用预估](docs/model-cost-estimate.md) | 精简后的日常用量假设、价格与历史补译费用 |
| [真实试跑记录](docs/live-preview.md) | 三个社区的小批真实结果、费用及本机查看入口 |
| [架构](docs/architecture.md) | 进程、目录与公开出口 |
| [可选 AI 模块](docs/leaderboard.md) | 模型榜与 Codex 重置监控 |

技术栈：Node.js 24、TypeScript、React Router、Fastify、PostgreSQL、pg-boss、Tailwind CSS 和 Docker Compose。

## 来源与许可

VibeHot 基于数字生命卡兹克开源的 [AIHOT 框架](https://github.com/KKKKhazix/AIHOT) 开发。代码使用 [MIT 许可证](LICENSE)，上游版权与第三方素材说明见 [NOTICE](NOTICE)。
