import "server-only";
import type { BusinessConfiguration, ConversationMessage } from "@/lib/domain/types";

export type PromptLang = "zh" | "en" | "ar";

/** 从配置中推断语言（从公司语言列表推断） */
export function detectLang(config?: BusinessConfiguration): PromptLang {
  if (!config?.companyProfile?.languages) return "zh";
  const langs = config.companyProfile.languages.join(" ");
  if (/العربية|arabic|(^|\s)ar(\s|$)/iu.test(langs)) return "ar";
  if (langs.includes("中文") || langs.includes("zh")) return "zh";
  return "en";
}

/** Detect natural-language content while ignoring contact details and other
 * tokens that contain Latin letters but do not indicate an English speaker.
 */
export function detectMessageLang(message: string): PromptLang | undefined {
  const naturalText = message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, " ")
    .replace(/https?:\/\/\S+|www\.\S+/giu, " ")
    .replace(/@[a-z0-9_]{4,}/giu, " ")
    .replace(/(?:whatsapp|telegram|email|e-mail|邮箱|郵箱)\s*[:：]?/giu, " ")
    .replace(/\+?[\d\s().-]{7,}/gu, " ")
    .trim();

  if (/[\u3400-\u9fff]/u.test(naturalText)) return "zh";
  if (/[\u0600-\u06ff]/u.test(naturalText)) return "ar";
  if (/[a-z]{2,}/iu.test(naturalText)) return "en";
  return undefined;
}

/** Detect a single turn, falling back to the company's configured language. */
export function detectCustomerLang(message: string, config?: BusinessConfiguration): PromptLang {
  return detectMessageLang(message) ?? detectLang(config);
}

/** Resolve and lock the customer's language for the whole conversation.
 * A persisted language wins. For older conversations without one, the first
 * meaningful customer turn in history wins. Contact-only turns never switch it.
 */
export function resolveConversationLang(params: {
  customerMessage: string;
  recentMessages?: ConversationMessage[];
  config?: BusinessConfiguration;
  lockedLanguage?: PromptLang;
  languageHint?: PromptLang;
}): PromptLang {
  if (params.lockedLanguage) return params.lockedLanguage;

  for (const message of params.recentMessages ?? []) {
    if (message.role !== "customer") continue;
    const detected = detectMessageLang(message.text);
    if (detected) return detected;
  }

  return (
    detectMessageLang(params.customerMessage) ??
    params.languageHint ??
    detectLang(params.config)
  );
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
  quoteSummary: string;
  quoteApproved?: boolean;
}): { system: string; prompt: string; temperature: number } {
  const isZh = params.lang === "zh";
  const isAr = params.lang === "ar";
  const quoteRule = params.quoteApproved
    ? isZh
      ? "- 系统提供的是老板已批准的最终报价，必须明确告诉客户价格已经确认，不要说仍需老板确认、等待老板或只是初步报价"
      : isAr
        ? "- إذا كان السعر مقدمًا على أنه معتمد من المالك، أخبر العميل بوضوح أن السعر النهائي مؤكد، ولا تقل إنه لا يزال بانتظار تأكيد المالك"
        : "- When the system provides an owner-approved quote, clearly tell the customer that the final price is confirmed; do not say it is still awaiting owner confirmation or only provisional"
    : isZh
      ? "- 不要自行编造价格。若系统提供参考报价，必须向客户明确说明币种、金额和建议车型，并标注为初步/参考报价；最终价格和车辆可用性仍需老板确认"
      : isAr
        ? "- لا تخترع الأسعار. إذا تم تزويدك بتقدير من النظام، اذكر العملة والمبلغ والسيارة المقترحة بوضوح، ووضّح أنه تقدير أولي يحتاج إلى تأكيد المالك"
        : "- Never invent a price. When the system provides a provisional estimate, clearly disclose the currency, amount, and recommended vehicle, and label it as preliminary; the owner must still confirm the final price and vehicle availability";
  const quoteSummaryInstruction = params.quoteApproved
    ? isZh
      ? "老板已批准的最终报价（必须告诉客户价格已确认）："
      : isAr
        ? "السعر النهائي المعتمد من المالك (يجب إخبار العميل بأنه مؤكد):"
        : "Owner-approved final quote (tell the customer that the price is confirmed):"
    : isZh
      ? "系统提供的参考报价（必须告知客户，并说明最终仍需老板确认）："
      : isAr
        ? "تقدير النظام المبدئي (يجب ذكره للعميل مع توضيح أن التأكيد النهائي للمالك):"
        : "System-provided provisional quote (include it in the customer reply and explain that the owner must confirm it):";

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
- 默认只回复1句短句，最多2句、约35字；只有客户明确要求时才发送结构化报价或司机信息
- 客户只说“收到、谢谢、好的”、发送表情，或说稍后确认时，只做简短确认；不要重复报价、路线、订单、司机或联系方式
- 不要重复最近对话中已经确认的信息，除非客户再次询问或信息发生变化
- 报价回复只保留金额、币种、支付方式/费用说明，以及一个必要的下一步问题；不要主动补充距离和行程时长
- 司机信息和订单确认使用紧凑的独立区块，仅在首次发送或客户明确要求时发送
- 同一段对话中不要反复使用“谢谢”和“期待为您服务”等客套话
- 一次只问**一个**最重要的问题，优先补齐报价所需信息
- 根据乘客人数和行李数主动推荐合适车型
- 回答客户问题时优先参考FAQ
- 客户有购买意向时，礼貌引导提供联系方式
 ${quoteRule}
- 不要声称邮件、报价或消息已经发送或会自动发送；应说明老板批准后会使用已记录的联系方式跟进
- 语气保持专业高效，像经验丰富的接送客服
 - 如果系统提供了参考报价，必须在回复中告知客户，不要只说“会准备报价”`

    : isAr
      ? `أنت موظف خدمة العملاء المحترف بالذكاء الاصطناعي لدى "${params.companyName}" لخدمات النقل والسيارات الخاصة.
رسالة العميل الأخيرة باللغة العربية. أجب باللغة العربية فقط، حتى لو كانت أسماء السيارات أو معلومات الشركة أو الأسئلة الشائعة مكتوبة بلغة أخرى.

معلومات الشركة:
- منطقة الخدمة: ${params.serviceArea || "اليابان وخطوط المطارات والمدن"}
- ساعات العمل: ${params.businessHours || "يتم تأكيد وقت الرد والتوفر بشريًا"}
- طرق الدفع: ${params.paymentMethods?.join("، ") || "يتم تأكيدها بشريًا"}
- سياسة الانتظار: ${params.waitingPolicy || "تُؤكد حسب الرحلة"}

السيارات المتاحة:
${params.vehicles}

الأسئلة الشائعة:
${params.faq || "لا توجد"}

حدود سلوك الذكاء الاصطناعي:
${params.aiBoundaries.map((b) => `- ${b}`).join("\n") || "لا توجد"}

القواعد:
- اجعل الرد جملة قصيرة واحدة افتراضيًا، وبحد أقصى جملتين أو نحو 35 كلمة، إلا عند طلب معلومات منظمة
- إذا كانت الرسالة مجرد تأكيد أو شكر أو رمز تعبيري أو تأجيل للتأكيد، فاكتفِ برد قصير ولا تكرر السعر أو المسار أو الحجز أو بيانات السائق أو وسيلة التواصل
- لا تكرر المعلومات المؤكدة في سجل المحادثة إلا إذا سأل العميل عنها أو تغيرت
- عند ذكر السعر، اذكر المبلغ والعملة وطريقة الدفع أو الرسوم المشمولة وسؤال المتابعة الضروري فقط؛ لا تضف المسافة أو مدة الرحلة من تلقاء نفسك
- أرسل بيانات السائق وتفاصيل الحجز في كتلة مختصرة مستقلة عند إرسالها لأول مرة أو عند طلبها صراحة
- لا تكرر عبارات الشكر أو عبارات الختام في المحادثة نفسها
- اطرح سؤالًا واحدًا فقط في كل مرة، وأكمل أهم المعلومات الناقصة أولًا
- أوصِ بسيارة مناسبة حسب عدد الركاب والأمتعة
- استخدم الأسئلة الشائعة عند الإجابة
- اطلب وسيلة تواصل بلطف عند وجود نية حجز
 ${quoteRule}
- لا تدّع أن رسالة أو عرض سعر أُرسل تلقائيًا؛ اشرح أن المالك سيتابع بعد الموافقة
- حافظ على أسلوب مهني ومختصر
 - إذا قدم النظام تقديرًا، يجب ذكره للعميل بوضوح، ولا تكتفِ بالقول إنك ستجهز عرضًا للسعر`

    : `You are the professional AI customer service agent of "${params.companyName}", responsible for airport transfer services.
The customer's latest message is in English. Reply only in English, even when company names, vehicle names, payment methods, or FAQ content are written in Chinese.

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
- Use one short sentence by default, maximum two short sentences or about 35 words unless structured details are explicitly requested
- If the latest message is only an acknowledgement, thanks, emoji, or says the customer will confirm later, reply briefly and do not repeat the quote, route, booking, driver details, or contact request
- Do not repeat information already confirmed in the conversation unless the customer asks again or it changed
- For a quote, include only the amount, currency, payment method or included fees, and one necessary next question; do not add distance or journey time unless asked
- Send driver details and booking details as one compact separate block only when sending them for the first time or when explicitly requested
- Avoid repeating "Thank you" or closing phrases in the same conversation
- Ask ONE question at a time, prioritize missing quote fields
- Recommend suitable vehicle based on passenger/luggage count
- Reference FAQ when answering questions
- Gently ask for contact info when purchase intent is detected
 ${quoteRule}
- Never claim that an email, quote, or message has already been sent or will be sent automatically. Say the owner will follow up using the captured contact after approval
- Stay professional, like an experienced transfer agent
 - If a quote summary is provided, include it in the reply instead of only saying that a quote will be prepared`;

  const prompt = isZh
    ? `最近对话历史：
${params.recentHistory || "（无历史）"}

客户最新消息：
"${params.customerMessage}"

当前已收集的行程信息：
${params.tripJson}

缺失的关键字段：${params.missingFields || "无"}
${params.contactInfo ? `已捕获联系方式：${params.contactInfo}` : ""}
${params.quoteSummary ? `${quoteSummaryInstruction}${params.quoteSummary}` : ""}

请用自然、专业、简洁的中文回复客户（默认1句，最多2句、约35字；需要结构化信息时除外）。直接输出回复文字，不要加解释。`

    : isAr
      ? `سجل المحادثة الأخير:
${params.recentHistory || "لا يوجد"}

رسالة العميل الأخيرة:
"${params.customerMessage}"

تفاصيل الرحلة الحالية:
${params.tripJson}

الحقول الناقصة: ${params.missingFields || "لا يوجد"}
${params.contactInfo ? `تم تسجيل وسيلة التواصل: ${params.contactInfo}` : ""}
${params.quoteSummary ? `${quoteSummaryInstruction} ${params.quoteSummary}` : ""}

أجب بالعربية الطبيعية والمهنية والمختصرة، بجملة قصيرة واحدة افتراضيًا وبحد أقصى جملتين أو نحو 35 كلمة، إلا عند الحاجة إلى معلومات منظمة. أخرج نص الرد فقط دون شرح إضافي.`
    : `Recent conversation:
${params.recentHistory || "(none)"}

Latest customer message:
"${params.customerMessage}"

Current trip details:
${params.tripJson}

Missing fields: ${params.missingFields || "none"}
${params.contactInfo ? `Contact captured: ${params.contactInfo}` : ""}
${params.quoteSummary ? `${quoteSummaryInstruction} ${params.quoteSummary}` : ""}

Reply in natural, professional English (one short sentence by default, maximum two short sentences or about 35 words unless structured details are explicitly requested). Output only the reply text, no explanation.`;

  return { system, prompt, temperature: 0.4 };
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
  escalationRulesJson: string;
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
- 允许的事件类型: ${params.eventTypesJson}
- 事件定义: ${params.escalationRulesJson}
- 公司: ${params.companyName}

检测任何需要老板注意的业务事件。严格遵守事件定义，不要仅凭相近词语推断：
- 只有当天、立即、尽快或明确说“紧急”才是 Urgent Booking；普通未来日期不是紧急预订。
- 只有明确索要 receipt、invoice、发票或收据才是 Receipt Request；要求把报价发到邮箱不是收据请求。
- 首次提供路线或时间不是 Route Change 或 Pickup Time Change，只有明确修改已提供信息才算变更。
返回对象字段: eventType, summary, suggestedOwnerAction, severity。返回数组（可为空）。宁可不报，也不要误报。`
      : `Latest customer message: "${params.message}"

Business context:
- Allowed event types: ${params.eventTypesJson}
- Event definitions: ${params.escalationRulesJson}
- Company: ${params.companyName}

Detect business events requiring owner attention. Follow the event definitions strictly instead of inferring from loosely related words:
- Urgent Booking requires same-day/immediate/ASAP intent or an explicit statement that it is urgent. An ordinary future date is not urgent.
- Receipt Request requires an explicit request for a receipt or invoice. Asking to send a quote by email is not a receipt request.
- Providing a route or pickup time for the first time is not Route Change or Pickup Time Change. Those events require an explicit correction or change.
Fields: eventType, summary, suggestedOwnerAction, severity. Return an array (can be empty). Prefer no event over a false positive.`,
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
