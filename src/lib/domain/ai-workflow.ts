import type {
  BossInboxItem,
  BusinessConfiguration,
  CapturedContact,
  ConversationMessage,
  DetectedEvent,
  EventType,
  QuoteSuggestion,
  TripDetails,
  TripFieldKey,
} from "./types";
import type { ExistingBossInboxItem, WorkflowResult } from "./workflow-types";
import { getMissingQuoteFields } from "./booking-workflow";

// Real AI integration (modular - falls back gracefully if no key)
import {
  extractTripDetailsWithAI,
  detectEventsWithAI,
  extractContactWithAI,
} from "../ai/extract";
import { formatCustomerQuoteNotice, generateAiReplyWithAI } from "../ai/reply";
import { hasRealAI } from "../ai";
import { redactContactDetails } from "../ai/pii";
import { resolveConversationLang, type PromptLang } from "../ai/prompts/templates";

const eventKeywords: Array<{
  type: EventType;
  keywords: string[];
  severity: DetectedEvent["severity"];
  ownerAction: string;
}> = [
  {
    type: "Discount Request",
    keywords: ["discount", "cheaper", "lower price", "best price", "too expensive"],
    severity: "medium",
    ownerAction: "Review whether a discount is commercially acceptable.",
  },
  {
    type: "Urgent Booking",
    keywords: ["urgent", "asap", "right now", "today", "tonight", "in one hour"],
    severity: "high",
    ownerAction: "Confirm driver and vehicle availability before replying.",
  },
  {
    type: "Route Change",
    keywords: ["change route", "different hotel", "change pickup", "change drop", "another stop"],
    severity: "medium",
    ownerAction: "Check whether the new route changes the price.",
  },
  {
    type: "Flight Delay",
    keywords: ["delay", "delayed", "late flight", "flight is late"],
    severity: "medium",
    ownerAction: "Review driver schedule and waiting policy.",
  },
  {
    type: "Complaint",
    keywords: ["complaint", "not happy", "bad service", "driver was late", "angry"],
    severity: "high",
    ownerAction: "Handle the complaint personally before the AI promises anything.",
  },
  {
    type: "Cancellation Request",
    keywords: ["cancel", "cancellation", "refund", "no longer need"],
    severity: "high",
    ownerAction: "Review cancellation policy and decide the response.",
  },
  {
    type: "Receipt Request",
    keywords: ["receipt", "invoice", "发票", "收据"],
    severity: "low",
    ownerAction: "Prepare receipt details and confirm the receipt name or amount.",
  },
  {
    type: "Driver Assignment Needed",
    keywords: ["driver details", "driver information", "driver name", "license plate", "车牌", "司机"],
    severity: "medium",
    ownerAction: "Confirm driver and vehicle details before sending them to the customer.",
  },
  {
    type: "Pickup Time Change",
    keywords: ["change pickup time", "what time should", "pickup time", "leave at", "几点出发", "幾點出發"],
    severity: "medium",
    ownerAction: "Review timing, traffic buffer, and flight schedule before confirming.",
  },
  {
    type: "Early Pickup Request",
    keywords: ["come earlier", "pick up earlier", "ready to leave now", "arrive early"],
    severity: "medium",
    ownerAction: "Check with the driver before promising an earlier pickup.",
  },
  {
    type: "Same Driver Request",
    keywords: ["same driver", "same car", "same chauffeur"],
    severity: "medium",
    ownerAction: "Check whether the same driver is available.",
  },
  {
    type: "English-speaking Driver Request",
    keywords: ["english-speaking driver", "english speaking driver", "english driver"],
    severity: "medium",
    ownerAction: "Confirm whether an English-speaking driver is available.",
  },
  {
    type: "Multi-leg Itinerary Request",
    keywords: ["following", "itinerary", "multi", "mt fuji", "hakone", "kyoto", "takayama", "day tour"],
    severity: "medium",
    ownerAction: "Review each route leg and prepare a structured multi-leg quote.",
  },
  {
    type: "Round Trip Discount",
    keywords: ["round trip", "return pickup", "both transfers", "same price", "special price"],
    severity: "medium",
    ownerAction: "Decide whether a round-trip discount is acceptable.",
  },
  {
    type: "Payment Coordination",
    keywords: ["pay cash", "pay the driver", "payment", "paid", "付款"],
    severity: "low",
    ownerAction: "Confirm payment method and which driver should receive payment.",
  },
  {
    type: "Driver Coordination Issue",
    keywords: ["driver not aware", "driver hasn't arrived", "driver has not arrived", "not informed"],
    severity: "high",
    ownerAction: "Contact the driver and resolve the coordination issue.",
  },
];

const fieldLabels: Record<TripFieldKey, string> = {
  serviceType: "service type",
  pickupLocation: "pickup location",
  dropoffLocation: "drop-off location",
  airport: "airport",
  terminal: "terminal",
  date: "transfer date",
  time: "pickup time",
  flightNumber: "flight number",
  flightTime: "flight time",
  passengerCount: "number of passengers",
  luggageCount: "luggage count",
  vehiclePreference: "vehicle preference",
};

const fieldLabelsZh: Record<TripFieldKey, string> = {
  serviceType: "服务类型",
  pickupLocation: "上车地点",
  dropoffLocation: "下车地点",
  airport: "机场",
  terminal: "航站楼",
  date: "行程日期",
  time: "上车时间",
  flightNumber: "航班号",
  flightTime: "航班时间",
  passengerCount: "乘客人数",
  luggageCount: "行李数量",
  vehiclePreference: "车型偏好",
};

const explicitEventIntent: Partial<Record<EventType, RegExp>> = {
  "Urgent Booking": /\b(?:urgent|asap|right now|today|tonight|immediately|same[- ]day|in (?:one|1) hour)\b|紧急|立即|马上|今天|今晚|当日/iu,
  "Receipt Request": /\b(?:receipt|invoice)\b|发票|收据/iu,
  "Route Change": /\b(?:change|update|switch|different|another)\b.{0,30}\b(?:route|pickup|drop-?off|destination|hotel|stop)\b|(?:改|更改|调整|换).{0,12}(?:路线|上车|下车|目的地|酒店)/iu,
  "Pickup Time Change": /\b(?:change|update|move|reschedule|earlier|later|new)\b.{0,30}\b(?:pickup|pick-up|time|leave)\b|(?:改|更改|调整|提前|延后|推迟).{0,12}(?:接车|上车|时间|出发)/iu,
};

export function filterDetectedEventsForMessage(
  message: string,
  events: DetectedEvent[],
): DetectedEvent[] {
  return events.filter((event) => {
    const requiredIntent = explicitEventIntent[event.eventType];
    return requiredIntent ? requiredIntent.test(message) : true;
  });
}

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export async function analyzeCustomerTurn(params: {
  message: string;
  currentTripDetails: TripDetails;
  configuration: BusinessConfiguration;
  existingBossItems: ExistingBossInboxItem[];
  recentMessages?: ConversationMessage[];
  customerLanguage?: PromptLang;
}): Promise<WorkflowResult> {
  const now = new Date();
  const lang = resolveConversationLang({
    customerMessage: params.message,
    recentMessages: params.recentMessages,
    config: params.configuration,
    lockedLanguage: params.customerLanguage,
  });
  const fastFaqReply = getFastFaqReply(params.message, params.configuration, lang);
  if (fastFaqReply) {
    return {
      aiMessage: {
        id: `msg_ai_${Date.now()}`,
        role: "ai",
        text: fastFaqReply,
        createdAt: now.toISOString(),
        channel: "website_widget",
      },
      tripDetails: params.currentTripDetails,
      detectedEvents: [],
      bossInboxItems: [],
    };
  }

  let tripDetails: TripDetails;
  let contact: CapturedContact | undefined;
  let detectedEvents: DetectedEvent[];
  const deterministicContact = extractContact(params.message);
  const promptMessage = redactContactDetails(params.message);

  if (hasRealAI) {
    // Prefer real LLM with structured outputs (per project architecture rules)
    const [aiTripDetails, aiContact, aiDetectedEvents] = await Promise.all([
      extractTripDetailsWithAI(promptMessage, params.currentTripDetails, params.configuration),
      deterministicContact ? Promise.resolve(undefined) : extractContactWithAI(params.message),
      detectEventsWithAI(promptMessage, params.configuration),
    ]);
    // Keep critical booking fields deterministic while preserving the model's
    // extracted fields on top of the already persisted trip details.
    tripDetails = mergeTripDetails(
      params.currentTripDetails,
      params.message,
      aiTripDetails,
      { locationPrompted: hasRecentLocationPrompt(params.recentMessages) },
    );
    contact = deterministicContact ?? aiContact;
    detectedEvents = aiDetectedEvents;
  } else {
    // Fallback to original rule-based logic
    tripDetails = mergeTripDetails(
      params.currentTripDetails,
      params.message,
      undefined,
      { locationPrompted: hasRecentLocationPrompt(params.recentMessages) },
    );
    contact = extractContact(params.message);
    detectedEvents = detectEvents(params.message);
  }

  // The application owns event boundaries. Structured model output is useful,
  // but high-impact event types still require explicit customer intent.
  detectedEvents = filterDetectedEventsForMessage(params.message, detectedEvents);

  const missingFields = getMissingQuoteFields(tripDetails);

  // Pricing is owned by configured business rules, never invented by the
  // model. This also removes an entire sequential LLM round trip.
  const quote = maybeCreateQuoteSuggestion(tripDetails, params.configuration, missingFields);

  const bossInboxItems = createBossInboxItems({
    detectedEvents,
    quote,
    tripDetails,
    existingBossItems: params.existingBossItems,
    ownerApprovalEventTypes: new Set(
      params.configuration.escalationRules
        .filter((rule) => rule.requiresOwnerApproval)
        .map((rule) => rule.eventType),
    ),
    createdAt: now.toISOString(),
  });

  let aiMessage: ConversationMessage;
  if (hasRealAI) {
    const text = await generateAiReplyWithAI({
      customerMessage: promptMessage,
      tripDetails,
      contact,
      detectedEvents,
      missingFields,
      quote,
      configuration: params.configuration,
      recentMessages: params.recentMessages?.map((message) => ({
        ...message,
        text: redactContactDetails(message.text),
      })),
      customerLanguage: lang,
    });
    aiMessage = {
      id: `msg_ai_${Date.now()}`,
      role: "ai",
      text,
      createdAt: now.toISOString(),
      channel: "website_widget",
    };
  } else {
    aiMessage = createAiMessage({
      customerMessage: params.message,
      tripDetails,
      contact,
      detectedEvents,
      missingFields,
      quote,
      lang,
      createdAt: now.toISOString(),
    });
  }

  return {
    aiMessage,
    tripDetails,
    contact,
    detectedEvents,
    bossInboxItems,
  };
}

/**
 * Answers a small set of read-only policy questions directly from structured
 * company configuration. Commercial requests and non-Chinese messages keep
 * using the full workflow so this fast path cannot bypass extraction or owner
 * approval.
 */
export function getFastFaqReply(
  message: string,
  configuration: BusinessConfiguration,
  customerLanguage?: PromptLang,
): string | undefined {
  const lang = customerLanguage ?? resolveConversationLang({ customerMessage: message, config: configuration });
  if (lang !== "zh") return undefined;

  const compact = message.toLowerCase().replaceAll(/\s+/gu, "");
  const isQuestion = /[?？]|吗|嗎|么|麼|如何|怎么|怎麼|多久|多长|多長|能否|可以|是否|包含/u.test(compact);
  if (!isQuestion) return undefined;

  const faqIntents: Array<{ message: RegExp; faq: RegExp }> = [
    { message: /等待|等候|候车|候車/u, faq: /waiting|等待|等候/iu },
    { message: /怎么付|怎麼付|如何支付|付款方式|支付方式/u, faq: /payment|支付|付款/iu },
    { message: /儿童座椅|兒童座椅|婴儿座椅|嬰兒座椅|安全座椅/u, faq: /child|儿童|兒童|婴儿|嬰兒|座椅/iu },
  ];

  for (const intent of faqIntents) {
    if (!intent.message.test(compact)) continue;
    // FAQ IDs may survive owner edits and no longer describe their current
    // content. Match only the visible question so stale seed IDs cannot cause
    // a fast but incorrect answer.
    const faq = configuration.faq.find((item) => intent.faq.test(item.question));
    if (faq) return faq.answer;
  }

  if (/高速费|高速費|过路费|過路費|停车费|停車費|费用包含|費用包含|包含.*费|包含.*費/u.test(compact)) {
    return "高速费、停车费和税费会在老板确认的报价中明确列出，最终以老板批准的报价为准。";
  }

  return undefined;
}

function mergeTripDetails(
  current: TripDetails,
  message: string,
  extractedDetails?: TripDetails,
  options: { locationPrompted?: boolean } = {},
): TripDetails {
  const lower = message.toLowerCase();
  const extractedFields = Object.fromEntries(
    Object.entries(extractedDetails ?? {}).filter(
      ([key, value]) => key !== "specialRequests" && value !== undefined && value !== null && value !== "",
    ),
  ) as Partial<TripDetails>;
  const next: TripDetails = { ...current, ...extractedFields };
  if (extractedDetails?.specialRequests?.length) {
    next.specialRequests = Array.from(
      new Set([...(current.specialRequests ?? []), ...extractedDetails.specialRequests]),
    );
  }
  const route = message.match(/from\s+(.+?)\s+to\s+(.+?)(?:[.,]|$|\s+on\s+|\s+at\s+|\s+with\s+|\s+for\s+)/i);
  const chineseRoute = message.match(/(?:从|從|由)\s*(.+?)\s*(?:到|前往|去)\s*(.+?)(?=[，。,.]|$)/u);
  const fromOnly = message.match(/(?:collect\s+\w+\s+\w+\s+from|collect\s+\w+\s+from|from)\s+(.+?)(?:\s+at\s+|\s+on\s+|[.,]|$)/i);
  const travelingTo = message.match(/(?:traveling|travelling|going)\s+to\s+(.+?)(?:[.,]|$)/i);
  const dropOnly = message.match(/drop(?:\s|-)?off\s+(?:is|at|to)?\s*([a-z0-9\s'-]+)(?:[.,]|$)/i);
  const explicitDropoff = extractExplicitDropoffLocation(message);
  const pickupOnly = message.match(/pick(?:\s|-)?up\s+(?:is|at|from)?\s*([a-z0-9\s'-]+)(?:[.,]|$)/i);
  const uppercaseFlight = message.match(/\b[A-Z]{2}\s?\d{1,4}\b/);
  const labelledFlight = message.match(/\bflight(?:\s+number)?\s*(?:is|:)?\s*([a-z0-9]{2}\s?\d{1,4})\b/i);
  const flight = uppercaseFlight?.[0] ?? labelledFlight?.[1];
  const time = message.match(/\b(?:[01]?\d|2[0-3])[:.][0-5]\d\s*(?:am|pm)?\b|\b\d{1,2}\s?(?:am|pm)\b/i);
  const numberPattern = "\\d+|one|two|three|four|five|six|seven|eight|nine|ten";
  const passengers = message.match(new RegExp(`\\b(${numberPattern})\\s*(?:passengers?|people|pax|persons?|adults?)\\b`, "i"));
  const luggage = message.match(new RegExp(`\\b(${numberPattern})\\s*(?:small|medium|large|sized|medium-sized|large-sized|small-sized|\\s|-)*(?:bags?|luggage|suitcases?)\\b`, "i"));
  const chinesePassengers = message.match(/(\d+)\s*(?:位|名|个|個)?\s*(?:乘客|客人|人)/u);
  const chineseLuggage = message.match(/(\d+)\s*(?:件|个|個)?\s*(?:行李箱|行李|箱)/u);
  const terminal = message.match(new RegExp(`\\bterminal\\s*(${numberPattern})\\b`, "i"));

  if (route) {
    next.pickupLocation = cleanText(route[1]);
    next.dropoffLocation = cleanText(route[2]);

    const pickupIsAirport = /airport|narita|haneda|kansai/i.test(route[1]);
    const dropoffIsAirport = /airport|narita|haneda|kansai/i.test(route[2]);
    if (pickupIsAirport && !dropoffIsAirport) next.serviceType = "airport_pickup";
    if (dropoffIsAirport && !pickupIsAirport) next.serviceType = "airport_dropoff";
  } else if (chineseRoute) {
    next.pickupLocation = cleanText(chineseRoute[1]);
    next.dropoffLocation = cleanText(chineseRoute[2]);

    const pickupIsAirport = /机场|機場|成田|羽田|关西|關西/u.test(chineseRoute[1]);
    const dropoffIsAirport = /机场|機場|成田|羽田|关西|關西/u.test(chineseRoute[2]);
    if (pickupIsAirport && !dropoffIsAirport) next.serviceType = "airport_pickup";
    if (dropoffIsAirport && !pickupIsAirport) next.serviceType = "airport_dropoff";
  }

  if (!next.pickupLocation && pickupOnly) {
    next.pickupLocation = cleanText(pickupOnly[1]);
  }

  if (!next.pickupLocation && fromOnly) {
    next.pickupLocation = cleanText(fromOnly[1]);
  }

  if (!next.dropoffLocation && travelingTo) {
    next.dropoffLocation = cleanText(travelingTo[1]);
  }

  if (!next.dropoffLocation && dropOnly) {
    next.dropoffLocation = cleanText(dropOnly[1]);
  }

  if (!next.dropoffLocation && explicitDropoff) {
    next.dropoffLocation = explicitDropoff;
  }

  // A customer often replies with only the hotel name or address after the
  // assistant asks for it. Use the previous prompt as context so a bare
  // location is stored instead of triggering the same question again.
  if (!next.dropoffLocation && options.locationPrompted && looksLikeLocationReply(message)) {
    next.dropoffLocation = cleanText(message);
  }

  if (lower.includes("airport") && !next.pickupLocation && !lower.includes("drop")) {
    next.pickupLocation = "Airport";
  }

  if (lower.includes("airport pickup") || lower.includes("arrival") || lower.includes("collect") && lower.includes("airport")) {
    next.serviceType = "airport_pickup";
  } else if (
    lower.includes("airport drop") ||
    lower.includes("departure transfer") ||
    lower.includes("destination airport") ||
    lower.includes("to narita") ||
    lower.includes("to haneda") ||
    lower.includes("to kansai")
  ) {
    next.serviceType = "airport_dropoff";
  } else if (lower.includes("round trip") || lower.includes("return pickup")) {
    next.serviceType = "round_trip";
  } else if (lower.includes("day tour") || lower.includes("10 hours") || lower.includes("explore")) {
    next.serviceType = "day_tour";
  } else if (lower.includes("hotel to") || lower.includes("city")) {
    next.serviceType = "city_transfer";
  }

  if (lower.includes("narita") || message.includes("成田")) {
    next.airport = "Narita";
  } else if (lower.includes("haneda") || message.includes("羽田")) {
    next.airport = "Haneda";
  } else if (lower.includes("kansai") || /关西|關西/u.test(message)) {
    next.airport = "Kansai";
  }

  if (terminal) {
    next.terminal = `Terminal ${formatNumberToken(terminal[1])}`;
  }

  if (lower.includes("tomorrow")) {
    next.date = "Tomorrow";
  } else if (lower.includes("today")) {
    next.date = "Today";
  } else {
    const date = message.match(/\b(?:\d{1,2}\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+\d{1,2})?\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/i);
    const chineseDate = message.match(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號]/u);
    if (date) next.date = date[0];
    else if (chineseDate) next.date = `${chineseDate[1] ? `${chineseDate[1]}年` : ""}${chineseDate[2]}月${chineseDate[3]}日`;
  }

  if (time) {
    next.time = normalizeTime(time[0]);
  }
  if (flight) next.flightNumber = flight.toUpperCase().replace(/\s+/, " ");
  if (!flight && !extractedDetails?.flightNumber) {
    next.flightNumber = current.flightNumber;
    next.flightTime = current.flightTime;
  }
  if (passengers) next.passengerCount = parseNumberToken(passengers[1]);
  else if (chinesePassengers) next.passengerCount = Number(chinesePassengers[1]);
  if (luggage) next.luggageCount = parseNumberToken(luggage[1]);
  else if (chineseLuggage) next.luggageCount = Number(chineseLuggage[1]);

  if (lower.includes("van") || lower.includes("minivan") || lower.includes("海狮") || lower.includes("海獅") || lower.includes("hiace")) {
    next.vehiclePreference = "丰田海狮";
  } else if (lower.includes("alphard") || lower.includes("阿尔法") || lower.includes("阿爾法")) {
    next.vehiclePreference = "丰田阿尔法";
  } else if (lower.includes("suv")) {
    next.vehiclePreference = "SUV";
  } else if (lower.includes("sedan")) {
    next.vehiclePreference = "Sedan";
  }

  const specialRequests = new Set(next.specialRequests ?? []);
  if (lower.includes("receipt") || lower.includes("invoice")) specialRequests.add("Receipt requested");
  if (lower.includes("english-speaking driver") || lower.includes("english speaking driver")) {
    specialRequests.add("English-speaking driver requested");
  }
  if (lower.includes("same driver")) specialRequests.add("Same driver requested");
  if (lower.includes("cash")) specialRequests.add("Cash payment after service");
  if (specialRequests.size > 0) next.specialRequests = Array.from(specialRequests);

  return next;
}

function detectEvents(message: string): DetectedEvent[] {
  const lower = message.toLowerCase();

  return eventKeywords
    .filter((event) => event.keywords.some((keyword) => lower.includes(keyword)))
    .map((event, index) => ({
      id: `event_${event.type.toLowerCase().replaceAll(" ", "_")}_${Date.now()}_${index}`,
      eventType: event.type,
      summary: createEventSummary(event.type, message),
      suggestedOwnerAction: event.ownerAction,
      severity: event.severity,
      status: "pending",
    }));
}

function maybeCreateQuoteSuggestion(
  tripDetails: TripDetails,
  configuration: BusinessConfiguration,
  missingFields: TripFieldKey[],
): QuoteSuggestion | undefined {
  if (missingFields.length > 0) return undefined;

  const wantsLargeVehicle =
    tripDetails.vehiclePreference?.includes("海狮") || tripDetails.vehiclePreference?.toLowerCase().includes("van") ||
    (tripDetails.passengerCount ?? 0) >= 4 ||
    (tripDetails.luggageCount ?? 0) >= 4;

  const pricingRule = wantsLargeVehicle
    ? configuration.pricingRules.find((rule) => rule.id === "price_van_airport")
    : configuration.pricingRules.find((rule) => rule.id === "price_standard_airport");

  if (!pricingRule) return undefined;

  return {
    id: `quote_${Date.now()}`,
    serviceType: tripDetails.serviceType,
    suggestedPrice: pricingRule.basePrice,
    currency: pricingRule.currency,
    vehicleType: wantsLargeVehicle ? "丰田海狮" : "丰田阿尔法",
    includedFees: ["Tolls", "Parking fees", "Taxes"],
    routeDistanceKm: tripDetails.routeDistanceKm,
    estimatedDriveTimeMinutes: tripDetails.estimatedDriveTimeMinutes,
    reason: `${pricingRule.label} applies based on route details, passengers, and luggage.`,
    confidence: wantsLargeVehicle ? 88 : 82,
    missingFields,
  };
}

function createBossInboxItems(params: {
  detectedEvents: DetectedEvent[];
  quote?: QuoteSuggestion;
  tripDetails: TripDetails;
  existingBossItems: ExistingBossInboxItem[];
  ownerApprovalEventTypes: Set<EventType>;
  createdAt: string;
}): BossInboxItem[] {
  const existingPendingTypes = new Set(
    params.existingBossItems
      .filter((item) => item.status === "pending")
      .map((item) => item.event?.eventType ?? item.type),
  );

  const eventItems = params.detectedEvents
    .filter((event) => params.ownerApprovalEventTypes.has(event.eventType))
    .filter((event) => !existingPendingTypes.has(event.eventType))
    .map((event): BossInboxItem => ({
      id: `boss_${event.id}`,
      type: mapEventToBossType(event.eventType),
      decisionType: mapEventToDecisionType(event.eventType),
      status: "pending",
      customerName: "Website visitor",
      summary: event.summary,
      recommendation: event.suggestedOwnerAction,
      reason: "This event requires owner review under the V1 escalation rules.",
      confidence: event.severity === "high" ? 92 : 84,
      createdAt: params.createdAt,
      event,
    }));

  const quoteItem =
    params.quote && !existingPendingTypes.has("quote_approval")
      ? [
          {
            id: `boss_${params.quote.id}`,
            type: "quote_approval" as const,
            decisionType: "Approve quote",
            status: "pending" as const,
            customerName: "Website visitor",
            summary: summarizeTrip(params.tripDetails),
            recommendation: `Approve ${params.quote.currency} ${params.quote.suggestedPrice} quote.`,
            reason: params.quote.reason,
            confidence: params.quote.confidence,
            createdAt: params.createdAt,
            quote: params.quote,
          },
        ]
      : [];

  return [...eventItems, ...quoteItem];
}

function createAiMessage(params: {
  customerMessage: string;
  tripDetails: TripDetails;
  contact?: CapturedContact;
  detectedEvents: DetectedEvent[];
  missingFields: TripFieldKey[];
  quote?: QuoteSuggestion;
  lang: PromptLang;
  createdAt: string;
}): ConversationMessage {
  const purchaseIntent = hasPurchaseIntent(params.customerMessage);
  const eventText =
    params.detectedEvents.length > 0
      ? params.lang === "zh"
        ? " 这项请求需要业务决定，我已提交老板审核。"
        : " I have flagged this for owner review because it needs a business decision."
      : "";
  let text: string;

  if (params.contact && params.quote) {
    text = params.lang === "zh"
      ? `谢谢，已记录您的${params.contact.method}联系方式。${formatCustomerQuoteNotice(params.lang, params.quote)}${eventText}`
      : `Thanks, I have saved your ${params.contact.method}. ${formatCustomerQuoteNotice(params.lang, params.quote)}${eventText}`;
  } else if (params.contact) {
    text = params.lang === "zh"
      ? `谢谢，已记录您的${params.contact.method}联系方式。`
      : `Thanks, I have saved your ${params.contact.method}.`;
  } else if (params.quote) {
    text = params.lang === "zh"
      ? `${formatCustomerQuoteNotice(params.lang, params.quote)}${eventText}`
      : formatCustomerQuoteNotice(params.lang, params.quote) + eventText;
  } else if (params.missingFields.length > 0) {
    const nextField = params.missingFields[0];
    const contactAsk = purchaseIntent
      ? params.lang === "zh"
        ? " 另外，方便提供 WhatsApp、Telegram 或邮箱接收更新吗？"
        : " Also, what is the best WhatsApp, Telegram, or email for updates?"
      : "";
    text = params.lang === "zh"
      ? `好的，请问${fieldLabelsZh[nextField]}是什么？${contactAsk}${eventText}`
      : `Got it. What is the ${fieldLabels[nextField]}?${contactAsk}${eventText}`;
  } else {
    text = params.lang === "zh"
      ? `谢谢，我会为老板准备下一步。${eventText}`
      : `Thanks, I will prepare the next step for the owner.${eventText}`;
  }

  return {
    id: `msg_ai_${Date.now()}`,
    role: "ai",
    text,
    createdAt: params.createdAt,
    channel: "website_widget",
  };
}

function extractContact(message: string): CapturedContact | undefined {
  const email = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const telegram = message.match(/@[a-z0-9_]{4,}/i);
  const whatsapp = message.match(/(?:whatsapp|wa)?\s*(\+?\d[\d\s-]{7,}\d)/i);

  if (email) return { method: "Email", value: email[0] };
  if (telegram) return { method: "Telegram", value: telegram[0] };
  if (whatsapp) return { method: "WhatsApp", value: whatsapp[1].trim() };

  return undefined;
}

function hasPurchaseIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return [
    "price",
    "quote",
    "available",
    "availability",
    "book",
    "booking",
    "airport",
    "pickup",
    "drop",
    "vehicle",
    "van",
    "sedan",
  ].some((keyword) => lower.includes(keyword));
}

function summarizeTrip(tripDetails: TripDetails): string {
  return [
    tripDetails.serviceType && `Service: ${formatServiceType(tripDetails.serviceType)}`,
    tripDetails.pickupLocation && `Pickup: ${tripDetails.pickupLocation}`,
    tripDetails.dropoffLocation && `Drop-off: ${tripDetails.dropoffLocation}`,
    tripDetails.date && `Date: ${tripDetails.date}`,
    tripDetails.time && `Time: ${tripDetails.time}`,
    tripDetails.passengerCount && `${tripDetails.passengerCount} passengers`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function mapEventToBossType(eventType: EventType): BossInboxItem["type"] {
  if (eventType === "Receipt Request") return "receipt_request";
  if (eventType === "Payment Coordination") return "payment_coordination";
  if (eventType === "Driver Assignment Needed" || eventType === "Driver Coordination Issue") {
    return "driver_assignment";
  }
  if (
    eventType === "Pickup Time Change" ||
    eventType === "Early Pickup Request" ||
    eventType === "Route Change"
  ) {
    return "change_request";
  }
  return "event_review";
}

function mapEventToDecisionType(eventType: EventType): string {
  const labels: Record<EventType, string> = {
    "Discount Request": "Approve discount",
    "Urgent Booking": "Confirm urgent availability",
    "Route Change": "Confirm route change",
    "Flight Delay": "Review flight delay",
    Complaint: "Handle complaint",
    "Cancellation Request": "Review cancellation",
    "Receipt Request": "Prepare receipt",
    "Driver Assignment Needed": "Send driver details",
    "Pickup Time Change": "Confirm pickup time",
    "Early Pickup Request": "Check early pickup",
    "Same Driver Request": "Check same driver",
    "English-speaking Driver Request": "Check English-speaking driver",
    "Multi-leg Itinerary Request": "Prepare multi-leg quote",
    "Round Trip Discount": "Approve round-trip discount",
    "Payment Coordination": "Coordinate payment",
    "Driver Coordination Issue": "Resolve driver issue",
  };

  return labels[eventType];
}

function formatServiceType(serviceType: NonNullable<TripDetails["serviceType"]>): string {
  return serviceType
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function createEventSummary(type: EventType, message: string): string {
  return `${type} detected from customer message: "${message.slice(0, 110)}${message.length > 110 ? "..." : ""}"`;
}

function hasRecentLocationPrompt(messages?: ConversationMessage[]): boolean {
  const latestAiMessage = [...(messages ?? [])]
    .reverse()
    .find((message) => message.role === "ai");

  return Boolean(
    latestAiMessage &&
      /hotel|accommodation|destination|drop[- ]?off|address|下车|酒店|住宿|目的地|地址/iu.test(
        latestAiMessage.text,
      ),
  );
}

function extractExplicitDropoffLocation(message: string): string | undefined {
  const matches = [
    message.match(
      /\b(?:the\s+)?address\s+of\s+(?:my\s+)?(?:hotel|accommodation)\s*(?:is(?:\s+at)?|at|:)\s*(.+?)(?=[.!?。！？]|$)/iu,
    ),
    message.match(
      /\b(?:my\s+)?(?:hotel|accommodation|destination|drop[- ]?off)(?:\s+(?:address|location))?\s*(?:is(?:\s+at)?|at|:)\s*(.+?)(?=[.!?。！？]|$)/iu,
    ),
    message.match(/\baddress\s*(?:is(?:\s+at)?|at|:)\s*(.+?)(?=[.!?。！？]|$)/iu),
    message.match(
      /(?:酒店|住宿|目的地|下车(?:地点|地址)?|地址)\s*(?:地址)?\s*(?:是|在|为|：|:)\s*(.+?)(?=[，。！？,.!?]|$)/u,
    ),
  ];

  const value = matches.find((match) => match?.[1])?.[1];
  return value ? cleanText(value) : undefined;
}

function looksLikeLocationReply(message: string): boolean {
  const compact = message.trim();
  if (compact.length < 3) return false;
  if (
    /\b(?:yes|no|okay|ok|tomorrow|today|tonight|passengers?|people|bags?|luggage|am|pm)\b|明天|今天|今晚|乘客|行李/iu.test(
      compact,
    )
  ) {
    return false;
  }

  return /hotel|address|street|road|avenue|station|airport|tokyo|shinjuku|shibuya|ginza|ueno|asakusa|yokohama|narita|haneda|酒店|地址|街|路|丁目|番地|号|机场|车站|車站/iu.test(
    compact,
  );
}

function cleanText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[，。！？,.!?]+$/u, "")
    .replace(/\bthe\b$/i, "")
    .trim();
}

function parseNumberToken(value: string): number {
  const normalized = value.toLowerCase();
  return numberWords[normalized] ?? Number(normalized);
}

function formatNumberToken(value: string): string {
  return String(parseNumberToken(value));
}

function normalizeTime(value: string): string {
  return value.trim().replace(".", ":").replace(/\s+/g, " ").toUpperCase();
}
