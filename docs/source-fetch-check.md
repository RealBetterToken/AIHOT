# 全量信源采集核查

核查时间：2026-10-01 13:18:44 至 2026-10-01 13:23:00（北京时间）。Node.js 24.11.1，使用当前仓库的正式采集器。

核查时配置共 151 个入口：100 个默认启用、51 个暂停。逐项核查全部入口，对其中 121 个公开入口发起真实网络请求；30 个 X 入口需要付费验证，未发起请求且全部暂停。最终当时的 100 个默认启用入口全部通过，精选候选入口均有摘要、订阅正文或可抽取的正文样本，只取到标题不算通过。

本文和下表保留 13:23 的实抓快照，状态不随后续配置改写。晚间按相关性另暂停 12 个入口后，默认启用为 88 个，均属于本次通过集合，采集地址与字段未变；没有把旧结果冒充另一次全量实抓。当前配置与调整依据见 [信源精简](source-pruning.md)。

| 范围 | 通过 | 抓取或内容检查失败 | 需付费验证 |
|---|---:|---:|---:|
| 默认启用的 100 个入口 | 100 | 0 | 0 |
| 暂停的 51 个入口 | 14 | 7 | 30 |
| 全部 151 个入口 | 114 | 7 | 30 |

启用入口中，95 个取得至少一个正文样本，另 5 个（CSDN 的 Cursor AI / Codex CLI、掘金的三个标签）取得有效摘要，但本轮正文样本未成功抽取。正文数字是样本字符数，不代表该源所有文章都能取得全文；本次也没有验证视频转录或模型筛选。

## 怎样核查

- RSS / Atom、JSON、网页列表分别调用 `fetchRss`、`fetchJsonList`、`fetchWebList`，没有另写一个解析器来代替生产代码。
- 强制读取 RSS，排除 304 的空结果；复用生产的 URL 允许规则和噪声过滤，并按首次回灌时间窗口、条数限制检查有效条目。记录原始解析数量和最终可接收数量。
- 检查非空标题、HTTP(S) 原文地址、可解析日期、摘要与正文。订阅有全文时直接检查正文；只有列表数据时另用正式 `readable` 抽取函数检查最多两篇原文。HTTP 200 的防护页、菜单或空列表不能代替有效内容。
- 每个域名串行，最多四个域名同时请求。限流或临时服务错误最多重试一次。GitHub 三个仓库搜索入口在全量扫描中临时返回 403，随后同配置定向复测通过；JSON 中保留初次失败与复测记录，下表展示每个入口的最新实测。
- 不连接数据库、不存文章、不排任务、不调用模型、Jina / SocialData 等付费服务，不发送通知。采集、模型、飞书和 IndexNow 的自动开关保持关闭。

完整机器记录包含核查时间、配置 SHA-256、每个入口的结果、标题、原文链接、日期和正文字符数，见 [source-fetch-results.json](source-fetch-results.json)。该记录不是线上数据库的健康状态。

## 已修正或暂停的入口

| 入口 | 实测原因 | 处理 |
|---|---|---|
| 五个 Hacker News 讨论查询 | Algolia 返回条目，但讨论页返回 419，原配置部分条目只有标题 | 优先原始文章地址，自发帖读取 `story_text`；四个旧查询限定标题匹配；五个入口均取得正文样本 |
| Reddit 三个板块 | 连续请求单板块 RSS 出现 429；合并订阅可解析出帖子正文 | 保留一个合并入口，仍覆盖 ClaudeCode / Codex / VibeCoding，两个单板块入口暂停 |
| LINUX DO 三个标签 | 正式 Node 采集器连续返回 403 防护页，改 User-Agent 和公开 JSON 入口仍受限；curl 成功不能代替生产路径 | 全部暂停，平台活跃度判断另见活跃度报告 |
| Cole Medin · YouTube | 官方频道页可确认频道 ID，但 RSS 多次返回 404 / 500 | 暂停该订阅，不把频道页面存在当成订阅可采集 |
| AI Engineer · YouTube | RSS 间歇 404；成功时仅有视频标题、地址和日期，未取得描述或正文 | 暂停，不把元数据当成可写作的正文 |
| X 的 30 个入口 | 需要 SocialData 凭证、数据库回执和付费预算，本轮公开接口核查未调用 | 配置保留，全部暂停；未算作通过 |
| Arena · Blog | 先前已因范围过宽暂停，本轮能取标题，未取得摘要或正文 | 保持暂停 |

其他原有入口及历史文章保留；部分可采集入口仍因重叠、覆盖过宽或近期产出不足暂停。俄语 Stack Overflow 官方 API 能读到问题，但两个查询没有近 30 天新问题，保持暂停。评分维度和入选门槛没有调整。

## 逐项结果

“解析 / 接收”分别为正式解析器返回条数与首次回灌规则下可接收的有效条数。“日期 / 摘要”只统计接收条目。正文样本为 0 表示本轮未取得，不能据此声称有全文。暂停项即使通过也不自动恢复。

| 信源 ID | 默认 | 最新实测 | 解析 / 接收 | 日期 / 摘要 | 正文样本字符 | 示例原文 |
|---|---|---|---:|---:|---:|---|
| `rss-aihero-skills` | 启用 | 通过 | 11 / 8 | 8 / 8 | 13112 | [原文](https://www.aihero.dev/skills/skills-changelog-v12-wait-what-writing-for-agents-claude-code-plugin-and-more) |
| `rss-anomalyco-opencode-releases` | 启用 | 通过 | 10 / 8 | 8 / 0 | 530 | [原文](https://github.com/anomalyco/opencode/releases/tag/v2.0.21) |
| `rss-anthropics-claude-code-releases` | 启用 | 通过 | 10 / 8 | 8 / 0 | 12618 | [原文](https://github.com/anthropics/claude-code/releases/tag/v2.1.286) |
| `rss-claude-platform-notes` | 启用 | 通过 | 146 / 8 | 8 / 8 | 79483 | [原文](https://platform.claude.com/docs/en/release-notes/overview#september-30-2026) |
| `rss-cline-blog` | 启用 | 通过 | 15 / 8 | 8 / 8 | 5797 | [原文](https://cline.ghost.io/cline-desktop-an-open-source-app-for-open-weight-models/) |
| `rss-github-copilot-changelog` | 启用 | 通过 | 10 / 8 | 8 / 8 | 2556 | [原文](https://github.blog/changelog/2026-09-30-hydrafusion-in-vs-code-and-the-github-copilot-app) |
| `rss-google-gemini-gemini-cli-releases` | 启用 | 通过 | 10 / 1 | 1 / 0 | 1984 | [原文](https://github.com/google-gemini/gemini-cli/releases/tag/v0.62.0) |
| `rss-kiro-changelog` | 启用 | 通过 | 25 / 8 | 8 / 8 | 1854 | [原文](https://kiro.dev/changelog/web/introducing-workflows) |
| `rss-moonshotai-kimi-cli-releases` | 启用 | 通过 | 10 / 8 | 8 / 0 | 373 | [原文](https://github.com/MoonshotAI/kimi-cli/releases/tag/1.52.0) |
| `rss-openai-codex-releases` | 启用 | 通过 | 10 / 1 | 1 / 0 | 277 | [原文](https://github.com/openai/codex/releases/tag/rust-v0.159.3) |
| `rss-qwenlm-qwen-code-releases` | 启用 | 通过 | 10 / 6 | 6 / 0 | 15920 | [原文](https://github.com/QwenLM/qwen-code/releases/tag/v0.24.7) |
| `web-augment-blog` | 启用 | 通过 | 22 / 8 | 8 / 0 | 11465 | [原文](https://www.augmentcode.com/blog/beyond-ai-coding-agents-how-we-built-augments-software-factory) |
| `web-cursor-changelog` | 启用 | 通过 | 5 / 5 | 5 / 0 | 1449 | [原文](https://cursor.com/changelog/rollouts-and-security-reviewer) |
| `web-deepseek-news` | 暂停 | 通过 | 5 / 3 | 3 / 0 | 1798 | [原文](https://www.deepseek.com/en/news/deepseek-v4-1-flash/) |
| `web-kimi-code-whats-new` | 启用 | 通过 | 52 / 8 | 8 / 0 | 43629 | [原文](https://www.kimi.com/code/docs/en/kimi-code/whats-new.html#v2-1-0-september-23-2026) |
| `web-lovable-blog` | 启用 | 通过 | 164 / 8 | 8 / 0 | 4368 | [原文](https://lovable.dev/blog/how-lovable-protects-your-app-from-a-tanstack-start-vulnerability) |
| `web-openai-codex-cookbook` | 启用 | 通过 | 5 / 4 | 4 / 0 | 46588 | [原文](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex) |
| `web-qwen-code-weekly` | 启用 | 通过 | 31 / 8 | 8 / 0 | 17143 | [原文](https://qwenlm.github.io/qwen-code-docs/en/blog/updates/weekly-update-2026-09-24/) |
| `web-terminal-bench-news` | 启用 | 通过 | 19 / 8 | 8 / 0 | 4128 | [原文](https://www.tbench.ai/news/terminal-bench-4-0) |
| `web-vercel-v0-blog` | 启用 | 通过 | 3 / 3 | 3 / 0 | 10644 | [原文](https://vercel.com/blog/introducing-the-new-v0-api) |
| `rss-addy-osmani` | 启用 | 通过 | 10 / 8 | 8 / 8 | 17423 | [原文](https://addyosmani.com/blog/brownfield-agentic-engineering/) |
| `rss-geoffrey-huntley` | 启用 | 通过 | 15 / 8 | 8 / 7 | 3914 | [原文](https://ghuntley.com/eighteen-month-recap/) |
| `rss-devagentstack` | 启用 | 通过 | 16 / 8 | 8 / 8 | 23163 | [原文](https://devagentstack.com/blog/gpt-6-astra-benchmarks-vs-fable-5-1/) |
| `rss-hn-agent-skills` | 启用 | 通过 | 20 / 8 | 8 / 3 | 5055 | [原文](https://microsoft.github.io/SkillOpt/) |
| `rss-hn-mcp` | 启用 | 通过 | 20 / 8 | 8 / 8 | 13683 | [原文](https://www.stagehand.dev/blog/playwright-mcp-token-usage) |
| `rss-hn-prompt-injection` | 启用 | 通过 | 20 / 8 | 8 / 1 | 12770 | [原文](https://github.com/rudratoshs/buried-injections) |
| `rss-sean-goedecke` | 启用 | 通过 | 30 / 8 | 8 / 0 | 4117 | [原文](https://seangoedecke.com/human-ai-partnerships-are-for-alignment-not-capability/) |
| `rss-simon-willison` | 启用 | 通过 | 30 / 8 | 8 / 8 | 17770 | [原文](https://simonwillison.net/2026/Sep/29/openai-devday-2026-live-blog/) |
| `rss-trail-of-bits` | 启用 | 通过 | 20 / 8 | 8 / 8 | 18339 | [原文](https://blog.trailofbits.com/2026/09/25/dont-let-tees-break-your-mpc/) |
| `rss-habr-ai` | 启用 | 通过 | 40 / 8 | 8 / 8 | 11741 | [原文](https://habr.com/ru/articles/1087114/?utm_campaign=1087114&utm_source=habrahabr&utm_medium=rss) |
| `rss-habr-programming` | 启用 | 通过 | 40 / 8 | 8 / 8 | 13893 | [原文](https://habr.com/ru/companies/otus/articles/1087292/?utm_campaign=1087292&utm_source=habrahabr&utm_medium=rss) |
| `web-ru-etechlead` | 启用 | 通过 | 15 / 8 | 8 / 0 | 4059 | [原文](https://t.me/etechlead/314) |
| `rss-zh-v2ex-claudecode` | 启用 | 通过 | 50 / 8 | 8 / 8 | 364 | [原文](https://www.v2ex.com/t/1245559#reply9) |
| `rss-zh-v2ex-vibecoding` | 启用 | 通过 | 50 / 8 | 8 / 7 | 278 | [原文](https://www.v2ex.com/t/1245374#reply2) |
| `rss-agentic-engineer` | 启用 | 通过 | 20 / 8 | 8 / 8 | 13687 | [原文](https://agentic-engineer.com/blog/2026-09-21-run-claude-code-any-model-openrouter) |
| `rss-claude-dev-blog` | 启用 | 通过 | 12 / 8 | 8 / 8 | 15013 | [原文](https://claude.dev/blog/building-with-claude-sonnet-5-5/) |
| `rss-hn-agents-md` | 启用 | 通过 | 20 / 8 | 8 / 0 | 11747 | [原文](https://www.fmind.dev/articles/agents-md-speaks-unix/) |
| `rss-simon-willison-tils` | 启用 | 通过 | 15 / 8 | 8 / 0 | 1742 | [原文](https://til.simonwillison.net/llms/blender-coding-agents-macos) |
| `rss-vibe-built` | 启用 | 通过 | 20 / 8 | 8 / 8 | 13951 | [原文](https://vibebuilt.dev/blog/ai-coding-assistant/) |
| `rss-vibe-code-textbook` | 启用 | 通过 | 26 / 8 | 8 / 8 | 8461 | [原文](https://vibecodetextbook.com/posts/ai-code-review-bots-compared.html) |
| `rss-ru-habr-claude-code-search` | 启用 | 通过 | 20 / 8 | 8 / 8 | 12790 | [原文](https://habr.com/ru/articles/1088110/?utm_source=habrahabr&utm_medium=rss&utm_campaign=1088110) |
| `web-ru-the-ai-architect` | 启用 | 通过 | 17 / 8 | 8 / 0 | 506 | [原文](https://t.me/the_ai_architect/421) |
| `rss-zh-xiaochens` | 启用 | 通过 | 16 / 8 | 8 / 8 | 2304 | [原文](https://blog.xiaochens.com/blog/pink-elephant-prompt-pruning/) |
| `rss-devto-claudecode` | 启用 | 通过 | 12 / 8 | 8 / 8 | 25749 | [原文](https://dev.to/rulestack/0-of-2-cat-reads-loaded-the-skill-in-packagesapiclaudeskills-claude-codes-read-tool-loaded-it-41eh) |
| `rss-devto-codex` | 启用 | 通过 | 12 / 8 | 8 / 8 | 5388 | [原文](https://dev.to/aicoding-guide/codex-cli-v0158-mcp-oauth-client-secrets-and-approval-for-elevated-commands-52o7) |
| `rss-register-spill` | 启用 | 通过 | 20 / 8 | 8 / 8 | 14324 | [原文](https://registerspill.thorstenball.com/p/joy-and-curiosity-101) |
| `web-martinfowler-exploring-gen-ai` | 启用 | 通过 | 32 / 8 | 8 / 0 | 6939 | [原文](https://martinfowler.com/articles/exploring-gen-ai/an-accidental-blackboard.html) |
| `rss-ru-habr-vibecoding-search` | 启用 | 通过 | 20 / 8 | 8 / 8 | 19084 | [原文](https://habr.com/ru/companies/gptunnel/articles/1088758/?utm_source=habrahabr&utm_medium=rss&utm_campaign=1088758) |
| `web-ru-ai-coder-news` | 启用 | 通过 | 19 / 8 | 8 / 0 | 1476 | [原文](https://t.me/ai_coder_news/579) |
| `web-ru-ai-driven` | 启用 | 通过 | 15 / 8 | 8 / 0 | 255 | [原文](https://t.me/ai_driven/275) |
| `rss-zh-chen-dahuang` | 启用 | 通过 | 14 / 8 | 8 / 8 | 1774 | [原文](https://chendahuang.com/blog/model-harness-decoupling/) |
| `rss-zh-linux-do-vibecoding` | 暂停 | 失败：HTTP 403 | 0 / 0 | 0 / 0 | 0 | — |
| `rss-permission-protocol-agent-incidents` | 启用 | 通过 | 165 / 8 | 8 / 8 | 3185 | [原文](https://permissionprotocol.com/agent-incident-tracker/amazon-kiro-powers-workspace-secret-exfiltration) |
| `web-anthropic-model-launches` | 暂停 | 通过 | 3 / 3 | 3 / 0 | 10575 | [原文](https://www.anthropic.com/claude-sonnet-5-5) |
| `web-arena-blog` | 暂停 | 失败：只取得标题、链接等元数据；正文样本和摘要均未取得 | 13 / 8 | 8 / 0 | 0 | [原文](https://arena.ai/blog/coding-agents-harness-tax) |
| `web-artificial-analysis-articles` | 暂停 | 通过 | 12 / 8 | 8 / 0 | 4168 | [原文](https://artificialanalysis.ai/articles/korean-ai-lab-upstage-releases-solar-mini-4) |
| `x-addy-osmani` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-amp` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-boris-cherny` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-claude-devs` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-anthropic` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-arena` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-artificial-analysis` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-claude` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-deepseek` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-kimi` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-minimax` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-openai` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-qwen` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-zai` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-cline` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-cognition` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-cursor` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-kilo` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-minimax-agent` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-openai-devs` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-opencode` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-tibo-sottiaux` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `rss-jesse-vincent` | 启用 | 通过 | 542 / 8 | 8 / 8 | 1318 | [原文](https://blog.fsck.com/2026/09/29/I-asked-muse-to-tell-me-about-updates-to-its-skills/) |
| `rss-ryan-lopopolo` | 启用 | 通过 | 41 / 8 | 8 / 8 | 2655 | [原文](https://hyperbo.la/w/aligned-to-whom/) |
| `web-openai-codex-blog` | 启用 | 通过 | 16 / 8 | 1 / 0 | 8655 | [原文](https://developers.openai.com/blog/bringing-my-led-display-to-life) |
| `rss-cursor-forum-guides` | 启用 | 通过 | 25 / 8 | 8 / 8 | 1099 | [原文](https://forum.cursor.com/t/architectural-guidelines-for-managing-context-across-multi-package-monorepos-in-cursor/172669) |
| `rss-github-blog-copilot` | 启用 | 通过 | 10 / 8 | 8 / 8 | 3639 | [原文](https://github.blog/ai-and-ml/github-copilot/github-copilot-app-for-beginners-how-to-build-custom-workflows-with-canvases/) |
| `rss-yt-ai-engineer` | 暂停 | 失败：HTTP 404 | 0 / 0 | 0 / 0 | 0 | — |
| `rss-yt-cole-medin` | 暂停 | 失败：HTTP 404 | 0 / 0 | 0 / 0 | 0 | — |
| `rss-habr-kova13v` | 启用 | 通过 | 4 / 4 | 4 / 4 | 14583 | [原文](https://habr.com/ru/articles/1085288/?utm_campaign=1085288&utm_source=habrahabr&utm_medium=rss) |
| `rss-martin-alderson` | 启用 | 通过 | 66 / 8 | 8 / 8 | 7299 | [原文](https://martinalderson.com/posts/ai-margin-collapse-gathering-pace/?utm_source=rss&utm_medium=rss&utm_campaign=feed) |
| `rss-harper-reed` | 启用 | 通过 | 20 / 7 | 7 / 7 | 7285 | [原文](https://harper.blog/2026/09/22/break-away/) |
| `rss-birgitta` | 启用 | 通过 | 16 / 8 | 8 / 8 | 307 | [原文](https://birgitta.info/pubs/2026-08-10-tdd-inside-the-agent-loop) |
| `rss-armin-ronacher` | 启用 | 通过 | 10 / 8 | 8 / 8 | 18613 | [原文](https://lucumr.pocoo.org/2026/9/29/deser/) |
| `rss-pragmatic-engineer` | 暂停 | 通过 | 20 / 8 | 8 / 8 | 12592 | [原文](https://newsletter.pragmaticengineer.com/p/distributed-databases-with-peter) |
| `rss-dan-luu` | 暂停 | 通过 | 128 / 8 | 8 / 8 | 17514 | [原文](https://danluu.com/brain-off/) |
| `rss-drew-breunig` | 启用 | 通过 | 20 / 8 | 8 / 8 | 9842 | [原文](https://www.dbreunig.com/2026/09/07/what-we-can-learn-from-claude-s-fable-5-1-system-prompt.html) |
| `rss-baoyu` | 启用 | 通过 | 50 / 8 | 8 / 8 | 6669 | [原文](https://baoyu.io/blog/gpt-6-astra-peach-blossom-land) |
| `rss-steve-yegge` | 启用 | 通过 | 10 / 8 | 8 / 0 | 1405 | [原文](https://steve-yegge.medium.com/fences-not-sandboxes-5719cd9b04bd?source=rss-c1ec701babb7------2) |
| `rss-hn-claude-code-100` | 启用 | 通过 | 20 / 8 | 8 / 0 | 5400 | [原文](https://blog.szypowi.cz/p/claude-code-reads-agents.md-only-when-telemetry-is-on/) |
| `rss-hn-frontpage-ai-coding` | 启用 | 通过 | 20 / 8 | 8 / 1 | 8341 | [原文](https://tangled.org/yanndegat.tngl.sh/drawgent) |
| `json-gh-codex-workaround` | 启用 | 通过 | 20 / 8 | 8 / 8 | 2380 | [原文](https://github.com/openai/codex/issues/49841) |
| `rss-thoughtworks-engineering` | 暂停 | 通过 | 190 / 8 | 8 / 8 | 12574 | [原文](https://www.thoughtworks.com/insights/blog/generative-ai/why-generative-ai-wont-create-ten-x-developers) |
| `rss-infoq-ai-coding` | 启用 | 通过 | 2 / 2 | 2 / 2 | 4023 | [原文](https://www.infoq.com/news/2026/09/cloudflare-worker-agent/?utm_campaign=infoq_content&utm_source=infoq&utm_medium=feed&utm_term=AI+Coding) |
| `rss-infoq-ai-coding-presentations` | 启用 | 通过 | 2 / 2 | 2 / 2 | 36223 | [原文](https://www.infoq.com/presentations/architecture-context-engineering/?utm_campaign=infoq_content&utm_source=infoq&utm_medium=feed&utm_term=AI+Coding-presentations) |
| `rss-leaddev-engineering-ai` | 暂停 | 通过 | 10 / 8 | 8 / 8 | 10010 | [原文](https://leaddev.com/ai/your-error-budgets-dont-know-ai-exists?utm_source=leaddev&utm_medium=RSS) |
| `rss-paper-compute-blog` | 启用 | 通过 | 36 / 8 | 8 / 8 | 8772 | [原文](https://papercompute.com/blog/ai-made-silos-easier/) |
| `rss-kondasamy-ai-engineering` | 启用 | 通过 | 78 / 8 | 8 / 8 | 4683 | [原文](https://kondasamy.com/til/2026/hyphens-en-dashes-and-the-prose-dash/) |
| `rss-johnny-butler-agent-engineering` | 启用 | 通过 | 30 / 8 | 8 / 0 | 1867 | [原文](https://world.hey.com/johnnybutler/engineering-standards-belong-inside-the-agent-loop-7fc7cd5a) |
| `rss-sourcegraph-agent-engineering` | 暂停 | 通过 | 30 / 8 | 8 / 8 | 6940 | [原文](https://sourcegraph.com/blog/the-autonomous-codebase) |
| `rss-shopify-engineering-ai-workflows` | 暂停 | 通过 | 431 / 8 | 8 / 8 | 10661 | [原文](https://shopify.engineering/helix) |
| `web-motyl-ai-weekly` | 暂停 | 通过 | 10 / 8 | 8 / 0 | 6974 | [原文](https://motyl.dev/newsletter/30) |
| `json-hn-coding-agent-discussion` | 启用 | 通过 | 20 / 8 | 8 / 1 | 3283 | [原文](https://tangled.org/yanndegat.tngl.sh/drawgent) |
| `json-hn-ai-code-review-discussion` | 启用 | 通过 | 20 / 8 | 8 / 2 | 1953 | [原文](https://github.com/mukundzha/avouch) |
| `json-hn-context-engineering-discussion` | 启用 | 通过 | 15 / 7 | 7 / 1 | 282 | [原文](https://github.com/NeoLabHQ/context-engineering-kit) |
| `json-hn-harness-engineering-discussion` | 启用 | 通过 | 10 / 8 | 8 / 0 | 14492 | [原文](https://Habitat-Thinking.github.io/ai-literacy-superpowers/plugins/ai-literacy-superpowers/explanation/harness-engineering/) |
| `rss-console-dev-tools-weekly` | 启用 | 通过 | 8 / 8 | 8 / 8 | 1359 | [原文](https://rune.build/?ref=console.dev) |
| `json-gh-mcp-developer-tools` | 启用 | 通过 | 20 / 8 | 8 / 8 | 9585 | [原文](https://github.com/markpasternak/canvas-drop) |
| `json-gh-developer-agent-skills` | 启用 | 通过 | 20 / 8 | 8 / 8 | 19866 | [原文](https://github.com/coco-research/coco) |
| `json-gh-ai-coding-developer-tools` | 启用 | 通过 | 20 / 8 | 8 / 8 | 4527 | [原文](https://github.com/BrokkAi/mjolnir) |
| `x-thariq` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-ryan-lopopolo` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-search-claude-code-workflow` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-search-context-cost` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-search-codex-agents-md` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-search-skills-hooks` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-search-zh` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `x-search-ru` | 暂停 | 未实抓：需付费验证 | 0 / 0 | 0 / 0 | 0 | — |
| `json-hn-vibecoding` | 启用 | 通过 | 20 / 8 | 8 / 0 | 7009 | [原文](https://www.reddit.com/r/ClaudeCode/comments/1wtndzi/i_am_the_scab_dev/) |
| `json-hn-ask-ai-coding` | 启用 | 通过 | 20 / 8 | 8 / 6 | 15 | [原文](https://news.ycombinator.com/item?id=49915049) |
| `rss-reddit-claudecode` | 启用 | 通过 | 25 / 8 | 8 / 0 | 1629 | [原文](https://www.reddit.com/r/codex/comments/1wuqwl9/dots_still_doesnt_feel_ready_for_managing_codex/) |
| `rss-reddit-codex` | 暂停 | 失败：HTTP 429 | 0 / 0 | 0 / 0 | 0 | — |
| `rss-reddit-vibecoding` | 暂停 | 通过 | 25 / 8 | 8 / 0 | 1413 | [原文](https://www.reddit.com/r/vibecoding/comments/1wuq3di/built_shipped_a_roblox_game_in_19_hours_is_it_ai/) |
| `rss-devto-vibecoding` | 启用 | 通过 | 12 / 8 | 8 / 8 | 6209 | [原文](https://dev.to/codelong888/where-to-list-a-vibe-coded-app-in-2026-launch-sites-compared-ph6) |
| `rss-devto-aicoding` | 启用 | 通过 | 12 / 8 | 8 / 8 | 10918 | [原文](https://dev.to/sanjay_singh_1/who-owns-the-code-written-by-ai-12m1) |
| `rss-devto-cursor` | 启用 | 通过 | 12 / 8 | 8 / 8 | 1118 | [原文](https://dev.to/vildandenai/put-a-tiny-deny-list-in-every-agent-config-before-the-wish-list-3bpn) |
| `rss-devto-mcp` | 启用 | 通过 | 12 / 8 | 8 / 8 | 12878 | [原文](https://dev.to/vladzoff/the-agent-shouldnt-be-able-to-approve-its-own-rules-2lhc) |
| `rss-zh-v2ex-codex` | 启用 | 通过 | 50 / 8 | 8 / 1 | 445 | [原文](https://www.v2ex.com/t/1245544#reply6) |
| `rss-zh-v2ex-cursor` | 暂停 | 通过 | 50 / 8 | 8 / 0 | 484 | [原文](https://www.v2ex.com/t/1243874#reply1) |
| `rss-zh-v2ex-programmer` | 启用 | 通过 | 50 / 8 | 8 / 0 | 342 | [原文](https://www.v2ex.com/t/1245989#reply0) |
| `rss-zh-v2ex-create` | 启用 | 通过 | 50 / 8 | 8 / 0 | 833 | [原文](https://www.v2ex.com/t/1245983#reply1) |
| `json-zh-csdn-claudecode` | 启用 | 通过 | 30 / 8 | 8 / 8 | 10662 | [原文](https://blog.csdn.net/weixin_42545503/article/details/166771922) |
| `json-zh-csdn-cursor-ai` | 启用 | 通过 | 30 / 8 | 8 / 8 | 0 | [原文](https://blog.csdn.net/weixin_42576410/article/details/166941819) |
| `json-zh-csdn-codex-cli` | 启用 | 通过 | 30 / 8 | 8 / 8 | 0 | [原文](https://blog.csdn.net/weixin_32501329/article/details/166766911) |
| `json-zh-juejin-aicoding` | 启用 | 通过 | 20 / 8 | 8 / 8 | 0 | [原文](https://juejin.cn/post/7691219326316380175) |
| `json-zh-juejin-cursor` | 启用 | 通过 | 20 / 8 | 8 / 8 | 0 | [原文](https://juejin.cn/post/7691132455895121962) |
| `json-zh-juejin-vibecoding` | 启用 | 通过 | 20 / 8 | 8 / 8 | 0 | [原文](https://juejin.cn/post/7690596943455584307) |
| `rss-ru-habr-codex-search` | 启用 | 通过 | 20 / 8 | 8 / 8 | 3640 | [原文](https://habr.com/ru/news/1088596/?utm_source=habrahabr&utm_medium=rss&utm_campaign=1088596) |
| `rss-ru-habr-cursor-search` | 启用 | 通过 | 20 / 8 | 8 / 8 | 11053 | [原文](https://habr.com/ru/companies/domclick/articles/1085232/?utm_source=habrahabr&utm_medium=rss&utm_campaign=1085232) |
| `rss-ru-tproger` | 启用 | 通过 | 50 / 8 | 8 / 8 | 8822 | [原文](https://tproger.ru/articles/pochemu-komanda-rastyot-a-fichi-vyhodyat-medlennee) |
| `json-ru-stackoverflow-openai` | 暂停 | 通过 | 20 / 1 | 1 / 1 | 1374 | [原文](https://ru.stackoverflow.com/questions/1625425/%d0%ba%d0%be%d0%bd%d1%84%d0%bb%d0%b8%d0%ba%d1%82-%d0%b2%d0%b5%d1%80%d1%81%d0%b8%d0%b9-langchain-%d0%b4%d0%bb%d1%8f-rag-%d0%bd%d0%b0-python-3-14) |
| `json-ru-stackoverflow-copilot` | 暂停 | 通过 | 5 / 1 | 1 / 1 | 359 | [原文](https://ru.stackoverflow.com/questions/1623626/%d0%9a%d0%b0%d0%ba-%d0%bf%d0%be%d1%87%d0%b8%d0%bd%d0%b8%d1%82%d1%8c-github-copilot-%d0%b2-visual-studio-2026) |
| `rss-zh-linux-do-claude-code` | 暂停 | 失败：HTTP 403 | 0 / 0 | 0 / 0 | 0 | — |
| `rss-zh-linux-do-codex` | 暂停 | 失败：HTTP 403 | 0 / 0 | 0 / 0 | 0 | — |
| `rss-cursor-forum-showcase` | 启用 | 通过 | 25 / 8 | 8 / 8 | 1406 | [原文](https://forum.cursor.com/t/carrying-a-tasks-history-into-cursor-across-sessions-over-mcp/173432) |

## 复跑与应用

```bash
node scripts/check-sources.ts --output /tmp/vibehot-source-check.json
node scripts/check-sources.ts --enabled --output /tmp/vibehot-enabled-check.json
```

启用入口出现抓取失败、缺少内容或需付费验证时，脚本退出码为 1。现有站点先 seed 新入口，再预览并应用本轮社区调整，见 [已有站点怎样应用](sources.md#已有站点怎样应用)。本轮只执行了更新脚本的预览，没有修改线上数据库。
