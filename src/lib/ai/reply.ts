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
  options: { approved?: boolean } = {},
): string {
  const amount = `${quote.currency} ${quote.suggestedPrice.toLocaleString("en-US")}`;
  const vehicle = quote.vehicleType
    ? options.approved ? `，安排车型为${quote.vehicleType}` : `，建议车型为${quote.vehicleType}`
    : "";

  if (lang === "ar") {
    if (options.approved) {
      return `تم تأكيد السعر النهائي من المالك لهذه الرحلة: ${amount}${quote.vehicleType ? ` مع ${quote.vehicleType}` : ""}.`;
    }
    return `التقدير الأولي للرحلة هو ${amount}${quote.vehicleType ? ` مع ${quote.vehicleType}` : ""}. هذا سعر مبدئي يحتاج إلى تأكيد المالك، وسيتم تأكيد السعر النهائي وتوفر السيارة بعد المراجعة.`;
  }

  if (lang === "en") {
    if (options.approved) {
      return `The owner has confirmed the final quote for this trip: ${amount}${quote.vehicleType ? ` with a ${quote.vehicleType}` : ""}.`;
    }
    return `The provisional estimate for this trip is ${amount}${quote.vehicleType ? ` with a ${quote.vehicleType}` : ""}. This is a preliminary quote for owner confirmation; the final price and vehicle availability still need to be confirmed.`;
  }

  if (options.approved) {
    return `老板已确认本次行程的最终报价为 ${amount}${vehicle}。`;
  }
  return `根据目前的行程信息，参考报价为 ${amount}${vehicle}。这是提交老板确认的初步报价，最终价格和车辆安排需以确认结果为准。`;
}

function quoteAmountAppears(text: string, quote: QuoteSuggestion): boolean {
  const normalizedText = text.replace(/[\s,]/g, "");
  const normalizedAmount = String(quote.suggestedPrice).replace(/[\s,]/g, "");
  return normalizedText.includes(normalizedAmount);
}

function fallbackReply(params: {
  lang: PromptLang;
  contact?: CapturedContact;
  quote?: QuoteSuggestion;
  quoteApproved: boolean;
  missingFields: TripFieldKey[];
}): string {
  const { lang, contact, quote, quoteApproved, missingFields } = params;
  if (lang === 'ar') {
    if (contact && quote) return `شكرًا، تم تسجيل ${contact.method}. ${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved })}`;
    if (contact) return `شكرًا، تم تسجيل ${contact.method}. سأجهز اقتراح الرحلة للمالك.`;
    if (quote) return `${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved })} ما أفضل رقم واتساب أو بريد إلكتروني للمتابعة؟`;
    if (missingFields.length > 0) return `شكرًا. يرجى تزويدي بتفاصيل ${missingFields[0]}.`;
    return `شكرًا لمعلوماتك. سنتابع الخطوة التالية معك.`;
  }
  if (lang === 'en') {
    if (contact && quote) return `Thanks, I have saved your ${contact.method}. ${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved })}`;
    if (contact) return `Thanks, I have saved your ${contact.method}. I will prepare the quote suggestion for the owner.`;
    if (quote) return `${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved })} What is the best WhatsApp, Telegram, or email for updates?`;
    if (missingFields.length > 0) return `Thanks. Please provide the ${missingFields[0]} details.`;
    return `Thank you. I will prepare the next step for the owner.`;
  }
  if (contact && quote) return `谢谢，已记录您的${contact.method}联系方式。${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved })}`;
  if (contact) return `已记录您的${contact.method}，我会为老板准备报价建议。`;
  if (quote) return `${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved })} 方便提供 WhatsApp、Telegram 或邮箱接收更新吗？`;
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
  configuration?: BusinessConfiguration;
  recentMessages?: ConversationMessage[];
  customerLanguage?: PromptLang;
}): Promise<string> {
  const {
    customerMessage, tripDetails, contact, missingFields, quote, quoteApproved,
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
    contactInfo: contact ? `${contact.method} [redacted]` : '',
    quoteSummary: quote
      ? `${quote.currency} ${quote.suggestedPrice.toLocaleString("en-US")}${quote.vehicleType ? `, ${quoteApproved ? "arranged" : "recommended"} vehicle: ${quote.vehicleType}` : ""}`
      : '',
    quoteApproved,
  });

  try {
    const generated = await generateReply(prompt, system, temperature);
    if (replyLanguageMatches(generated, lang)) {
      if (quoteApproved && quote && /owner|confirm|provisional|preliminary|pending|老板|确认|初步|参考|等待|待定/iu.test(generated)) {
        return fallbackReply({ lang, contact, quote, quoteApproved, missingFields });
      }
      if (!quote || quoteAmountAppears(generated, quote)) return generated;
      return `${generated.trim()}\n\n${formatCustomerQuoteNotice(lang, quote, { approved: quoteApproved })}`;
    }
    console.warn('LLM reply language did not match the conversation language, using fallback');
  } catch {
    console.warn('LLM reply generation failed, using fallback');
  }

  return fallbackReply({ lang, contact, quote, quoteApproved, missingFields });
}
