# Real AI Integration

This project now supports real LLM calls via Vercel AI SDK + structured outputs.

## Setup

1. Copy `.env.example` to `.env.local`

### 云端 DeepSeek（当前配置）
DeepSeek API 与 OpenAI 完全兼容，价格低、中文能力强、结构化输出可用。

在 `.env.local` 中设置：
```env
DEEPSEEK_API_KEY=sk-你的DeepSeek密钥
```

模型默认使用 `deepseek-chat`。如需其他模型可加：
```env
LLM_MODEL=deepseek-reasoner   # 推理模型（如果需要）
```

获取密钥：https://platform.deepseek.com/api_keys

### 云端 OpenAI（备选）
```env
OPENAI_API_KEY=sk-...
```

### 本地大模型（隐私场景）
使用支持 OpenAI 兼容接口的本地工具：

**Ollama 示例**：
```env
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=qwen2.5:14b
LLM_API_KEY=ollama
```

**LM Studio 示例**：
```env
LLM_BASE_URL=http://localhost:1234/v1
LLM_MODEL=local-model
LLM_API_KEY=lm-studio
```

启动本地服务后即可使用，无需云端 API Key。

3. (Optional) 在 `src/lib/ai/client.ts` 中调整默认模型

## How it works

- Core function `analyzeCustomerTurn` in `src/lib/domain/ai-workflow.ts` is now async.
- When `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, or `LLM_BASE_URL` is present:
  - Trip details extraction → LLM structured output (Zod)
  - Event detection → LLM
  - Quote suggestion → LLM
  - Natural reply generation → LLM
- Falls back cleanly to the original rule-based logic if no key.

## Architecture (per project rules)

- Prompts / logic separated in `src/lib/ai/`
- Structured data enforced (matches existing `types.ts`)
- UI and data flow unchanged
- UI status is resolved server-side with `getAIStatus()` so API keys stay server-only

## 本地模型 vs 云端模型

**本地模型优点**（适合这个项目）：
- 客户聊天数据（联系方式、航班、地址）不上传云端，更隐私安全
- 零 API 调用费用
- 可以离线使用
- 中文模型（如 Qwen2.5、DeepSeek）在本地表现不错

**注意事项**：
- 结构化输出（JSON）稳定性不如 GPT-4o-mini，本地小模型容易格式出错
- 需要本地有较好显卡（建议 12GB+ VRAM 跑 7B~14B 模型）
- 速度取决于你的机器

**推荐组合**：
- 开发/测试：用 OpenAI（gpt-4o-mini）
- 正式部署或敏感数据：切换到本地 Ollama + 较强中文模型

## Next steps for production

- Move LLM calls to Server Actions or Route Handlers (never expose key to client)
- Add rate limiting + logging
- Support multiple providers (Grok, DeepSeek, Ollama 等)
- Add prompt versioning / AI_PROMPTS.md

Current implementation keeps full compatibility with the existing Owner Workspace demo.
