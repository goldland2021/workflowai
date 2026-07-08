import { generateReply } from './client';
import type { 
  TripDetails, DetectedEvent, CapturedContact, QuoteSuggestion, TripFieldKey,
  BusinessConfiguration, ConversationMessage 
} from '../domain/types';

export async function generateAiReplyWithAI(params: {
  customerMessage: string;
  tripDetails: TripDetails;
  contact?: CapturedContact;
  detectedEvents: DetectedEvent[];
  missingFields: TripFieldKey[];
  quote?: QuoteSuggestion;
  configuration?: BusinessConfiguration;
  recentMessages?: ConversationMessage[];
}): Promise<string> {
  const { 
    customerMessage, tripDetails, contact, detectedEvents, missingFields, quote, 
    configuration, recentMessages 
  } = params;

  // Build rich context for the LLM
  const company = configuration?.companyProfile;
  const keyPolicies = configuration ? {
    businessHours: configuration.businessHours,
    paymentMethods: company?.paymentMethods,
    waitingPolicy: configuration.faq.find(f => f.id.includes('waiting'))?.answer,
    aiBoundaries: configuration.aiBehaviorBoundaries,
  } : {};

  const vehicles = configuration?.vehicles || [];
  const vehiclesText = vehicles.length > 0 
    ? vehicles.map(v => `- ${v.name}：最多容纳 ${v.capacity.passengers} 人，${v.capacity.luggage} 件行李。${v.description || ''}`).join('\n')
    : '- 丰田阿尔法\n- 丰田海狮';

  const recentHistory = (recentMessages || [])
    .slice(-6) // last 6 turns for context
    .map(m => `${m.role === 'customer' ? '客户' : 'AI'}: ${m.text}`)
    .join('\n');

  const context = {
    companyName: company?.name || '机场接送公司',
    serviceArea: company?.serviceArea,
    currentTrip: tripDetails,
    hasContact: !!contact,
    events: detectedEvents.map(e => e.eventType),
    missingFields,
    hasQuoteSuggestion: !!quote,
    keyPolicies,
    vehicles,
  };

  const prompt = `你是“${context.companyName}”的专业AI客服员工，负责机场接送服务。

公司信息：
- 服务区域：${context.serviceArea || '市中心及机场路线'}
- 工作时间：${keyPolicies.businessHours || '每日06:00-23:30'}
- 支付方式：${keyPolicies.paymentMethods?.join('、') || '现金、转账、刷卡'}
- 重要政策：${keyPolicies.waitingPolicy || '航班降落后标准等待60分钟'}

可用车型（必须根据乘客数和行李推荐）：
${vehiclesText}

公司知识库（FAQ - 回答客户问题时优先参考）：
${(configuration?.faq || []).map(f => `- ${f.question}\n  答案：${f.answer}`).join('\n') || '（暂无）'}

AI行为边界（必须严格遵守）：
${(keyPolicies.aiBoundaries || []).map(b => `- ${b}`).join('\n')}

最近对话历史：
${recentHistory || '（无历史）'}

当前客户最新消息：
"${customerMessage}"

当前已收集的行程信息（JSON）：
${JSON.stringify(context.currentTrip, null, 2)}

缺失的关键字段：${missingFields.join(', ') || '无'}
${contact ? `已捕获联系方式：${contact.method} ${contact.value}` : ''}
${quote ? '已为老板准备了报价建议（不要向客户透露具体价格数字）' : ''}

请用**自然、专业、简洁的中文**回复客户（1-4句话）。

严格要求：
- 一次只问**一个**最重要的问题，优先补全报价所需信息（上车/下车/日期/时间/乘客数）。
- 根据乘客人数和行李数量，主动推荐合适车型：
  - 丰田阿尔法适合较少乘客、追求舒适（3-6人）
  - 丰田海狮适合多人或多行李（可达8人）
- 回答客户问题时，**优先参考上面的公司知识库（FAQ）**，如果匹配就直接使用里面的答案。
- 当客户有购买意向时，礼貌引导提供联系方式（WhatsApp / Telegram / Email）。
- 检测到需要老板审核的事件时，只说“会提交老板审核”，绝不承诺任何折扣、取消、改时间等。
- 绝不向客户透露任何具体报价数字。
- 语气保持专业高效，像经验丰富的接送客服。
- 如果信息已经足够，告诉客户你会为老板准备报价建议。

直接输出回复文字，不要加解释或引号。`

  try {
    return await generateReply(prompt);
  } catch {
    console.warn('LLM reply generation failed, using fallback');
    if (contact) return `已记录您的 ${contact.method}。`;
    if (quote) return `信息已足够，我会为老板准备报价建议。`;
    if (missingFields.length > 0) return `好的，请提供${missingFields[0]}相关信息。`;
    return `谢谢您的信息，我会继续跟进。`;
  }
}
