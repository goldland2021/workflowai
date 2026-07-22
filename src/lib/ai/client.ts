import "server-only";

import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { hasServerAIProvider } from './server-status';

// 支持本地模型和云端模型（OpenAI 兼容接口）
// 优先使用自定义配置，便于接入 Ollama、LM Studio、DeepSeek 等
let apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || 'ollama';
let baseURL = process.env.LLM_BASE_URL;
let modelName = process.env.LLM_MODEL || 'gpt-4o-mini';

// 自动支持云端 DeepSeek（当设置 DEEPSEEK_API_KEY 时）
if (process.env.DEEPSEEK_API_KEY && !process.env.LLM_BASE_URL) {
  apiKey = process.env.DEEPSEEK_API_KEY;
  baseURL = 'https://api.deepseek.com/v1';
  modelName = process.env.LLM_MODEL || 'deepseek-chat';
}

const openai = createOpenAI({
  apiKey,
  baseURL,
});

const usesOpenAICompatibleChat = Boolean(baseURL);

function buildModel(name: string) {
  return usesOpenAICompatibleChat ? openai.chat(name) : openai(name);
}

// Role-based models. The orchestrator benefits from a stronger model (better
// multilingual reasoning and reply quality); structured extraction can run on a
// cheaper model. Both fall back to the base LLM_MODEL when unset, so existing
// deployments are unchanged until the new vars are provided.
const orchestratorModelName = process.env.LLM_MODEL_ORCHESTRATOR || modelName;
const extractModelName = process.env.LLM_MODEL_EXTRACT || modelName;

export const model = buildModel(modelName);
export const orchestratorModel = buildModel(orchestratorModelName);
export const extractModel = buildModel(extractModelName);

type ChatModel = ReturnType<typeof buildModel>;

export const hasRealAI = hasServerAIProvider();

export async function generateStructured<Schema extends z.ZodTypeAny>(
  schema: Schema,
  prompt: string,
  system?: string,
  temperature?: number,
  modelOverride?: ChatModel,
): Promise<z.infer<Schema>> {
  if (!hasRealAI) {
    throw new Error('No LLM configured. Falling back to rule-based logic.');
  }

  const activeModel = modelOverride ?? model;
  const baseSystem = system || '你是一个精准专业的机场接送公司 AI 助手。请始终返回有效的结构化数据。所有输出使用中文。';
  const temp = temperature ?? 0.2;

  if (usesOpenAICompatibleChat) {
    const result = await generateText({
      model: activeModel,
      prompt: `${prompt}

请只返回一个可被 JSON.parse 解析的 JSON 值。不要使用 Markdown。不要添加解释。不要添加代码块。字段名必须使用英文 camelCase。`,
      system: `${baseSystem}

你的输出必须是严格 JSON，不要包含 JSON 之外的任何文字。`,
      temperature: temp,
    });

    return schema.parse(parseJsonFromText(result.text)) as z.infer<Schema>;
  }

  const result = await generateObject({
    model: activeModel,
    schema,
    prompt,
    system: baseSystem,
    temperature: temp,
  });

  return result.object as z.infer<Schema>;
}

export async function generateReply(
  prompt: string,
  system?: string,
  temperature?: number,
  modelOverride?: ChatModel,
): Promise<string> {
  if (!hasRealAI) {
    throw new Error('No LLM configured');
  }

  const activeModel = modelOverride ?? model;
  const baseSystem = system ||
    '你是一个专业的机场接送 AI 客服员工（天桥机场接送）。' +
    '你的目标是高效收集完整接送信息、捕捉联系方式、检测需老板审核的事件。' +
    '回复必须简洁（默认1句、最多2句或约35字）、专业、用中文、自然像真人客服。' +
    '一次只问一个最关键问题。绝不透露价格数字。绝不做出老板才能做的承诺。';
  const temp = temperature ?? 0.7;

  const result = await generateText({
    model: activeModel,
    prompt,
    system: baseSystem,
    temperature: temp,
  });

  return result.text.trim();
}

function parseJsonFromText(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const objectStart = cleaned.indexOf("{");
    const arrayStart = cleaned.indexOf("[");
    const starts = [objectStart, arrayStart].filter((index) => index >= 0);

    if (starts.length === 0) {
      throw new Error("LLM did not return JSON.");
    }

    const start = Math.min(...starts);
    const endToken = cleaned[start] === "{" ? "}" : "]";
    const end = cleaned.lastIndexOf(endToken);

    if (end < start) {
      throw new Error("LLM returned incomplete JSON.");
    }

    return JSON.parse(cleaned.slice(start, end + 1));
  }
}
