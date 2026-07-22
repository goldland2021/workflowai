import type { TripDetails, EventType, BossInboxType, ConversationMessage } from "../types";
import type { PromptLang } from "../../ai/prompts/templates";

/**
 * Structured evaluation cases for the conversation engine.
 *
 * Each case asserts on the STRUCTURED outcome of `analyzeCustomerTurn`
 * (extracted trip fields, detected events, whether a quote / Boss Inbox item
 * is produced, reply language) rather than on the exact reply wording. Reply
 * text will change during the refactor, but the structured decisions must stay
 * correct.
 *
 * mode:
 *  - "regression": behavior the system already gets right and MUST keep.
 *    Hard-asserted; a failure fails the build.
 *  - "aspiration": behavior we WANT after the orchestration refactor. Scored
 *    into a baseline report but does not fail the build yet. As the refactor
 *    lands, cases graduate from "aspiration" to "regression".
 */
export type EvalMode = "regression" | "aspiration";

export interface EvalExpectation {
  tripEquals?: Partial<TripDetails>;
  tripPresent?: (keyof TripDetails)[];
  tripAbsent?: (keyof TripDetails)[];
  eventsInclude?: EventType[];
  eventsExclude?: EventType[];
  quote?: boolean;
  bossInboxIncludes?: BossInboxType[];
  contactCaptured?: boolean;
  replyLang?: PromptLang;
}

export interface EvalCase {
  id: string;
  mode: EvalMode;
  lang: PromptLang;
  about: string;
  currentTripDetails?: TripDetails;
  recentMessages?: ConversationMessage[];
  message: string;
  expect: EvalExpectation;
}

function customerTurn(text: string): ConversationMessage {
  return { id: `h_${Math.random().toString(36).slice(2)}`, role: "customer", text, createdAt: "", channel: "website_widget" };
}
function aiTurn(text: string): ConversationMessage {
  return { id: `h_${Math.random().toString(36).slice(2)}`, role: "ai", text, createdAt: "", channel: "website_widget" };
}

export const conversationEvals: EvalCase[] = [
  // Regression: things the current engine already handles.
  {
    id: "zh-thanks",
    mode: "regression",
    lang: "zh",
    about: "纯道谢应短促收尾,不重复报价/路线",
    message: "谢谢",
    expect: { replyLang: "zh", quote: false, eventsExclude: ["Payment Coordination"] },
  },
  {
    id: "en-thanks",
    mode: "regression",
    lang: "en",
    about: "Plain thanks gets a short acknowledgement",
    message: "thanks!",
    expect: { replyLang: "en", quote: false },
  },
  {
    id: "en-full-route-quote",
    mode: "regression",
    lang: "en",
    about: "Complete airport route yields extraction + a quote",
    message: "Pickup from Narita Airport to City Hotel tomorrow at 18:30, 2 passengers, 3 bags",
    expect: {
      tripEquals: { passengerCount: 2 },
      tripPresent: ["pickupLocation", "dropoffLocation", "date", "time"],
      quote: true,
    },
  },
  {
    id: "en-future-date-not-urgent",
    mode: "regression",
    lang: "en",
    about: "An ordinary future date must NOT be flagged Urgent Booking",
    message: "I need a transfer next Friday from Haneda to Shibuya, 2 people",
    expect: { eventsExclude: ["Urgent Booking"] },
  },
  {
    id: "en-quote-email-not-receipt",
    mode: "regression",
    lang: "en",
    about: "Asking to email a quote is NOT a Receipt Request",
    message: "Can you email the quote to me?",
    expect: { eventsExclude: ["Receipt Request"] },
  },
  {
    id: "en-first-route-not-change",
    mode: "regression",
    lang: "en",
    about: "Providing a route for the first time is not a Route Change",
    message: "from Narita to the Prince Hotel, 2 pax",
    expect: { eventsExclude: ["Route Change", "Pickup Time Change"] },
  },
  {
    id: "en-discount-event",
    mode: "regression",
    lang: "en",
    about: "Explicit discount ask raises a Discount Request",
    message: "That's a bit too expensive, any discount for cash?",
    expect: { eventsInclude: ["Discount Request"] },
  },

  // Aspiration: what the refactor should make smart.
  {
    id: "zh-passengers-luggage",
    mode: "aspiration",
    lang: "zh",
    about: "中文人数/行李 + 无「从」前缀的路线抽取",
    message: "成田机场到新宿华盛顿酒店,明天下午6点,3位乘客,4件行李",
    expect: { tripEquals: { passengerCount: 3, luggageCount: 4 }, tripPresent: ["dropoffLocation"] },
  },
  {
    id: "zh-bare-hotel-after-prompt",
    mode: "aspiration",
    lang: "zh",
    about: "上一轮问了酒店,这轮只回酒店名,应写入 dropoff 而非再次追问",
    currentTripDetails: { serviceType: "airport_pickup", airport: "Narita", flightNumber: "CA167", passengerCount: 2 },
    recentMessages: [customerTurn("成田接机,2人"), aiTurn("好的,请问送到哪家酒店?")],
    message: "东京湾洲际酒店",
    expect: { tripPresent: ["dropoffLocation"] },
  },
  {
    id: "en-flight-plus-hotel-estimate",
    mode: "aspiration",
    lang: "en",
    about: "Flight number + hotel should be enough to estimate without asking exact pickup point",
    message: "Arriving on NH812, going to the Tokyo Station Hotel, 2 of us with 2 suitcases",
    expect: { tripPresent: ["flightNumber", "dropoffLocation"], quote: true },
  },
  {
    id: "en-context-change-time",
    mode: "aspiration",
    lang: "en",
    about: "After a booked pickup time, moving it earlier is a Pickup Time Change",
    currentTripDetails: { serviceType: "airport_dropoff", pickupLocation: "Prince Hotel", dropoffLocation: "Haneda", date: "Tomorrow", time: "09:00", passengerCount: 2 },
    recentMessages: [aiTurn("Your pickup is confirmed for 09:00.")],
    message: "Actually can the driver come at 7:30 instead?",
    expect: { eventsInclude: ["Pickup Time Change"] },
  },
  {
    id: "ar-greeting",
    mode: "aspiration",
    lang: "ar",
    about: "Arabic greeting should be answered in Arabic",
    message: "مرحبا، أحتاج سيارة من مطار ناريتا إلى فندق في طوكيو",
    expect: { replyLang: "ar", tripPresent: ["dropoffLocation"] },
  },
  {
    id: "ar-passengers",
    mode: "aspiration",
    lang: "ar",
    about: "Arabic passenger/luggage extraction",
    message: "من هانيدا إلى شينجوكو، 4 ركاب و5 حقائب، غدًا الساعة 10 صباحًا",
    expect: { replyLang: "ar", tripEquals: { passengerCount: 4 } },
  },
  {
    id: "en-multi-leg-daytour",
    mode: "aspiration",
    lang: "en",
    about: "Multi-stop day tour should be recognized as a charter/day tour with stops",
    message: "We want a private charter for a day tour: hotel, then Mt Fuji, then Hakone, then back. 4 people.",
    expect: { tripEquals: { serviceType: "day_tour" }, tripPresent: ["routeStops"] },
  },
  {
    id: "zh-round-trip",
    mode: "aspiration",
    lang: "zh",
    about: "往返行程应识别为 round_trip",
    message: "羽田机场到镰仓,当天再回羽田,2人3件行李",
    expect: { tripEquals: { serviceType: "round_trip" } },
  },
  {
    id: "en-payment-question",
    mode: "aspiration",
    lang: "en",
    about: "Payment method question answered from policy, not a fabricated promise",
    message: "How do I pay? Can I use PayPal?",
    expect: { replyLang: "en" },
  },
  {
    id: "zh-waiting-policy-faq",
    mode: "aspiration",
    lang: "zh",
    about: "等待政策类问题应直接从 FAQ/配置回答",
    message: "航班落地后你们会等多久?",
    expect: { replyLang: "zh", quote: false },
  },
  {
    id: "en-contact-capture",
    mode: "aspiration",
    lang: "en",
    about: "A shared WhatsApp number should be captured as contact",
    currentTripDetails: { serviceType: "airport_pickup", pickupLocation: "Narita Airport", dropoffLocation: "City Hotel", passengerCount: 2, date: "Tomorrow", time: "18:00" },
    message: "My WhatsApp is +81 90 1234 5678, please send updates there",
    expect: { contactCaptured: true },
  },
  {
    id: "en-complaint",
    mode: "aspiration",
    lang: "en",
    about: "A complaint must escalate to the owner, not be smoothed over by the AI",
    message: "The driver was 30 minutes late yesterday and I'm not happy about it.",
    expect: { eventsInclude: ["Complaint"], bossInboxIncludes: ["event_review"] },
  },
  {
    id: "en-cancellation",
    mode: "aspiration",
    lang: "en",
    about: "Cancellation must escalate, never auto-confirm a refund",
    message: "I need to cancel my booking and get a refund.",
    expect: { eventsInclude: ["Cancellation Request"] },
  },
  {
    id: "zh-vague-price-ask",
    mode: "aspiration",
    lang: "zh",
    about: "信息不全时询价,应引导补齐关键字段而非编造价格",
    message: "去富士山大概多少钱?",
    expect: { replyLang: "zh", quote: false },
  },
  {
    id: "en-ack-no-repeat",
    mode: "aspiration",
    lang: "en",
    about: "A bare acknowledgement after a quote must not repeat the whole quote/route",
    currentTripDetails: { serviceType: "airport_pickup", pickupLocation: "Narita Airport", dropoffLocation: "City Hotel", passengerCount: 2, date: "Tomorrow", time: "18:00" },
    recentMessages: [aiTurn("The provisional estimate is JPY 25,000 with an Alphard.")],
    message: "ok got it, thanks",
    expect: { replyLang: "en", quote: false },
  },
];
