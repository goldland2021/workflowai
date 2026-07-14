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

function fallbackReply(params: {
  lang: PromptLang;
  contact?: CapturedContact;
  quote?: QuoteSuggestion;
  missingFields: TripFieldKey[];
}): string {
  const { lang, contact, quote, missingFields } = params;
  if (lang === 'ar') {
    if (contact) return `شكرًا، تم تسجيل ${contact.method}. سأجهز اقتراح الرحلة للمالك.`;
    if (quote) return `المعلومات كافية لإعداد اقتراح للمالك. ما أفضل رقم واتساب أو بريد إلكتروني للمتابعة؟`;
    if (missingFields.length > 0) return `شكرًا. يرجى تزويدي بتفاصيل ${missingFields[0]}.`;
    return `شكرًا لمعلوماتك. سنتابع الخطوة التالية معك.`;
  }
  if (lang === 'en') {
    if (contact) return `Thanks, I have saved your ${contact.method}. I will prepare the quote suggestion for the owner.`;
    if (quote) return `I have enough information to prepare a quote suggestion for the owner. What is the best WhatsApp, Telegram, or email for updates?`;
    if (missingFields.length > 0) return `Thanks. Please provide the ${missingFields[0]} details.`;
    return `Thank you. I will prepare the next step for the owner.`;
  }
  if (contact) return `已记录您的${contact.method}，我会为老板准备报价建议。`;
  if (quote) return `信息已足够，我会为老板准备报价建议。方便提供 WhatsApp、Telegram 或邮箱接收更新吗？`;
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
  configuration?: BusinessConfiguration;
  recentMessages?: ConversationMessage[];
  customerLanguage?: PromptLang;
}): Promise<string> {
  const {
    customerMessage, tripDetails, contact, missingFields, quote,
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
    contactInfo: contact ? `${contact.method} ${contact.value}` : '',
    hasQuote: !!quote,
  });

  try {
    const generated = await generateReply(prompt, system, temperature);
    if (replyLanguageMatches(generated, lang)) return generated;
    console.warn('LLM reply language did not match the conversation language, using fallback');
  } catch {
    console.warn('LLM reply generation failed, using fallback');
  }

  return fallbackReply({ lang, contact, quote, missingFields });
}
