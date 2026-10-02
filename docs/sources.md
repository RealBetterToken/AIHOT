# 信源

信源在后台“信源”页管理：新建、试抓一次看看抓到什么、改频率、启停、看失败原因和最近的条目。首次启动时，`industry/sources.json` 里的示范信源会被导入。

## 当前配置：程序员社区优先

默认配置重点采集程序员使用 AI 开发软件的实践、问题和讨论。2026-10-01 增加了 27 个社区入口，并保留原有 124 个入口的配置；经过范围、活跃度和正式采集器核查，先暂停了 51 个入口，再按实际产出与相关性暂停 12 个泛搜索、综合频道、重复或样本偏推广的入口。当前共 151 个入口，**88 个启用、63 个暂停**；新增入口有 17 个启用。官方发布、原创开发者博客和直接相关的安全分析仍有保留，评分维度与入选门槛沿用现有配置。具体调整见 [信源精简依据](source-pruning.md)，前序证据见 [社区信源活跃度核查](source-activity.md) 和 [全量采集核查](source-fetch-check.md)。这些是工作树中的默认配置，已有数据库须单独应用才会生效。

默认启用入口使用公开订阅或接口，不依赖付费 RSS 转换服务：

| 社区 | 新增内容范围 | 接入方式 |
|---|---|---|
| [Hacker News](https://news.ycombinator.com/) | Vibe Coding 讨论、Ask HN 的 AI 编程经验问答 | Algolia JSON；优先使用原始文章地址，避免讨论页防护拦截；Ask HN 自发帖保留 API 提供的正文 |
| [Reddit](https://www.reddit.com/) | r/ClaudeCode、r/codex、r/vibecoding | 三个板块合并为一个最新帖 Atom，使用订阅内的帖子正文；两个单板块入口暂停，减少重复请求和限流 |
| [DEV Community](https://dev.to/) | Vibe Coding、AI Coding、Cursor、MCP | 标签 RSS；订阅描述包含全文，按正文读取 |
| [V2EX](https://www.v2ex.com/) | Codex；保留原有 Claude Code、Vibe Coding | 节点 Atom；程序员、分享创造综合节点因范围较宽暂停，Cursor 专用节点因近期新帖偏少暂停 |
| [CSDN](https://www.csdn.net/) | Claude Code、Codex CLI 的博客文章 | 站内搜索 JSON；移除搜索跟踪参数，正文走现有抽取队列；Cursor AI 查询本轮样本集中推广中转服务，暂停该查询 |
| [稀土掘金](https://juejin.cn/) | AI 编程、Cursor、VibeCoding | 标签文章 JSON；按 `article_info.ctime` 读取原始发布时间 |
| [Habr](https://habr.com/) | Codex、Cursor 标签文章 | 搜索 RSS；保留原有 Claude Code、Вайбкодинг 专题与 Kova13v 作者入口，暂停编程和 AI 综合频道 |
| [Tproger](https://tproger.ru/) | 编程实践与讨论 | 网站 RSS，包含文章全文 |
| [Stack Overflow на русском](https://ru.stackoverflow.com/) | OpenAI、Copilot 相关问题（默认暂停） | 官方 JSON API 可读取，但两个查询均无近 30 天新问题 |
| [LINUX DO](https://linux.do/) | Codex、VibeCoding、Claude Code（默认暂停） | 平台仍活跃，但正式 Node 采集器触发防护，三个入口均暂停；不能用 curl 成功代替正式采集器通过 |
| [Cursor Forum](https://forum.cursor.com/) | Showcase 项目展示 | 分类 RSS；保留原有 Guides 入口 |

Reddit 默认每小时读取一次合并订阅，失败沿用已有退避机制；合并入口保留 `rss-reddit-claudecode` 的 ID，显示名称已改为三个板块。r/cursor 和 r/ChatGPTCoding 在核实时持续限流，暂未加入默认配置。俄语 Stack Overflow 的 RSS 返回 403，官方 API 可读取，但 OpenAI 查询最新问题为 2026-05-06，Copilot 查询最新问题为 2026-01-03，均已默认暂停。API 提供的是问题正文，不能把它当作答案或已经验证的解决方案。CSDN 搜索结果也可能包含存量文章，均沿用原始发布时间和历史回灌规则。

暂停的入口包括 X、泛 AI 新闻与评测、覆盖较宽的工程资讯和社区综合频道、GitHub 仓库泛搜索、Codex issue 泛搜索、重复 HN 查询、样本偏推广的 CSDN 查询、产出较少的社区入口、受防护拦截的 LINUX DO 标签及不可验证的 YouTube 订阅。X 需要 SocialData 凭证、数据库回执和付费预算，本次未调用，全部保留配置但默认关闭，不算作抓取通过。只暂停后续采集，历史内容保留，可在后台逐个恢复。核查按具体节点、标签和查询进行，平台有人访问不代表每个入口都热门。当前启用的 77 个精选候选入口中有 33 个带社区标签的入口，另有 11 个只提供热度信号；实际页面入选比例仍取决于产出、判重与现有筛选结果。启用类型为 59 个 RSS / Atom、14 个网页列表、15 个 JSON 列表。

### 实抓核查

```bash
node scripts/check-sources.ts --output /tmp/vibehot-source-check.json
node scripts/check-sources.ts --enabled --output /tmp/vibehot-enabled-check.json
node scripts/check-sources.ts --source json-zh-juejin-aicoding,rss-reddit-claudecode
```

脚本要求 Node.js 24.11 或更新版本。默认覆盖配置中全部入口，包括暂停项；按正式采集器解析，再应用 URL、噪声和首次回灌规则，记录有效标题、原文地址、日期、摘要及正文样本。精选候选入口还必须有摘要、订阅正文或可抽取的正文样本，只拿到标题不算通过。正文另用正式抽取函数检查，无法抽取会明确记录，不把仅有标题的条目说成全文。遇到限流或临时服务错误最多重试一次。启用入口失败或需要付费验证时退出码为 1。脚本不连接数据库、不入库、不排队、不调用模型或付费接口、不发送通知；独立于需要空测试库的离线测试。

### 已有站点怎样应用

普通初始化不会覆盖后台设置。新增入口可通过现有初始化脚本导入；默认暂停清单和六个社区入口的修正用单独脚本应用：

```bash
node --env-file=.env scripts/seed.ts
node scripts/apply-community-sources.ts
node --env-file=.env scripts/apply-community-sources.ts --apply
```

第二条命令预览暂停列表及六个社区入口的名称、采集配置，不连接数据库。第三条命令暂停配置里明确设置 `enabled=false` 且数据库中仍启用的信源，并刷新五个 Hacker News 入口和 Reddit 合并订阅的名称、采集配置；不主动恢复后台已暂停的入口。其他后台设置保留，所有变更通过现有后台更新方法记录审计。可重复执行，不删除信源或文章。仅 seed 不会修正数据库中已存在的 Hacker News 采集配置。

## 六种信源

| 类型 | 适合 | 需要 |
|---|---|---|
| `rss` | 有 RSS / Atom 的博客、媒体、Substack、公众号转 RSS 服务 | 无 |
| `web_list` | 没有 RSS 的网页列表（新闻页、博客列表、更新日志） | 写选择器；抓不到时可以经 Jina Reader 渲染（按次计费） |
| `json_list` | 返回 JSON 的接口（GitHub Releases 等） | 写字段路径 |
| `x_search` | X（推特）账号 | SocialData 的 key，按请求计费 |
| `mp_account` | 微信公众号 | 极致了（Dajiala）的 key，按请求计费 |
| `external` | 你自己的脚本推送进来的内容 | `INGEST_TOKEN`，见下文 |

每种信源认哪些配置项写在 `packages/backend/src/sources/config-keys.ts`。填了不认识的配置项，保存会被拒绝、抓取会直接失败并在后台显示原因，不会悄悄退回通用解析。

### rss

```json
{ "feedUrl": "https://example.com/feed.xml" }
```

可选：`fetchPublicContent`（订阅只给摘要时设为 true，正文通过正常队列从原文页抽取，不把 feed 文本当全文）、`summaryIsBody`（订阅里的摘要就是全文）、`allowCategories` / `denyCategories`（按订阅里的分类过滤）。

### web_list

```json
{
  "url": "https://example.com/news",
  "itemSelector": "article",
  "linkSelector": "a",
  "titleSelector": "h2",
  "publishedAtSelector": "time"
}
```

- `parseMode`：`html`（默认，用选择器）、`markdown`（经 Jina 渲染后按 Markdown 读）、`docusaurus_changelog`。
- `detail`：列表缺日期、标题或摘要时抓详情页补齐（`publishedAtSelector`、`titleSelector`、`summarySelector` 等）。
- `allowUrlPrefixes` / `denyUrlPrefixes`：只收某些路径下的文章。

### x_search

```json
{ "query": "from:SomeAccount -filter:replies" }
```

普通账号会被自动合并成一次搜索（每次最多二十几个账号），省请求数。

### mp_account

```json
{ "ghid": "gh_xxxxxxxx", "nickname": "公众号名称" }
```

每个公众号按它的抓取间隔检查一次（查列表按次计费），新文章的正文一并取回。

## 分级、参与方式与全文

- **分级** `tier`：`T1` 官方一手（官网、官方博客、机构）、`T1_5` 官方账号与准官方创作者、`T2` 媒体与个人、`EXCLUDE_MP` 不参与精选。入选门槛按分级不同（`industry/selection.ts`）。
- **参与方式** `participation_mode`：`editorial` 进精选和全部动态；`hot_signal` 不单独展示，只作为“大家在讨论什么”的热度证据；`isolated` 不进任何公开页面。
- **一手** `first_party`：来源是当事方自己。事件页会优先展示一手报道。
- **全文**：`site_fulltext` 决定站内能不能显示全文，`syndicate_fulltext` 决定全文 RSS 能不能带正文。两者**默认都开**：站内展示已成功抽取的全文，全文 RSS 默认带正文。公众号、付费墙内容也遵循相同开关；如个别来源不允许转载，可在后台关闭 `site_fulltext` / `syndicate_fulltext`。抓不到的正文仍只展示摘要和原文链接。

## 抓取频率

每个信源有自己的抓取间隔。当前 88 个入口的初始间隔合计约每天 1,584 次列表检查；它不等于新增文章数，也不等于模型调用次数。每天北京时间 04:20 会按近 7 天的产出自动调整：产出多的抓得勤，最短 15 分钟；热度入口最长 180 分钟，其他按次计费入口最长 120 分钟，免费精选候选入口最长 60 分钟。X 分片另按固定频率调度。

抓取失败不推进位置，下次从同一处继续；连续失败的信源在后台标红，每周一会在运营群发一份信源周报（配置了飞书内部群时）。

## 规则：旧文不刷屏

首次发现时原文已经发布超过 48 小时的资料、新信源第一次导入的存量条目、标记为回灌的推送，都按原文时间归档：不进入“今天”，也不推送。这条规则所有入口共用，防止一次性导入历史内容刷屏。

## 外部推送接口

自己写脚本抓的内容，可以推进站里，走和普通采集一样的判重、精选和归组。

```
POST /api/ingest/items
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json

{
  "sourceId": "my-crawler",
  "sourceName": "我的抓取脚本",
  "items": [
    { "title": "必填", "url": "必填", "publishedAt": "2026-10-01T08:00:00+08:00", "author": "可选" }
  ]
}
```

- `INGEST_TOKEN` 在 `.env` 里设置，至少 16 位；不设置时接口一律返回 401。
- 每次最多 50 条；每个客户端每分钟最多 10 次。
- 返回 `{"ok": true, "created": <新建条数>}`。缺标题或网址的条目会被跳过，同一请求里重复的网址只取第一条。
- `sourceId` 不存在时会自动建一个 `external` 信源，默认不进公开页面：到后台把它的参与方式改成 `editorial` 才会出现在站上。
- 条目的 `raw._aihot.backfill` 为 `true` 时按历史回灌处理（不进入“今天”、不推送）。
