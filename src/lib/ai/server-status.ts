import "server-only";

import type { AIStatus } from "./status-types";

export function getAIStatus(): AIStatus {
  if (process.env.DEEPSEEK_API_KEY && !process.env.LLM_BASE_URL) {
    return { configured: true, providerLabel: "DeepSeek" };
  }

  if (process.env.LLM_BASE_URL) {
    return { configured: true, providerLabel: "本地/兼容模型" };
  }

  if (process.env.OPENAI_API_KEY) {
    return { configured: true, providerLabel: "OpenAI" };
  }

  if (process.env.LLM_API_KEY) {
    return { configured: true, providerLabel: "OpenAI 兼容模型" };
  }

  return { configured: false, providerLabel: "规则模拟" };
}

export function hasServerAIProvider(): boolean {
  return getAIStatus().configured;
}
