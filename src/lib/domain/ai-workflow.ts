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
import { getMissingBookingFields, getMissingQuoteFields } from "./booking-workflow";

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
import { formatFlightArrivalDetails } from "../flight/arrival";
import { calculateWorkflowQuote } from "./pricing";
import { extractDateText, extractLabeledTripFields, normalizeTripDetails } from "./trip-state";

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
    keywords: ["pay", "payment", "paid", "cash", "paypal", "visa", "credit card", "pay the driver", "付款", "支付", "刷卡", "现金"],
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
  "Discount Request": /\b(?:discount|cheaper|lower price|best price|too expensive|special offer|special price)\b|折扣|优惠|優惠|便宜|特价|特價/iu,
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
  routeEnricher?: (tripDetails: TripDetails) => Promise<TripDetails>;
  hotelReferenceResolver?: (tripDetails: TripDetails) => Promise<TripDetails>;
  approvedQuote?: QuoteSuggestion;
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
  const fastOperationalReply = getFastOperationalReply(params.message, lang);
  if (fastOperationalReply) {
    return {
      aiMessage: {
        id: `msg_ai_${Date.now()}`,
        role: "ai",
        text: fastOperationalReply,
        createdAt: now.toISOString(),
        channel: "website_widget",
      },
      tripDetails: params.currentTripDetails,
      detectedEvents: [],
      bossInboxItems: [],
    };
  }
  const fastFlightArrivalReply = getFastFlightArrivalReply(params.message, params.currentTripDetails, lang);
  if (fastFlightArrivalReply) {
    return {
      aiMessage: {
        id: `msg_ai_${Date.now()}`,
        role: "ai",
        text: fastFlightArrivalReply,
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

  if (params.routeEnricher) {
    try {
      tripDetails = await params.routeEnricher(tripDetails);
    } catch {
      // Route enrichment is an accuracy improvement, not a reason to block chat.
    }
  }

  if (params.hotelReferenceResolver) {
    try {
      tripDetails = await params.hotelReferenceResolver(tripDetails);
    } catch {
      // Hotel reference data is optional context and must not block a quote.
    }
  }

  const missingFields = getMissingQuoteFields(tripDetails);
  const missingBookingFields = getMissingBookingFields(tripDetails);

  // Pricing is owned by configured business rules, never invented by the
  // model. This also removes an entire sequential LLM round trip.
  const quoteUsesApprovedPrice = Boolean(
    params.approvedQuote && !hasQuoteRelevantTripChanges(params.currentTripDetails, tripDetails),
  );
  const quote = quoteUsesApprovedPrice
    ? params.approvedQuote
    : maybeCreateQuoteSuggestion(tripDetails, params.configuration, missingFields);
  const quoteAutoApproved = Boolean(
    quote && !quoteUsesApprovedPrice && quote.pricing?.approvalRequired === false,
  );

  const bossInboxItems = createBossInboxItems({
    detectedEvents,
    quote,
    quoteApproved: quoteUsesApprovedPrice,
    quoteAutoApproved,
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
      quoteApproved: quoteUsesApprovedPrice,
      quoteAutoApproved,
      configuration: params.configuration,
      missingBookingFields,
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
      quoteApproved: quoteUsesApprovedPrice,
      quoteAutoApproved,
      missingBookingFields,
      configuration: params.configuration,
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
    quote,
    quoteAutoApproved,
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

/**
 * Keep low-information operational turns out of the full sales workflow.
 * These replies must be strict matches so a quote, address, or booking change
 * can never be swallowed by the conversational shortcut.
 */
export function getFastOperationalReply(message: string, lang: PromptLang): string | undefined {
  const compact = message.trim().replace(/\s+/gu, " ");
  if (!compact) return undefined;

  if (lang === "zh") {
    if (/^(?:谢谢|謝謝|多谢|多謝|感谢|感謝)(?:你|您)?[！!。.]?$/u.test(compact)) return "不客气。";
    if (/^(?:收到|好的|好|了解|明白|已知悉|没问题|沒問題|ok|okay)[！!。.]?$/iu.test(compact)) return "收到。";
    if (/^(?:稍后|稍後).{0,8}(?:确认|確認|告诉你|告訴你|通知你)[！!。.]?$/u.test(compact)) {
      return "好的，请确认后告诉我。";
    }
    if (/(?:航班前|起飞前|起飛前).{0,20}(?:联系|聯絡).{0,8}司机|联系.{0,8}司机/u.test(compact)) {
      return "收到，祝您旅途顺利！";
    }
    if (/^(?:你好|您好|嗨)[！!。.]?$/u.test(compact)) return "您好，请问有什么可以帮您？";
    return undefined;
  }

  if (lang === "ar") {
    if (/^(?:شكرا|شكرًا|ممتاز|حسنًا|حسنا|تم|موافق)[!.؟]?$/iu.test(compact)) return "على الرحب والسعة.";
    if (/^(?:سأؤكد|سوف أؤكد|سأخبرك).{0,24}(?:لاحقًا|لاحقا|بعد قليل)/iu.test(compact)) {
      return "حسنًا، أبلغني عند تأكيد الوقت.";
    }
    if (/^(?:مرحبا|مرحبًا|أهلا|أهلًا)[!.؟]?$/iu.test(compact)) return "مرحبًا، كيف يمكنني مساعدتك؟";
    return undefined;
  }

  if (/^hello!?$|^hi!?$|^hey!?$/iu.test(compact)) return "Hello! How can I help?";
  if (/\b(?:before|prior to) the flight\b.{0,60}\b(?:contact|get in touch with)\b.{0,20}\bdriver\b|\b(?:i['’]?ll|i will)\s+(?:contact|get in touch with)\s+(?:the\s+)?driver\b/iu.test(compact)) {
    return "Noted. Safe travels!";
  }
  if (/(?:\btime\b.{0,24}\b(?:confirm|let you know|tell you)\b|\b(?:confirm|let you know|tell you)\b.{0,24}\b(?:pickup\s+)?time\b).{0,14}\blater\b/iu.test(compact)) {
    return "Noted. Please confirm the pickup time when ready.";
  }
  if (/^(?:thanks?|thank you|thx)(?:\s+(?:so much|a lot))?[.! ,😊🙏]*$/iu.test(compact)) return "You're welcome!";
  if (/^(?:well\s+)?noted\s*,?\s*(?:thanks?|thank you|thx)[.! ,😊🙏]*$/iu.test(compact)) return "You're welcome!";
  if (/^(?:noted|well noted|okay|ok|got it|received|no problem)[.! ,😊🙏]*$/iu.test(compact)) return "Noted.";
  if (/^(?:[😊🙏👍👌❤❤️]\uFE0F?\s*)+$/u.test(compact)) return "Noted.";
  return undefined;
}

/**
 * Answers arrival-location questions from the last verified flight result.
 * This keeps the model out of a factual lookup that has already been done and
 * lets a customer ask the same meeting-point question again without another
 * provider request.
 */
export function getFastFlightArrivalReply(
  message: string,
  tripDetails: TripDetails,
  lang: PromptLang,
): string | undefined {
  const details = tripDetails.flightArrival;
  if (!details) return undefined;

  const arrivalQuestion = /\b(?:terminal|arrival lobby|arrivals lobby|arrival hall|meeting point|meet(?:ing)? the driver|after customs|customs)\b|航站楼|航廈|到达大厅|到達大廳|入境大厅|入境大廳|海关|海關|接机点|接機點|在哪里见司机|在哪裡見司機/iu.test(
    message,
  );
  if (!arrivalQuestion) return undefined;

  return formatFlightArrivalDetails(details, lang);
}

export function mergeTripDetails(
  current: TripDetails,
  message: string,
  extractedDetails?: TripDetails,
  options: { locationPrompted?: boolean } = {},
): TripDetails {
  const lower = message.toLowerCase();
  const extractedFields = Object.fromEntries(
    Object.entries(extractedDetails ?? {}).filter(
    ([key, value]) =>
      key !== "specialRequests" &&
      key !== "flightArrival" &&
      value !== undefined &&
      value !== null &&
      value !== "",
    ),
  ) as Partial<TripDetails>;
  // Persisted customer facts are authoritative. The model may fill an empty
  // field, but it cannot silently replace a confirmed route, date, passenger
  // count, or vehicle choice; deterministic parsing below handles explicit
  // customer corrections.
  const safeExtractedFields = Object.fromEntries(
    Object.entries(extractedFields).filter(([key]) => {
      const currentValue = current[key as keyof TripDetails];
      return currentValue === undefined || currentValue === null || currentValue === "";
    }),
  ) as Partial<TripDetails>;
  const labeledFields = extractLabeledTripFields(message);
  const next: TripDetails = { ...current, ...safeExtractedFields, ...labeledFields };
  if (extractedDetails?.specialRequests?.length) {
    next.specialRequests = Array.from(
      new Set([...(current.specialRequests ?? []), ...extractedDetails.specialRequests]),
    );
  }
  const itineraryPickup = message.match(/(?:接车地点|上车地点|接送地点|pickup(?:\s+location)?)[：:]\s*([^\n\r]+)/iu)?.[1];
  const itineraryDropoff = message.match(/(?:送达地点|下车地点|drop(?:-?off)?(?:\s+location)?)[：:]\s*([^\n\r]+)/iu)?.[1];
  const itineraryStops = message.match(/(?:计划景点|游览景点|路线景点|stops?|itinerary)[：:]\s*([^\n\r]+)/iu)?.[1];
  const itineraryPickupNormal = message.match(/(?:\u63a5\u8f66\u5730\u70b9|\u4e0a\u8f66\u5730\u70b9|\u63a5\u9001\u5730\u70b9|pickup(?:\s+location)?)[\uFF1A:]\s*([^\n\r]+)/iu)?.[1];
  const itineraryDropoffNormal = message.match(/(?:\u9001\u8fbe\u5730\u70b9|\u4e0b\u8f66\u5730\u70b9|drop(?:-?off)?(?:\s+location)?)[\uFF1A:]\s*([^\n\r]+)/iu)?.[1];
  const itineraryStopsNormal = message.match(/(?:\u8ba1\u5212\u666f\u70b9|\u6e38\u89c8\u666f\u70b9|\u8def\u7ebf\u666f\u70b9|stops?|itinerary)[\uFF1A:]\s*([^\n\r]+)/iu)?.[1];
  const normalStops = extractRouteStopsNormal(itineraryStopsNormal ?? itineraryStops);
  const extractedStops = normalStops.length > 0 ? normalStops : extractRouteStops(itineraryStops);
  if (itineraryPickup) next.pickupLocation = cleanText(itineraryPickup);
  if (itineraryDropoff && !/^客人的?酒店$|^the customer's? hotel$/iu.test(itineraryDropoff.trim())) {
    next.dropoffLocation = cleanText(itineraryDropoff);
  }
  if (extractedStops.length > 0) {
    next.routeStops = Array.from(new Set([...(next.routeStops ?? []), ...extractedStops]));
  }
  if (itineraryPickupNormal) next.pickupLocation = cleanText(itineraryPickupNormal);
  if (itineraryDropoffNormal && !/^(?:\u5ba2\u4eba\u7684?\u9152\u5e97|the customer's? hotel)$/iu.test(itineraryDropoffNormal.trim())) {
    next.dropoffLocation = cleanText(itineraryDropoffNormal);
  }
  const route = message.match(/(?:from\s+)?(.+?)\s+(?:to|->|→)\s+(.+?)(?=\s+(?:tomorrow|today|on|at|around|for|with|and\s+back|return(?:\s|$))|[.,!?]|$)/i);
  const returnRoute = message.match(/\breturn\s+from\s+(.+?)\s+to\s+(.+?)(?=\s+(?:tomorrow|today|on|at|around|for|with)|[.,!?]|$)/i);
  const chineseRoute = message.match(/(?:从|從|由)\s*(.+?)\s*(?:到|前往|去)\s*(.+?)(?=[，。,.]|$)/u);
  const fromOnly = message.match(/(?:collect\s+\w+\s+\w+\s+from|collect\s+\w+\s+from|from)\s+(.+?)(?:\s+at\s+|\s+on\s+|[.,]|$)/i);
  const travelingTo = message.match(/(?:traveling|travelling|going)\s+to\s+(.+?)(?:[.,]|$)/i);
  const dropOnly = message.match(/drop(?:\s|-)?off\s+(?:is|at|to)?\s*([a-z0-9\s'-]+)(?:[.,]|$)/i);
  const explicitDropoff = extractExplicitDropoffLocation(message);
  const pickupOnly = message.match(/pick(?:\s|-)?up\s+(?:is|at|from)?\s*([a-z0-9\s'-]+)(?:[.,]|$)/i);
  const uppercaseFlight = message.match(/\b[A-Z]{2}\s?\d{1,4}\b/);
  const labelledFlight = message.match(/\bflight(?:\s+number)?\s*(?:is|:)?\s*([a-z0-9]{2}\s?\d{1,4})\b/i);
  const flight = uppercaseFlight?.[0] ?? labelledFlight?.[1];
  const timePattern = /\b(?:[01]?\d|2[0-3])[:.][0-5]\d\s*(?:am|pm)?(?:\s*(?:-|–|to)\s*(?:[01]?\d|2[0-3])[:.][0-5]\d\s*(?:am|pm)?)?\b|\b\d{1,2}\s?(?:am|pm)\b/i;
  const outboundMessage = message.split(/\b(?:and\s+)?back\b|\breturn(?:\s+from)?\b/i)[0];
  const time = outboundMessage.match(timePattern);
  const returnTime = message.match(/\b(?:and\s+)?back\b.{0,40}?\b(\d{1,2}(?::[0-5]\d)?\s*(?:am|pm))\b/i)?.[1] ??
    message.match(/\breturn(?:\s+from)?\b.{0,40}?\b(\d{1,2}(?::[0-5]\d)?\s*(?:am|pm))\b/i)?.[1];
  const numberPattern = "\\d+|one|two|three|four|five|six|seven|eight|nine|ten";
  const chinesePassengersNormalValue = message.match(/(\d+)\s*(?:\u4f4d|\u540d|\u4eba)\s*(?:\u4e58\u5ba2|\u5ba2\u4eba)?/u);
  const chineseLuggageNormalValue = message.match(/(\d+)\s*(?:\u4ef6|\u4e2a)\s*(?:\u884c\u674e|\u7bb1\u5b50|\u7bb1)/u);
  const chinesePassengersNormal = message.match(/(\d+)\s*(?:位|名|人)\s*(?:乘客|客人)?/u);
  const chineseLuggageNormal = message.match(/(\d+)\s*(?:件|个)\s*(?:行李|箱子|箱)/u);
  const passengers = message.match(new RegExp(`\\b(${numberPattern})\\s*(?:passengers?|people|pax|persons?|adults?)\\b`, "i"));
  const luggage = message.match(new RegExp(`\\b(${numberPattern})\\s*(?:small|medium|large|sized|medium-sized|large-sized|small-sized|\\s|-)*(?:bags?|luggage|suitcases?)\\b`, "i"));
  const chinesePassengers = message.match(/(\d+)\s*(?:位|名|个|個)?\s*(?:乘客|客人|人)/u);
  const chineseLuggage = message.match(/(\d+)\s*(?:件|个|個)?\s*(?:行李箱|行李|箱)/u);
  const terminal = message.match(new RegExp(`\\bterminal\\s*(${numberPattern})\\b`, "i"));
  const luggageBreakdown = extractLuggageBreakdown(message);

  if (route) {
    next.pickupLocation = cleanRoutePickupLocation(route[1]);
    next.dropoffLocation = cleanText(route[2]);

    const pickupIsAirport = /airport|narita|haneda|kansai/i.test(next.pickupLocation);
    const dropoffIsAirport = /airport|narita|haneda|kansai/i.test(route[2]);
    if (pickupIsAirport && !dropoffIsAirport) next.serviceType = "airport_pickup";
    if (dropoffIsAirport && !pickupIsAirport) next.serviceType = "airport_dropoff";
    if (!pickupIsAirport && !dropoffIsAirport) next.serviceType = /\b(?:round trip|return|back)\b|往返|回程/iu.test(message) ? "round_trip" : "city_transfer";
  } else if (chineseRoute) {
    next.pickupLocation = cleanText(chineseRoute[1]);
    next.dropoffLocation = cleanText(chineseRoute[2]);

    const pickupIsAirport = /机场|機場|成田|羽田|关西|關西/u.test(chineseRoute[1]);
    const dropoffIsAirport = /机场|機場|成田|羽田|关西|關西/u.test(chineseRoute[2]);
    if (pickupIsAirport && !dropoffIsAirport) next.serviceType = "airport_pickup";
    if (dropoffIsAirport && !pickupIsAirport) next.serviceType = "airport_dropoff";
    if (!pickupIsAirport && !dropoffIsAirport) next.serviceType = /往返|回程|返回/u.test(message) ? "round_trip" : "city_transfer";
  }

  if (returnRoute) {
    next.returnPickupLocation = cleanText(returnRoute[1]);
    next.returnDropoffLocation = cleanText(returnRoute[2]);
    next.serviceType = "round_trip";
  } else if (next.pickupLocation && next.dropoffLocation && /\b(?:and\s+)?back\b|\breturn\b|往返|回程/iu.test(message)) {
    next.returnPickupLocation = next.dropoffLocation;
    next.returnDropoffLocation = next.pickupLocation;
    next.serviceType = "round_trip";
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
    const date = extractDateText(message);
    const chineseDate = message.match(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號]/u);
    if (date) next.date = date;
    else if (chineseDate) next.date = `${chineseDate[1] ? `${chineseDate[1]}年` : ""}${chineseDate[2]}月${chineseDate[3]}日`;
  }

  if (time) {
    next.time = normalizeTime(time[0]);
  }
  if (returnTime) next.returnTime = normalizeTime(returnTime);
  const charterHours = extractCharterHoursNormal(message) ?? extractCharterHours(message);
  if (charterHours !== undefined) next.charterHours = charterHours;
  if (flight) next.flightNumber = flight.toUpperCase().replace(/\s+/, " ");
  if (!flight && !extractedDetails?.flightNumber) {
    next.flightNumber = current.flightNumber;
    next.flightTime = current.flightTime;
  }
  if (passengers) next.passengerCount = parseNumberToken(passengers[1]);
  else if (chinesePassengersNormalValue) next.passengerCount = Number(chinesePassengersNormalValue[1]);
  else if (chinesePassengersNormal) next.passengerCount = Number(chinesePassengersNormal[1]);
  else if (chinesePassengers) next.passengerCount = Number(chinesePassengers[1]);
  if (luggageBreakdown) {
    const isAdditionalLuggage = /\b(?:more|extra|additional)\b|再|多|额外|額外/u.test(lower);
    const currentBreakdown = current.luggageBreakdown;
    const combined = isAdditionalLuggage && currentBreakdown
      ? addLuggageBreakdowns(currentBreakdown, luggageBreakdown)
      : luggageBreakdown;
    next.luggageBreakdown = combined;
    next.luggageCount = combined.total;
  } else if (luggage) next.luggageCount = parseNumberToken(luggage[1]);
  else if (chineseLuggageNormalValue) next.luggageCount = Number(chineseLuggageNormalValue[1]);
  else if (chineseLuggageNormal) next.luggageCount = Number(chineseLuggageNormal[1]);
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

  const charterIntent = /\b(?:private\s+charter|charter|day\s+tour|hourly\s+(?:hire|charter)|private\s+driver)\b|[\u5305\u8f66\u5305\u8eca\u6e38\u89c8\u666f\u70b9\u5305\u8f66\u8ba2\u5355\u6309\u5c0f\u65f6\u591a\u4e2a\u666f\u70b9]/iu.test(message);
  if (charterIntent) next.serviceType = "day_tour";

  return normalizeTripDetails({ ...next, ...labeledFields });
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

  const workflowQuote = calculateWorkflowQuote(tripDetails, configuration);
  if (workflowQuote) {
    return {
      id: `quote_${Date.now()}`,
      serviceType: tripDetails.serviceType,
      suggestedPrice: workflowQuote.priceYen,
      currency: configuration.pricingPolicy?.currency ?? "JPY",
      vehicleType: workflowQuote.vehicleType,
      includedFees: ["Tolls", "Parking fees", "Taxes"],
      routeDistanceKm: tripDetails.routeDistanceKm,
      estimatedDriveTimeMinutes: tripDetails.estimatedDriveTimeMinutes,
      reason: workflowQuote.reason,
      confidence: workflowQuote.pricing.confidence,
      missingFields,
      approvalSource: workflowQuote.pricing.approvalRequired ? undefined : "pricing_policy",
      pricing: workflowQuote.pricing,
    };
  }

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

function hasQuoteRelevantTripChanges(current: TripDetails, next: TripDetails): boolean {
  const fields: Array<keyof TripDetails> = [
    "serviceType",
    "pickupLocation",
    "dropoffLocation",
    "airport",
    "terminal",
    "date",
    "time",
    "flightNumber",
    "passengerCount",
    "luggageCount",
    "luggageBreakdown",
    "vehiclePreference",
    "returnPickupLocation",
    "returnDropoffLocation",
    "returnTime",
    "charterHours",
    "routeStops",
  ];

  return fields.some((field) => {
    if (field === "luggageBreakdown") {
      return JSON.stringify(current[field]) !== JSON.stringify(next[field]);
    }
    return current[field] !== next[field];
  });
}

function createBossInboxItems(params: {
  detectedEvents: DetectedEvent[];
  quote?: QuoteSuggestion;
  quoteApproved: boolean;
  quoteAutoApproved: boolean;
  tripDetails: TripDetails;
  existingBossItems: ExistingBossInboxItem[];
  ownerApprovalEventTypes: Set<EventType>;
  createdAt: string;
}): BossInboxItem[] {
  const existingActiveTypes = new Set(
    params.existingBossItems
      .filter((item) => ["pending", "approved", "edited"].includes(item.status))
      .map((item) => item.event?.eventType ?? item.type),
  );

  const existingQuoteNeedsReview = params.existingBossItems.some(
    (item) => item.type === "quote_approval" && ["pending", "edited"].includes(item.status),
  );

  const eventItems = params.detectedEvents
    .filter((event) => params.ownerApprovalEventTypes.has(event.eventType))
    .filter((event) => !existingActiveTypes.has(event.eventType))
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
    params.quote && !params.quoteApproved && !params.quoteAutoApproved && !existingQuoteNeedsReview
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
  missingBookingFields: TripFieldKey[];
  quote?: QuoteSuggestion;
  quoteApproved: boolean;
  quoteAutoApproved: boolean;
  configuration: BusinessConfiguration;
  lang: PromptLang;
  createdAt: string;
}): ConversationMessage {
  const purchaseIntent = hasPurchaseIntent(params.customerMessage);
  const eventTypes = new Set(params.detectedEvents.map((event) => event.eventType));
  const nextBookingField = params.missingBookingFields[0];
  const eventText =
    params.detectedEvents.length > 0
      ? params.lang === "zh"
        ? " 这项请求需要业务决定，我已提交老板审核。"
        : " I have flagged this for owner review because it needs a business decision."
      : "";
  let text: string;

  if (eventTypes.has("Payment Coordination") && hasPaymentIntent(params.customerMessage)) {
    text = params.lang === "zh"
      ? "通常在服务完成后现金支付给司机；如需 PayPal，请告诉我。"
      : "Payment is normally made in cash to the driver after the transfer. PayPal can be arranged separately.";
  } else if (eventTypes.has("Driver Assignment Needed")) {
    text = params.lang === "zh"
      ? "我会在司机确认后发送司机姓名、车辆和联系方式。"
      : "I will send the driver's name, vehicle and contact details once they are confirmed.";
  } else if (eventTypes.has("Early Pickup Request") || eventTypes.has("Pickup Time Change")) {
    text = params.lang === "zh"
      ? "我先和司机确认新的接送时间，确认后马上回复您。"
      : "I will check the new pickup time with the driver and reply once it is confirmed.";
  } else if (eventTypes.has("Round Trip Discount") || eventTypes.has("Multi-leg Itinerary Request")) {
    text = params.lang === "zh"
      ? "我会把去程和回程分别记录，并提交车辆和价格安排审核。"
      : "I will record the outbound and return legs separately and check the vehicle and pricing arrangements.";
  } else if (eventTypes.has("Discount Request")) {
    const quoteText = params.quote
      ? `${formatCustomerQuoteNotice(params.lang, params.quote, { approved: params.quoteApproved, autoApproved: params.quoteAutoApproved })} `
      : "";
    text = params.lang === "zh"
      ? `${quoteText}我会为您申请特别现金价格，确认后回复您。${eventText}`
      : `${quoteText}I will check whether a special cash rate is available and get back to you.${eventText}`;
  } else if (hasBookingConfirmationIntent(params.customerMessage)) {
    if (nextBookingField) {
      text = params.lang === "zh"
        ? `我已记下您的预订意向。请提供${fieldLabelsZh[nextBookingField]}，我就可以继续安排。`
        : `I have noted your booking request. Please provide the ${fieldLabels[nextBookingField]} so I can continue.`;
    } else if (params.quote) {
      text = params.lang === "zh"
        ? `我已记下您的确认请求。${formatCustomerQuoteNotice(params.lang, params.quote, { approved: params.quoteApproved, autoApproved: params.quoteAutoApproved })}`
        : `I have noted your booking request. ${formatCustomerQuoteNotice(params.lang, params.quote, { approved: params.quoteApproved, autoApproved: params.quoteAutoApproved })}`;
    } else {
      text = params.lang === "zh" ? "我已记下您的预订请求，会继续为您安排。" : "I have noted your booking request and will continue arranging it.";
    }
  } else if (params.contact && params.quote) {
    text = params.lang === "zh"
      ? `谢谢，已记录您的${params.contact.method}联系方式。${formatCustomerQuoteNotice(params.lang, params.quote, { approved: params.quoteApproved, autoApproved: params.quoteAutoApproved })}${eventText}`
      : `Thanks, I have saved your ${params.contact.method}. ${formatCustomerQuoteNotice(params.lang, params.quote, { approved: params.quoteApproved, autoApproved: params.quoteAutoApproved })}${eventText}`;
  } else if (params.contact) {
    text = params.lang === "zh"
      ? `谢谢，已记录您的${params.contact.method}联系方式。`
      : `Thanks, I have saved your ${params.contact.method}.`;
  } else if (params.quote) {
    const followUp = nextBookingField
      ? params.lang === "zh"
        ? ` 请提供${fieldLabelsZh[nextBookingField]}。`
        : ` Please provide the ${fieldLabels[nextBookingField]}.`
      : "";
    text = params.lang === "zh"
      ? `${formatCustomerQuoteNotice(params.lang, params.quote, { approved: params.quoteApproved, autoApproved: params.quoteAutoApproved })}${followUp}${eventText}`
      : `${formatCustomerQuoteNotice(params.lang, params.quote, { approved: params.quoteApproved, autoApproved: params.quoteAutoApproved })}${followUp}${eventText}`;
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

function hasPaymentIntent(message: string): boolean {
  const paymentTerms = /\b(?:pay|payment|paid|paypal|visa|credit card|cash)\b|付款|支付|刷卡|现金|現金/iu;
  if (/[?？]/u.test(message)) return paymentTerms.test(message);
  return /\b(?:paypal|visa|credit card)\b|\b(?:i\s+have\s+paid|payment\s+has\s+been\s+completed)\b|已付款|已支付/iu.test(message);
}

function hasBookingConfirmationIntent(message: string): boolean {
  return /\b(?:confirm(?: the)? booking|confirm(?: the)? reservation|book it|reserve it|make the booking|schedule both|go ahead|yes,?\s*(?:please\s*)?(?:confirm|book|reserve))\b|(?:确认|確認|预订|預訂|安排预订|安排預訂)/iu.test(message);
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

function extractRouteStopsNormal(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\u3001,\uFF0C;\uFF1B|]/u)
    .map((stop) => stop.trim())
    .filter((stop) => stop.length >= 2 && !/\u5982\u65f6\u95f4\u5141\u8bb8|\u5982\u6709\u65f6\u95f4|if time permits|if possible/iu.test(stop));
}

function extractRouteStops(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[、,，;；|]/u)
    .map((stop) => stop.trim())
    .filter((stop) => stop.length >= 2 && !/如时间允许|如有时间|if time permits|if possible/iu.test(stop));
}

function extractCharterHoursNormal(message: string): number | undefined {
  const matches = Array.from(message.matchAll(/(?:(\u4e0a\u5348|\u4e0b\u5348|\u665a\u4e0a|\u65e9\u4e0a|\u51cc\u6668)\s*)?([01]?\d|2[0-3])(?::([0-5]\d))\s*(am|pm)?/giu));
  if (matches.length < 2) return undefined;

  const toMinutes = (match: RegExpMatchArray): number => {
    const meridiem = (match[1] ?? match[4] ?? "").toLowerCase();
    let hour = Number(match[2]);
    const minute = Number(match[3] ?? 0);
    if ((meridiem === "pm" || meridiem === "\u4e0b\u5348" || meridiem === "\u665a\u4e0a") && hour < 12) hour += 12;
    if ((meridiem === "am" || meridiem === "\u4e0a\u5348" || meridiem === "\u65e9\u4e0a" || meridiem === "\u51cc\u6668") && hour === 12) hour = 0;
    return hour * 60 + minute;
  };

  const start = toMinutes(matches[0]);
  const end = toMinutes(matches[1]);
  const duration = end >= start ? end - start : end + 24 * 60 - start;
  return duration > 0 ? Math.round((duration / 60) * 10) / 10 : undefined;
}

function extractCharterHours(message: string): number | undefined {
  const matches = Array.from(message.matchAll(/(?:(上午|下午|晚上|早上|凌晨)\s*)?([01]?\d|2[0-3])(?::([0-5]\d))\s*(am|pm)?/giu));
  if (matches.length < 2) return undefined;

  const toMinutes = (match: RegExpMatchArray): number => {
    const meridiem = (match[1] ?? match[4] ?? "").toLowerCase();
    let hour = Number(match[2]);
    const minute = Number(match[3] ?? 0);
    if ((meridiem === "pm" || meridiem === "下午" || meridiem === "晚上") && hour < 12) hour += 12;
    if ((meridiem === "am" || meridiem === "上午" || meridiem === "早上" || meridiem === "凌晨") && hour === 12) hour = 0;
    return hour * 60 + minute;
  };

  const start = toMinutes(matches[0]);
  const end = toMinutes(matches[1]);
  const duration = end >= start ? end - start : end + 24 * 60 - start;
  return duration > 0 ? Math.round((duration / 60) * 10) / 10 : undefined;
}

function extractLuggageBreakdown(message: string): TripDetails["luggageBreakdown"] {
  const numberPattern = "\\d+|one|two|three|four|five|six|seven|eight|nine|ten";
  const read = (pattern: RegExp): number | undefined => {
    const match = message.match(pattern);
    return match?.[1] ? parseNumberToken(match[1]) : undefined;
  };
  const large = read(new RegExp(`\\b(${numberPattern})\\s*(?:pieces?\\s+of\\s+)?(?:large|big)(?:[- ]sized)?\\s*(?:bags?|luggage|suitcases?)?\\b`, "i")) ??
    read(new RegExp(`(?:大件|大)\\s*(\\d+)|(?:大件|大)\\s*(?:行李)?\\s*(\\d+)`, "iu"));
  const medium = read(new RegExp(`\\b(${numberPattern})\\s*(?:pieces?\\s+of\\s+)?medium(?:[- ]sized)?\\s*(?:bags?|luggage|suitcases?)?\\b`, "i")) ??
    read(new RegExp(`(?:中件|中)\\s*(\\d+)|(?:中件|中)\\s*(?:行李)?\\s*(\\d+)`, "iu"));
  const small = read(new RegExp(`\\b(${numberPattern})\\s*(?:pieces?\\s+of\\s+)?small(?:[- ]sized)?\\s*(?:bags?|luggage|suitcases?)?\\b`, "i")) ??
    read(new RegExp(`(?:小件|小)\\s*(\\d+)|(?:小件|小)\\s*(?:行李)?\\s*(\\d+)`, "iu"));
  const carryOn = read(new RegExp(`\\b(${numberPattern})\\s*(?:pieces?\\s+of\\s+)?(?:carry[- ]?on|hand)\\s*(?:bags?|luggage)?\\b`, "i")) ??
    read(new RegExp(`(?:手提|随身|隨身)\\s*(?:行李)?\\s*(\\d+)`, "iu"));
  const backpack = read(new RegExp(`\\b(${numberPattern})\\s*(?:pieces?\\s+of\\s+)?backpacks?\\b`, "i")) ??
    read(new RegExp(`(?:背包)\\s*(\\d+)`, "iu"));

  const values = [large, medium, small, carryOn, backpack].filter((value): value is number => value !== undefined);
  if (values.length === 0) return undefined;

  return {
    ...(large === undefined ? {} : { large }),
    ...(medium === undefined ? {} : { medium }),
    ...(small === undefined ? {} : { small }),
    ...(carryOn === undefined ? {} : { carryOn }),
    ...(backpack === undefined ? {} : { backpack }),
    total: values.reduce((sum, value) => sum + value, 0),
  };
}

function addLuggageBreakdowns(
  current: NonNullable<TripDetails["luggageBreakdown"]>,
  added: NonNullable<TripDetails["luggageBreakdown"]>,
): NonNullable<TripDetails["luggageBreakdown"]> {
  return {
    large: (current.large ?? 0) + (added.large ?? 0),
    medium: (current.medium ?? 0) + (added.medium ?? 0),
    small: (current.small ?? 0) + (added.small ?? 0),
    carryOn: (current.carryOn ?? 0) + (added.carryOn ?? 0),
    backpack: (current.backpack ?? 0) + (added.backpack ?? 0),
    total: current.total + added.total,
  };
}

function cleanText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[，。！？,.!?]+$/u, "")
    .replace(/\bthe\b$/i, "")
    .trim();
}

function cleanRoutePickupLocation(value: string): string {
  const fromLocation = value.match(/\bfrom\s+(.+)$/i)?.[1];
  const withoutQuestionPrefix = (fromLocation ?? value).replace(/^(?:hello\s*,?\s*|if\s+|how\s+much\s+is\s+|what(?:'s| is)\s+the\s+price\s+for\s+|please\s+quote\s+)/i, "");
  return cleanText(withoutQuestionPrefix);
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
