
【编程、Vibe Coding 和 AI 领域用语规则】

读者是程序员。用国内开发者自然使用的词，避免逐词直译的英语隐喻和名词堆叠。deploy gate 写“发布门禁”，blast radius 写“影响范围”，pre-flight checks 写“部署前检查”，checkout 在电商语境指“结账”，在 Git 语境保留 git checkout。合并 PR、上线、回滚、灰度发布都是普通工程表达。Skill、Hook 若指工具内的命名功能，保留 Skill、Hook；泛指能力或钩子时按语境译。Prompt 不等于系统提示词，不擅自添加“系统”“精心设计”等限定。作者的经验和观点仍要归因给作者，不升级成普遍结论。

1. 以下词结合编程和 AI 上下文消除歧义，不把每个多义词都强行套成模型术语：
   - LLM = 大语言模型（绝不译"法学硕士"/"Master of Laws"）
   - Token / tokens：模型用量语境保留 token；认证语境的 access token 可以写“访问令牌”，不要混为模型用量
   - Transformer = Transformer 架构（保留英文；不译"变压器"）
   - Diffusion = 扩散模型（AI 生成，不是物理扩散）
   - Agent / Agentic：AI 辅助开发语境写 AI 智能体 / 智能体的；网络代理、user-agent 和构建代理按各自工程含义处理
   - Alignment = 对齐（AI 安全语境）
   - Inference = 推理（模型生成）
   - Reasoning = 推理（注意：与 inference 都译"推理"，必要时用"链式推理"区分 CoT；reasoning model 指 o1/o3/R1 这类思考型模型）
   - Embedding = 嵌入向量（也可保留英文）
   - Distillation = 知识蒸馏
   - Hallucination = 模型幻觉
   - Fine-tune / Fine-tuning = 微调
   - Pretrain / Pretraining = 预训练
   - Context window = 上下文窗口
   - Prompt = 提示词
   - Skill / Skills：Claude 等工具中的命名能力包保留 Skill / Skills；泛指人的能力时才译“技能”

2. 以下专有名词**一律保留英文原文**，不翻译不加中文括注：
   - AI 公司：OpenAI / Anthropic / Google DeepMind / xAI / Meta AI / Mistral / DeepSeek / Cohere / HuggingFace（HF）/ Runway / ElevenLabs / Suno / Pika / Midjourney / Perplexity
   - 模型族（举例 + 通用规则）：GPT / Claude / Gemini / Llama / Qwen / Grok / o 系列 / DeepSeek / Mistral / Mixtral / Phi / Sora / Veo / Imagen
     **规则**：任何大模型族名、产品代号一律保留英文
   - 模型版本号（举例 + 通用规则）：GPT-5 / Claude 4.7 / Claude Sonnet 4.6 / Llama 4 / Gemini 3 / o3 / o4 / DeepSeek-V4 / Qwen3.7
     **规则**：版本号一字不改（包括字母数字后缀如 4o / 4.7 / 405B / V4 / R1），绝不"翻译性扩写"（不要把 "405B" 译成 "4050 亿"，不要把 "V4" 译成 "第 4 代"）
   - 技术缩写（举例 + 通用规则）：LLM / RAG / RLHF / DPO / LoRA / QLoRA / PEFT / MoE / CoT / ReAct / KV cache / SOTA / AGI / MCP / ADK / NPU / GPU / TPU
     **规则**：任何 2-5 字母的全大写缩写，默认按 AI/ML 含义保留英文
   - 评测基准（举例 + 通用规则）：MMLU / GPQA / HumanEval / SWE-bench / SWE-bench Verified / AIME / HLE / ARC-AGI / ARC-AGI 2 / MT-Bench / Chatbot Arena / Aider Polyglot / LiveCodeBench
     **规则**：以 -bench / -eval 结尾或全大写的评测名一律保留英文
   - AI 工具/产品：Cursor / Copilot / Codex / Aider / Devin / Cline / Claude Code / Windsurf / Zed / v0 / Bolt / Lovable / Replit Agent
   - Agent 框架：LangChain / LangGraph / LlamaIndex / CrewAI / AutoGen / Pydantic AI / Vercel AI SDK / DSPy
   - 推理/部署：Ollama / vLLM / SGLang / TensorRT / Triton / CUDA / ROCm
   - 通用技术：API / SDK / CLI / IDE / SaaS / CDN / SSO / OAuth / JWT / WebSocket / SSE / gRPC

3. 中国厂商**优先用官方中文品牌名**（首次出现可双标"千问（Qwen3）"，后续选一种保持一致）：
   - 千问（Qwen）/ 文心一言 / 智谱（GLM）/ 月之暗面（Kimi）/ 深度求索（DeepSeek）/ 阶跃星辰（Step）/ 零一万物（Yi）/ 百川 / 豆包（字节）/ 混元（腾讯）/ 可灵（Kling，快手）/ 即梦（Jimeng，字节）/ MiniMax（不译）/ 美团 LongCat / 昆仑万维 Skywork / 面壁 MiniCPM / 华为昇腾 / 寒武纪

4. 代码 / 命令 / URL / 数字单位 **一字不改**保留：
   - 反引号代码 `code` 不翻译
   - 命令如 /code-review、pip install、npm run 不译（不要译"代码审查"）
   - URL 原样
   - 数字+单位：8k context / 175B params / 3.5x speedup / $3 per M tokens / 99.9%
   - 金额、参数量、比例、区间必须保留原文的阿拉伯数字和单位；不要把 $10B-$100B 改写成“数百亿至数千亿美元”等中文数量词
