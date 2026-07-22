import { generateReply } from './client';
import { buildReplyPrompt, resolveConversationLang, type PromptLang } from './prompts/templates';
import type { 
  TripDetails, DetectedEvent, CapturedContact, QuoteSuggestion, TripFieldKey,
  BusinessConfiguration, ConversationMessage
} from '../domain/types';

export function replyLanguageMatches(text: string, lang: PromptLang): boolean {
  const cjkCount = text.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
  const arabicCount = text.match(/[\u0600-\u06ff]/gu)?.length ?? 0;
  const latinCount = text.match(/[a-z]/giu)?.length ?? 0;
  if (lang === "zh") return cjkCount > 0;
  if (lang === "ar") return arabicCount > 0;
  return latinCount >= cjkCount && latinCount >= arabicCount;
}

export function formatCustomerQuoteNotice(
  lang: PromptLang,
  quote: QuoteSuggestion,
  options: { approved?: boolean; autoApproved?: boolean } = {},
): string {
  const amount = `${quote.currency} ${quote.suggestedPrice.toLocaleString("en-US")}`;
  const vehicle = quote.vehicleType
    ? options.approved || options.autoApproved ? `，安排车型为${quote.vehicleType}` : `，建议车型为${quote.vehicleType}`
    : "";

  if (lang === "ar") {
    if (options.approved) {
      return `تم تأكيد السعر النهائي من المالك لهذه الرحلة: ${amount}${quote.vehicleType ? ` مع ${quote.vehicleType}` : ""}.`;
    }
    if (options.autoApproved) {
      return `السعر القياسي لهذه الرحلة هو ${amount}${quote.vehicleType ? ` مع ${quote.vehicleType}` : ""}. سيتم تأكيد توفر السيارة عند ترتيب الحجز.`;
    }
    return `التقدير الأولي للرحلة هو ${amount}${quote.vehicleType ? ` مع ${quote.vehicleType}` : ""}. هذا سعر مبدئي يحتاج إلى تأكيد المالك، وسيتم تأكيد السعر النهائي وتوفر السيارة بعد المراجعة.`;
  }

  if (lang === "en") {
    if (options.approved) {
      return `The owner has confirmed the final quote for this trip: ${amount}${quote.vehicleType ? ` with a ${quote.vehicleType}` : ""}.`;
    }
    if (options.autoApproved) {
      return `The standard rate for this trip is ${amount}${quote.vehicleType ? ` with a ${quote.vehicleType}` : ""}. Vehicle availability will be confirmed when the booking is arranged.`;
    }
    return `The provisional estimate for this trip is ${amount}${quote.vehicleType ? ` with a ${quote.vehicleType}` : ""}. This is a preliminary quote for owner confirmation; the final price and vehicle availability still need to be confirmed.`;
  }

  if (options.approved) {
    return `老板已确认本次行程的最终报价为 ${amount}${vehicle}。`;
  }
  if (options.autoApproved) {
    return `本路线的标准报价为 ${amount}${vehicle}。车辆可用性将在安排预订时确认。`;
  }
  return `根据目前的行程信息，参考报价为 ${amount}${vehicle}。这是提交老板确认的初步报价，最终价格和车辆安排需以确认结果为准。`;
}

function quoteAmountAppears(text: string, quote: QuoteSuggestion): boolean {
  const normalizedText = text.replace(/[\s,]/g, "");
  const normalizedAmount = String(quote.suggestedPrice).replace(/[\s,]/g, "");
  return normalizedText.includes(normalizedAmount);
}

export function asksForKnownTripField(text: string, tripDetails: TripDetails): boolean {
  if (!/[?？]/u.test(text) && !/\b(?:could you|please provide|what is|where is|how many)\b/iu.test(text)) {
    return false;
  }

  const knownFieldPatterns: Array<[keyof TripDetails, RegExp]> = [
    ["pickupLocation", /\b(?:pickup|pick-up|pick up|starting point)\b|\u4e0a\u8f66\u5730\u70b9|\u63a5\u8f66\u5730\u70b9/iu],
    ["dropoffLocation", /\b(?:drop-?off|destination|hotel|address)\b|\u4e0b\u8f66\u5730\u70b9|\u9001\u8fbe\u5730\u70b9|\u9152\u5e97|\u5730\u5740/iu],
    ["passengerCount", /\b(?:passenger|people|pax|persons?)\b|\u4e58\u5ba2|\u4eba\u6570/iu],
    ["luggageCount", /\b(?:luggage|bags?|suitcases?)\b|\u884c\u674e|\u7bb1\u5b50/iu],
    ["date", /\b(?:date|day|when)\b|\u65e5\u671f|\u51e0\u6708|\u54ea\u5929/iu],
    ["time", /\b(?:pickup\s+time|pick-?up\s+time|what time)\b|\u4e0a\u8f66\u65f6\u95f4|\u63a5\u8f66\u65f6\u95f4/iu],
  ];

  return knownFieldPatterns.some(([field, pattern]) => Boolean(tripDetails[field]) && pattern.test(text));
}

function fallbackReply(params: {
  customerMessage: string;
  lang: PromptLang;
  contact?: CapturedContact;
  detectedEvents: DetectedEvent[];
  quote?: QuoteSuggestion;
  quoteApproved: boolean;
  quoteAutoApproved: boolean;
  missingFields: TripFieldKey[];
  missingBookingFields: TripFieldKey[];
}): string {
  const { customerMessage, lang, contact, detectedEvents, quote, quoteApproved, quoteAutoApproved, missingFields, missingBookingFields } = params;
  const eventTypes = new Set(detectedEvents.map((event) => event.eventType));
  const nextBookingField = missingBookingFields[0];
  const paymentTerms = /\b(?:pay|payment|paid|paypal|visa|credit card|cash)\b|付款|支付|刷卡|现金|現金/iu;
  const paymentIntent = /[?？]/u.test(customerMessage)
    ? paymentTerms.test(customerMessage)
    : /\b(?:paypal|visa|credit card)\b|\b(?:i\s+have\s+paid|payment\s+has\s+been\s+completed)\b|已付款|已支付/iu.test(customerMessage);
  const confirmationIntent = /\b(?:confirm(?: the)? booking|confirm(?: the)? reservation|book it|reserve it|make the booking|schedule both|go ahead|yes,?\s*(?:please\s*)?(?:confirm|book|reserve))\b|(?:确认|確認|预订|預訂|安排预订|安排預訂)/iu.test(customerMessage);

  if (eventTypes.has("Payment Coordination") && paymentIntent) {
    if (lang === "zh") return "通常在服务完成后现金支付给司机；如需 PayPal，请告诉我。";
    if (lang === "ar") return "عادةً يتم الدفع نقدًا للسائق بعد انتهاء الرحلة. يمكن ترتيب PayPal بشكل منفصل.";
    return "Payment is normally made in cash to the driver after the transfer. PayPal can be arranged separately.";
  }
  if (eventTypes.has("Driver Assignment Needed")) {
    return lang === "zh"
      ? "我会在司机确认后发送司机姓名、车辆和联系方式。"
      : lang === "ar"
        ? "سأرسل اسم السائق والسيارة وبيانات الاتصال بعد تأكيدها."
        : "I will send the driver's name, vehicle and contact details once they are confirmed.";
  }
  if (eventTypes.has("Early Pickup Request") || eventTypes.has("Pickup Time Change")) {
    return lang === "zh"
      ? "我先和司机确认新的接送时间，确认后马上回复您。"
      : lang === "ar"
        ? "سأتحقق من وقت الاستلام الجديد مع السائق وأرد عليك بعد التأكيد."
        : "I will check the new pickup time with the driver and reply once it is confirmed.";
  }
  if (eventTypes.has("Round Trip Discount") || eventTypes.has("Multi-leg Itinerary Request")) {
    return lang === "zh"
      ? "我会把去程和回程分别记录，并确认车辆和价格安排。"
      : lang === "ar"
        ? "سأسجل رحلتي الذهاب والعودة بشكل منفصل وأتحقق من السيارة والسعر."
        : "I will record the outbound and return legs separately and check the vehicle and pricing arrangements.";
  }
  if (eventTypes.has("Discount Request")) {
    const quoteText = quote ? `${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved, autoApproved: quoteAutoApproved })} ` : "";
    return lang === "zh"
      ? `${quoteText}我会为您申请特别现金价格，确认后回复您。`
      : `${quoteText}I will check whether a special cash rate is available and get back to you.`;
  }
  if (confirmationIntent) {
    if (nextBookingField) {
      const label = lang === "zh" ? fieldLabelZh(nextBookingField) : nextBookingField.replace(/([A-Z])/g, " $1").toLowerCase();
      return lang === "zh"
        ? `我已记下您的预订意向。请提供${label}，我就可以继续安排。`
        : `I have noted your booking request. Please provide the ${label} so I can continue.`;
    }
    if (quote) return `${lang === "zh" ? "我已记下您的预订请求。" : "I have noted your booking request. "}${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved, autoApproved: quoteAutoApproved })}`;
    return lang === "zh" ? "我已记下您的预订请求，会继续为您安排。" : "I have noted your booking request and will continue arranging it.";
  }

  if (lang === 'ar') {
    if (contact && quote) return `شكرًا، تم تسجيل ${contact.method}. ${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved, autoApproved: quoteAutoApproved })}`;
    if (contact) return `شكرًا، تم تسجيل ${contact.method}. سأجهز اقتراح الرحلة للمالك.`;
    if (quote && nextBookingField) return `${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved, autoApproved: quoteAutoApproved })} يرجى تزويدي بتفاصيل ${nextBookingField}.`;
    if (quote) return `${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved, autoApproved: quoteAutoApproved })} ما أفضل رقم واتساب أو بريد إلكتروني للمتابعة؟`;
    if (missingFields.length > 0) return `شكرًا. يرجى تزويدي بتفاصيل ${missingFields[0]}.`;
    return `شكرًا لمعلوماتك. سنتابع الخطوة التالية معك.`;
  }
  if (lang === 'en') {
    if (contact && quote) return `Thanks, I have saved your ${contact.method}. ${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved, autoApproved: quoteAutoApproved })}`;
    if (contact) return `Thanks, I have saved your ${contact.method}. I will prepare the quote suggestion for the owner.`;
    if (quote && nextBookingField) return `${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved, autoApproved: quoteAutoApproved })} Please provide the ${nextBookingField.replace(/([A-Z])/g, " $1").toLowerCase()}.`;
    if (quote) return `${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved, autoApproved: quoteAutoApproved })} What is the best WhatsApp, Telegram, or email for updates?`;
    if (missingFields.length > 0) return `Thanks. Please provide the ${missingFields[0]} details.`;
    return `Thank you. I will prepare the next step for the owner.`;
  }
  if (contact && quote) return `谢谢，已记录您的${contact.method}联系方式。${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved, autoApproved: quoteAutoApproved })}`;
  if (contact) return `已记录您的${contact.method}，我会为老板准备报价建议。`;
  if (quote && nextBookingField) return `${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved, autoApproved: quoteAutoApproved })} 请提供${fieldLabelZh(nextBookingField)}。`;
  if (quote) return `${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved, autoApproved: quoteAutoApproved })} 方便提供 WhatsApp、Telegram 或邮箱接收更新吗？`;
  if (missingFields.length > 0) return `好的，请提供${missingFields[0]}相关信息。`;
  return `谢谢您的信息，我们会继续跟进。`;
}

export async function generateAiReplyWithAI(params: {
  customerMessage: string;
  tripDetails: TripDetails;
  contact?: CapturedContact;
  detectedEvents: DetectedEvent[];
  missingFields: TripFieldKey[];
  quote?: QuoteSuggestion;
  quoteApproved: boolean;
  quoteAutoApproved: boolean;
  missingBookingFields: TripFieldKey[];
  configuration?: BusinessConfiguration;
  recentMessages?: ConversationMessage[];
  customerLanguage?: PromptLang;
}): Promise<string> {
  const {
    customerMessage, tripDetails, contact, missingFields, quote, quoteApproved, quoteAutoApproved, missingBookingFields,
    configuration, recentMessages, customerLanguage
  } = params;

  const company = configuration?.companyProfile;
  const lang = resolveConversationLang({
    customerMessage,
    recentMessages,
    config: configuration,
    lockedLanguage: customerLanguage,
  });

  const keyPolicies = configuration ? {
    businessHours: configuration.businessHours,
    paymentMethods: company?.paymentMethods,
    waitingPolicy: configuration.faq.find(f => f.id.includes('waiting'))?.answer,
    aiBoundaries: configuration.aiBehaviorBoundaries,
  } : {};

  const vehicles = configuration?.vehicles || [];
  const vehiclesText = vehicles.length > 0
    ? vehicles.map(v => `- ${v.name}：最多容纳${v.capacity.passengers} 人，${v.capacity.luggage} 件行李。${v.description || ''}`).join('\n')
    : '- 丰田阿尔法\n- 丰田海狮';

  // 扩大上下文：从 slice(-6) 改为 slice(-10)
  const recentHistory = (recentMessages || [])
    .slice(-10)
    .map(m => `${m.role === 'customer' ? (lang === 'zh' ? '客户' : lang === 'ar' ? 'العميل' : 'Customer') : 'AI'}: ${m.text}`)
    .join('\n');

  const faqText = (configuration?.faq || []).map(f =>
    `- ${f.question}\n  答案：${f.answer}`
  ).join('\n') || (lang === 'zh' ? '（暂无）' : '(none)');

  const { system, prompt, temperature } = buildReplyPrompt({
    lang,
    companyName: company?.name || '机场接送公司',
    serviceArea: company?.serviceArea,
    businessHours: keyPolicies.businessHours,
    paymentMethods: keyPolicies.paymentMethods,
    waitingPolicy: keyPolicies.waitingPolicy,
    aiBoundaries: keyPolicies.aiBoundaries || [],
    vehicles: vehiclesText,
    faq: faqText,
    recentHistory: recentHistory || (lang === 'zh' ? '（无历史）' : '(none)'),
    customerMessage,
    tripJson: JSON.stringify(tripDetails, null, 2),
    missingFields: missingFields.join(', ') || (lang === 'zh' ? '无' : 'none'),
    bookingMissingFields: missingBookingFields.join(', ') || (lang === 'zh' ? '无' : 'none'),
    contactInfo: contact ? `${contact.method} [redacted]` : '',
    quoteSummary: quote
      ? `${quote.currency} ${quote.suggestedPrice.toLocaleString("en-US")}${quote.vehicleType ? `, ${quoteApproved || quoteAutoApproved ? "arranged" : "recommended"} vehicle: ${quote.vehicleType}` : ""}`
      : '',
    quoteApproved,
    quoteAutoApproved,
  });

  try {
    const generated = await generateReply(prompt, system, temperature);
    if (replyLanguageMatches(generated, lang)) {
      if (asksForKnownTripField(generated, tripDetails)) {
        return fallbackReply({ customerMessage, lang, contact, detectedEvents: params.detectedEvents, quote, quoteApproved, quoteAutoApproved, missingFields, missingBookingFields });
      }
      if ((quoteApproved || quoteAutoApproved) && quote && /owner|confirm|provisional|preliminary|pending|老板|确认|初步|参考|等待|待定/iu.test(generated)) {
        return fallbackReply({ customerMessage, lang, contact, detectedEvents: params.detectedEvents, quote, quoteApproved, quoteAutoApproved, missingFields, missingBookingFields });
      }
      if (!quote || quoteAmountAppears(generated, quote)) return generated;
      return `${generated.trim()}\n\n${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved, autoApproved: quoteAutoApproved })}`;
    }
    console.warn('LLM reply language did not match the conversation language, using fallback');
  } catch {
    console.warn('LLM reply generation failed, using fallback');
  }

  return fallbackReply({ customerMessage, lang, contact, detectedEvents: params.detectedEvents, quote, quoteApproved, quoteAutoApproved, missingFields, missingBookingFields });
}

function fieldLabelZh(field: TripFieldKey): string {
  const labels: Partial<Record<TripFieldKey, string>> = {
    date: "行程日期",
    time: "上车时间",
    pickupLocation: "上车地点",
    dropoffLocation: "下车地点",
    passengerCount: "乘客人数",
  };
  return labels[field] ?? field;
}
