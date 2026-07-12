import "server-only";
import type { BusinessConfiguration } from "@/lib/domain/types";

export type PromptLang = "zh" | "en";

/** 从配置中推断语言（从公司语言列表推断） */
export function detectLang(config?: BusinessConfiguration): PromptLang {
  if (!config?.companyProfile?.languages) return "zh";
  const langs = config.companyProfile.languages.join(" ");
  if (langs.includes("中文") || langs.includes("zh")) return "zh";
  return "en";
}

// ─── 客服回复模板 ───

export function buildReplyPrompt(params: {
  lang: PromptLang;
  companyName: string;
  serviceArea?: string;
  businessHours?: string;
  paymentMethods?: string[];
  waitingPolicy?: string;
  aiBoundaries: string[];
  vehicles: string;
  faq: string;
  recentHistory: string;
  customerMessage: string;
  tripJson: string;
  missingFields: string;
  contactInfo: string;
  hasQuote: boolean;
}): { system: string; prompt: string; temperature: number } {
  const isZh = params.lang === "zh";

  const system = isZh
    ? `你是"${params.companyName}"的专业AI客服员工，负责机场接送服务。
公司信息：
- 服务区域：${params.serviceArea || "市中心及机场路线"}
- 工作时间：${params.businessHours || "每日06:00-23:30"}
- 支付方式：${params.paymentMethods?.join("、") || "现金、转账、刷卡"}
- 等待政策：${params.waitingPolicy || "航班降落后标准等待60分钟"}

可用车型（必须根据乘客数和行李数推荐）：
${params.vehicles}

公司知识库（FAQ）：
${params.faq || "（暂无）"}

AI行为边界（必须严格遵守）：
${params.aiBoundaries.map((b) => `- ${b}`).join("\n") || "（无）"}

回复要求：
- 一次只问**一个**最重要的问题，优先补齐报价所需信息
- 根据乘客人数和行李数主动推荐合适车型
- 回答客户问题时优先参考FAQ
- 客户有购买意向时，礼貌引导提供联系方式
- 绝不透露具体报价数字
- 语气保持专业高效，像经验丰富的接送客服
- 如果信息已经足够，告诉客户你会为老板准备报价建议`

    : `You are the professional AI customer service agent of "${params.companyName}", responsible for airport transfer services.

Company info:
- Service area: ${params.serviceArea || "City center and airport routes"}
- Business hours: ${params.businessHours || "Daily 06:00-23:30"}
- Payment methods: ${params.paymentMethods?.join(", ") || "Cash, Bank transfer, Card"}
- Waiting policy: ${params.waitingPolicy || "60 min standard waiting after flight landing"}

Available vehicles (recommend based on passengers & luggage):
${params.vehicles}

FAQ:
${params.faq || "(none)"}

AI boundaries (strict):
${params.aiBoundaries.map((b) => `- ${b}`).join("\n") || "(none)"}

Rules:
- Ask ONE question at a time, prioritize missing quote fields
- Recommend suitable vehicle based on passenger/luggage count
- Reference FAQ when answering questions
- Gently ask for contact info when purchase intent is detected
- Never disclose specific price numbers
- Stay professional, like an experienced transfer agent
- If enough info, tell customer you'll prepare a quote for the owner`;

  const prompt = isZh
    ? `最近对话历史：
${params.recentHistory || "（无历史）"}

客户最新消息：
"${params.customerMessage}"

当前已收集的行程信息：
${params.tripJson}

缺失的关键字段：${params.missingFields || "无"}
${params.contactInfo ? `已捕获联系方式：${params.contactInfo}` : ""}
${params.hasQuote ? "已为老板准备了报价建议（不要向客户透露具体价格数字）" : ""}

请用自然、专业、简洁的中文回复客户（1-4句话）。直接输出回复文字，不要加解释。`
    : `Recent conversation:
${params.recentHistory || "(none)"}

Latest customer message:
"${params.customerMessage}"

Current trip details:
${params.tripJson}

Missing fields: ${params.missingFields || "none"}
${params.contactInfo ? `Contact captured: ${params.contactInfo}` : ""}
${params.hasQuote ? "Quote suggestion ready for owner (don't disclose numbers to customer)" : ""}

Reply in natural, professional English (1-4 sentences). Output only the reply text, no explanation.`;

  return { system, prompt, temperature: 0.7 };
}

// ─── 行程提取模板 ───

export function buildExtractTripPrompt(params: {
  lang: PromptLang;
  message: string;
  currentTripJson: string;
  servicesJson: string;
  vehiclesJson: string;
}): { system: string; prompt: string; temperature: number } {
  const isZh = params.lang === "zh";

  return {
    system: isZh ? "你是提取机场接送预订结构化细节的专家。请保守且准确。" : "You are an expert at extracting structured airport transfer booking details. Be conservative and accurate.",
    prompt: isZh
      ? `客户消息: "${params.message}"

当前已知行程信息:
${params.currentTripJson}

可用服务: ${params.servicesJson}

可用车型:
${params.vehiclesJson}

从最新客户消息中提取并更新任何新信息或更正的行程细节。只包含明确提到或可以自信推断的字段。返回部分数据，不要编造值。`
      : `Customer message: "${params.message}"

Current trip details:
${params.currentTripJson}

Available services: ${params.servicesJson}

Available vehicles:
${params.vehiclesJson}

Extract and update any new trip details from the customer message. Only include fields explicitly mentioned or confidently inferred. Return partial data, don\'t fabricate values.`,
    temperature: 0.1,
  };
}

// ─── 事件检测模板 ───

export function buildDetectEventPrompt(params: {
  lang: PromptLang;
  message: string;
  eventTypesJson: string;
  companyName: string;
}): { system: string; prompt: string; temperature: number } {
  const isZh = params.lang === "zh";

  return {
    system: isZh
      ? "仅识别符合允许类型的清晰业务事件。提供可操作的建议。"
      : "Only identify clear business events matching allowed types. Provide actionable owner suggestions.",
    prompt: isZh
      ? `最新客户消息: "${params.message}"

业务背景:
- 升级规则: ${params.eventTypesJson}
- 公司: ${params.companyName}

检测任何需要老板注意的业务事件。返回对象字段: eventType, summary, suggestedOwnerAction, severity。返回数组（可为空）。请精确。`
      : `Latest customer message: "${params.message}"

Business context:
- Escalation rules: ${params.eventTypesJson}
- Company: ${params.companyName}

Detect any business events requiring owner attention. Fields: eventType, summary, suggestedOwnerAction, severity. Return an array (can be empty). Be precise.`,
    temperature: 0.2,
  };
}

// ─── 联系方式提取模板 ───

export function buildContactPrompt(params: {
  message: string;
}): { system: string; prompt: string; temperature: number } {
  return {
    system: "Extract contact information from customer messages accurately.",
    prompt: `Message: "${params.message}"

Extract any contact method and value the customer wants to be reached at (WhatsApp, Telegram, or Email).
Return object fields: method, value.
Return null if none is provided.`,
    temperature: 0.3,
  };
}

// ─── 报价建议模板 ───

export function buildQuotePrompt(params: {
  lang: PromptLang;
  tripDetailsJson: string;
  pricingRulesJson: string;
  vehiclesInfo: string;
}): { system: string; prompt: string; temperature: number } {
  const isZh = params.lang === "zh";

  return {
    system: isZh ? "你是机场接送定价专家。根据行程和定价规则生成合理报价。" : "You are an airport transfer pricing expert. Generate reasonable quotes based on trip details and pricing rules.",
    prompt: isZh
      ? `行程细节: ${params.tripDetailsJson}

可用定价规则:
${params.pricingRulesJson}

可用车型:
${params.vehiclesInfo}

根据乘客数和行李数推荐最合适的车型。建议一个报价。尽可能使用规则。保持现实。返回字段: suggestedPrice, currency, vehicleType, reason, confidence, missingFields。`
      : `Trip details: ${params.tripDetailsJson}

Available pricing rules:
${params.pricingRulesJson}

Available vehicles:
${params.vehiclesInfo}

Recommend the most suitable vehicle based on passenger/luggage count. Suggest a quote. Use rules when possible. Be realistic. Fields: suggestedPrice, currency, vehicleType, reason, confidence, missingFields.`,
    temperature: 0.3,
  };
}
