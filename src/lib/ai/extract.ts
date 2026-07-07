import { generateStructured } from './client';
import { TripDetailsSchema, DetectedEventSchema, QuoteSuggestionSchema, ContactSchema } from './schemas';
import { z } from 'zod';
import type { BusinessConfiguration, TripDetails, DetectedEvent, QuoteSuggestion, CapturedContact, TripFieldKey } from '../domain/types';
import { getMissingQuoteFields } from '../domain/booking-workflow';

const tripFieldKeys = new Set<TripFieldKey>([
  "serviceType",
  "pickupLocation",
  "dropoffLocation",
  "airport",
  "terminal",
  "date",
  "time",
  "flightNumber",
  "flightTime",
  "passengerCount",
  "luggageCount",
  "vehiclePreference",
]);

// Merge LLM output with existing trip details (LLM provides delta)
export async function extractTripDetailsWithAI(
  message: string,
  current: TripDetails,
  config: BusinessConfiguration
): Promise<TripDetails> {
  try {
    const extracted = await generateStructured(
      TripDetailsSchema,
      `客户消息: "${message}"

当前已知行程信息:
${JSON.stringify(current, null, 2)}

公司服务和规则（供参考）:
${JSON.stringify({
  services: config.services.map(s => s.name),
  pricingRules: config.pricingRules,
  serviceArea: config.companyProfile.serviceArea,
  availableVehicles: (config.vehicles || []).map(v => ({
    name: v.name,
    maxPassengers: v.capacity.passengers,
    maxLuggage: v.capacity.luggage,
    description: v.description,
  })),
}, null, 2)}

从最新客户消息中提取并更新任何新信息或更正的行程细节。
只包含明确提到或可自信推断的字段。
允许字段: serviceType, pickupLocation, dropoffLocation, airport, terminal, date, time, flightNumber, flightTime, passengerCount, luggageCount, vehiclePreference, specialRequests。
serviceType 只能是 airport_pickup, airport_dropoff, city_transfer, round_trip, day_tour, hourly_charter, multi_leg_itinerary。
passengerCount 和 luggageCount 必须是数字。
vehiclePreference 应尽量匹配公司可用车型（丰田阿尔法 或 丰田海狮），或根据乘客/行李数量合理推荐。
返回部分数据 — 不要编造值。`,
      '你是提取机场接送预订结构化细节的专家。请保守且准确。'
    );

    // Merge: LLM output overrides only when present
    return {
      ...current,
      ...extracted,
      // Keep numbers as numbers
      passengerCount: extracted.passengerCount ?? current.passengerCount,
      luggageCount: extracted.luggageCount ?? current.luggageCount,
      specialRequests: [
        ...(current.specialRequests || []),
        ...(extracted.specialRequests || []),
      ].filter((v, i, arr) => arr.indexOf(v) === i), // dedupe
    };
  } catch (e) {
    console.warn('LLM trip extraction failed, returning current details', e);
    return current;
  }
}

export async function detectEventsWithAI(
  message: string,
  config: BusinessConfiguration
): Promise<DetectedEvent[]> {
  try {
    const events = await generateStructured(
      z.array(DetectedEventSchema),
      `最新客户消息: "${message}"

业务背景:
- 升级规则: ${JSON.stringify(config.escalationRules.map(e => e.eventType))}
- 公司: ${config.companyProfile.name}

检测任何需要老板注意的业务事件。
返回对象字段: eventType, summary, suggestedOwnerAction, severity。
severity 只能是 low, medium, high。
返回一个数组（可以为空）。请精确。`,
      '仅识别符合允许类型的清晰业务事件。提供可操作的老板建议。'
    );

    return events.map((ev, i) => ({
      id: `event_ai_${Date.now()}_${i}`,
      eventType: ev.eventType,
      summary: ev.summary,
      suggestedOwnerAction: ev.suggestedOwnerAction,
      severity: ev.severity,
      status: 'pending' as const,
    }));
  } catch (e) {
    console.warn('LLM event detection failed', e);
    return [];
  }
}

export async function extractContactWithAI(message: string): Promise<CapturedContact | undefined> {
  try {
    const contact = await generateStructured(
      ContactSchema.nullable(),
      `Message: "${message}"

Extract any contact method and value the customer wants to be reached at (WhatsApp, Telegram, or Email). 
Return object fields: method, value.
Return null if none is provided.`
    );
    return contact || undefined;
  } catch {
    return undefined;
  }
}

export async function suggestQuoteWithAI(
  tripDetails: TripDetails,
  config: BusinessConfiguration
): Promise<QuoteSuggestion | undefined> {
  const missing = getMissingQuoteFields(tripDetails);

  if (missing.length > 2) return undefined; // Still too many missing

  try {
    const vehiclesInfo = (config.vehicles || []).map(v => 
      `${v.name}（最多${v.capacity.passengers}人，${v.capacity.luggage}件行李）：${v.description || ''}`
    ).join('\n');

    const suggestion = await generateStructured(
      QuoteSuggestionSchema,
      `行程细节: ${JSON.stringify(tripDetails)}

可用定价规则:
${JSON.stringify(config.pricingRules)}

可用车型:
${vehiclesInfo || '丰田阿尔法、丰田海狮'}

请根据乘客数和行李数量推荐最合适的车型（vehicleType 必须是“丰田阿尔法”或“丰田海狮”之一）。
建议一个报价。尽可能使用规则。保持现实。
返回对象字段: suggestedPrice, currency, vehicleType, reason, confidence, missingFields。
missingFields 必须是字段名数组。`
    );

    return {
      id: `quote_ai_${Date.now()}`,
      serviceType: tripDetails.serviceType,
      suggestedPrice: suggestion.suggestedPrice,
      currency: suggestion.currency,
      vehicleType: suggestion.vehicleType,
      reason: suggestion.reason,
      confidence: suggestion.confidence <= 1 ? Math.round(suggestion.confidence * 100) : suggestion.confidence,
      missingFields: suggestion.missingFields.filter((field): field is TripFieldKey =>
        tripFieldKeys.has(field as TripFieldKey),
      ),
      includedFees: ['Tolls', 'Parking fees', 'Taxes'],
    };
  } catch (e) {
    console.warn('LLM quote suggestion failed', e);
    return undefined;
  }
}
