import { describe, expect, it, vi } from "vitest";

// Keep these business-rule tests deterministic even when a developer has a
// real LLM configured in the shell running Vitest.
vi.mock("../ai/client", () => ({
  hasRealAI: false,
  generateStructured: vi.fn(async () => {
    throw new Error("LLM is disabled for deterministic tests.");
  }),
  generateReply: vi.fn(async () => {
    throw new Error("LLM is disabled for deterministic tests.");
  }),
}));

import { analyzeCustomerTurn, filterDetectedEventsForMessage, getFastFaqReply } from "./ai-workflow";
import { airportTransferConfiguration } from "./airport-transfer";
import type { DetectedEvent, TripDetails } from "./types";
import { replyLanguageMatches } from "../ai/reply";

// These tests exercise the rule-based fallback path (no LLM env vars are set
// in the test environment, so `hasRealAI` is false and analyzeCustomerTurn
// runs deterministically without network calls).

const completeTripDetails: TripDetails = {
  serviceType: "airport_pickup",
  pickupLocation: "Narita Airport",
  dropoffLocation: "City Hotel",
  date: "Tomorrow",
  time: "18:30",
  passengerCount: 2,
};

describe("getFastFaqReply", () => {
  it("answers configured Chinese policy questions without an LLM call", () => {
    expect(getFastFaqReply("司机可以等待多久？", airportTransferConfiguration)).toBe(
      "标准等待时间为航班降落后 60 分钟。",
    );
  });

  it("answers included-fee questions without confirming a final price", () => {
    const answer = getFastFaqReply("报价是否包含高速费和停车费？", airportTransferConfiguration);
    expect(answer).toContain("老板确认");
    expect(answer).toContain("最终以老板批准的报价为准");
  });

  it("does not intercept non-Chinese or commercial event messages", () => {
    expect(getFastFaqReply("How long can the driver wait?", airportTransferConfiguration)).toBeUndefined();
    expect(getFastFaqReply("我已经付款，请确认。", airportTransferConfiguration)).toBeUndefined();
  });

  it("does not trust a stale FAQ id after the owner changes its content", () => {
    const editedConfiguration = {
      ...airportTransferConfiguration,
      faq: [
        {
          id: "faq_waiting",
          question: "可以安排哪些包车服务？",
          answer: "机场接送和私人包车。",
        },
      ],
    };

    expect(getFastFaqReply("司机可以等待多久？", editedConfiguration)).toBeUndefined();
  });
});

describe("analyzeCustomerTurn - quote suggestion rules", () => {
  it("does not suggest a quote while required trip fields are missing", async () => {
    const result = await analyzeCustomerTurn({
      message: "Hi, how much for an airport pickup?",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.bossInboxItems.some((item) => item.type === "quote_approval")).toBe(false);
  });

  it("suggests a quote as a pending owner decision once trip fields are complete, never auto-approved", async () => {
    const result = await analyzeCustomerTurn({
      message: "That works for me.",
      currentTripDetails: completeTripDetails,
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    const quoteItem = result.bossInboxItems.find((item) => item.type === "quote_approval");
    expect(quoteItem).toBeDefined();
    expect(quoteItem?.status).toBe("pending");
    expect(quoteItem?.quote?.suggestedPrice).toBeGreaterThan(0);
    expect(result.aiMessage.text.replace(/,/g, "")).toContain(String(quoteItem?.quote?.suggestedPrice));
    expect(result.aiMessage.text).toMatch(/初步报价|老板确认|preliminary|owner confirmation/iu);
  });

  it("does not duplicate a quote approval item when one is already pending", async () => {
    const result = await analyzeCustomerTurn({
      message: "That works for me.",
      currentTripDetails: completeTripDetails,
      configuration: airportTransferConfiguration,
      existingBossItems: [{ status: "pending", type: "quote_approval" }],
    });

    expect(result.bossInboxItems.some((item) => item.type === "quote_approval")).toBe(false);
  });

  it("uses an owner-approved quote on later customer turns without reopening approval", async () => {
    const result = await analyzeCustomerTurn({
      message: "Can you confirm the quote?",
      currentTripDetails: completeTripDetails,
      approvedQuote: {
        id: "quote-approved",
        serviceType: "airport_pickup",
        suggestedPrice: 78,
        currency: "USD",
        vehicleType: "Toyota Alphard",
        includedFees: ["Tolls", "Parking fees", "Taxes"],
        reason: "Owner-approved quote",
        confidence: 100,
        missingFields: [],
      },
      existingBossItems: [{ status: "approved", type: "quote_approval" }],
      configuration: airportTransferConfiguration,
    });

    expect(result.aiMessage.text).toMatch(/老板已确认|owner has confirmed/iu);
    expect(result.aiMessage.text).toContain("USD 78");
    expect(result.bossInboxItems.some((item) => item.type === "quote_approval")).toBe(false);
  });
});

describe("analyzeCustomerTurn - event detection escalates, never decides", () => {
  it("flags a discount request for owner review without approving it", async () => {
    const result = await analyzeCustomerTurn({
      message: "This is too expensive, can I get a discount?",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.detectedEvents.some((event) => event.eventType === "Discount Request")).toBe(true);

    const discountItem = result.bossInboxItems.find(
      (item) => item.event?.eventType === "Discount Request",
    );
    expect(discountItem).toBeDefined();
    expect(discountItem?.status).toBe("pending");
  });

  it("flags a cancellation request for owner review instead of confirming it", async () => {
    const result = await analyzeCustomerTurn({
      message: "I need to cancel my booking, please refund me.",
      currentTripDetails: completeTripDetails,
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    const cancelItem = result.bossInboxItems.find(
      (item) => item.event?.eventType === "Cancellation Request",
    );
    expect(cancelItem).toBeDefined();
    expect(cancelItem?.status).toBe("pending");
  });
});

describe("event validation guards high-risk false positives", () => {
  const event = (eventType: DetectedEvent["eventType"]): DetectedEvent => ({
    id: `event-${eventType}`,
    eventType,
    summary: "model output",
    suggestedOwnerAction: "review",
    severity: "medium",
    status: "pending",
  });

  it("does not treat an ordinary future transfer as urgent", () => {
    const events = filterDetectedEventsForMessage(
      "Transfer on July 20 from Narita to Shinjuku",
      [event("Urgent Booking")],
    );

    expect(events).toEqual([]);
  });

  it("does not treat emailing a quote as a receipt request", () => {
    const events = filterDetectedEventsForMessage(
      "Please send the quote to jane@example.com",
      [event("Receipt Request")],
    );

    expect(events).toEqual([]);
  });

  it("keeps explicit urgent and receipt requests", () => {
    expect(filterDetectedEventsForMessage("I need a pickup today, it is urgent", [event("Urgent Booking")])).toHaveLength(1);
    expect(filterDetectedEventsForMessage("Please issue an invoice", [event("Receipt Request")])).toHaveLength(1);
  });
});

describe("analyzeCustomerTurn - contact capture timing", () => {
  it("does not ask for contact info on a neutral message with no purchase intent", async () => {
    const result = await analyzeCustomerTurn({
      message: "Hello",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.aiMessage.text).not.toMatch(/WhatsApp|Telegram|email/i);
  });

  it("asks for contact info once purchase intent appears", async () => {
    const result = await analyzeCustomerTurn({
      message: "What's the price for an airport pickup tomorrow?",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.aiMessage.text).toMatch(/WhatsApp|Telegram|email/i);
  });

  it("extracts a contact method the customer provides directly", async () => {
    const result = await analyzeCustomerTurn({
      message: "You can reach me at jane@example.com",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.contact).toEqual({ method: "Email", value: "jane@example.com" });
  });
});

describe("analyzeCustomerTurn - multi-turn trip state", () => {
  it("keeps earlier trip fields when the next customer turn adds more details", async () => {
    const firstTurn = await analyzeCustomerTurn({
      message: "Please take us from Narita Airport to city hotel with 2 passengers",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    const secondTurn = await analyzeCustomerTurn({
      message: "Tomorrow at 18:30",
      currentTripDetails: firstTurn.tripDetails,
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(secondTurn.tripDetails.pickupLocation).toBe("Narita Airport");
    expect(secondTurn.tripDetails.passengerCount).toBe(2);
    expect(secondTurn.tripDetails.dropoffLocation).toBe("city hotel");
    expect(secondTurn.tripDetails.time).toBe("18:30");
  });

  it("extracts a complete English airport route without depending on model output", async () => {
    const result = await analyzeCustomerTurn({
      message: "Private transfer from Narita Airport Terminal 1 to Shinjuku on July 20 at 3:00 PM for 2 passengers with 2 suitcases",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails).toMatchObject({
      serviceType: "airport_pickup",
      pickupLocation: "Narita Airport Terminal 1",
      dropoffLocation: "Shinjuku",
      airport: "Narita",
      terminal: "Terminal 1",
      date: "July 20",
      time: "3:00 PM",
      passengerCount: 2,
      luggageCount: 2,
    });
    expect(result.tripDetails.flightNumber).toBeUndefined();
    expect(result.tripDetails.flightTime).toBeUndefined();
  });

  it("extracts Chinese route, date, passenger, luggage, airport, and vehicle fields", async () => {
    const result = await analyzeCustomerTurn({
      message: "你好，我想在8月15日安排5位乘客从成田机场到东京新宿酒店，有4件行李，想要阿尔法，可以吗？",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails).toMatchObject({
      serviceType: "airport_pickup",
      pickupLocation: "成田机场",
      dropoffLocation: "东京新宿酒店",
      airport: "Narita",
      date: "8月15日",
      passengerCount: 5,
      luggageCount: 4,
      vehiclePreference: "丰田阿尔法",
    });
  });

  it("captures an explicitly supplied hotel address as the drop-off location", async () => {
    const result = await analyzeCustomerTurn({
      message: "My hotel address is 1-2-3 Shinjuku, Tokyo.",
      currentTripDetails: {
        serviceType: "airport_pickup",
        pickupLocation: "Narita Airport",
        date: "Tomorrow",
        time: "10:00",
        passengerCount: 2,
      },
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails.dropoffLocation).toBe("1-2-3 Shinjuku, Tokyo");
    expect(result.aiMessage.text).not.toMatch(/drop-off location/i);
  });

  it("captures a Chinese hotel address instead of asking for it again", async () => {
    const result = await analyzeCustomerTurn({
      message: "酒店地址是东京都新宿区西新宿2-8-1。",
      currentTripDetails: {
        serviceType: "airport_pickup",
        pickupLocation: "成田机场",
        date: "明天",
        time: "10:00",
        passengerCount: 2,
      },
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails.dropoffLocation).toBe("东京都新宿区西新宿2-8-1");
    expect(result.aiMessage.text).not.toMatch(/下车地点/);
  });

  it("uses a bare hotel reply when the previous AI message asked for the address", async () => {
    const result = await analyzeCustomerTurn({
      message: "Park Hyatt Tokyo",
      currentTripDetails: {
        serviceType: "airport_pickup",
        pickupLocation: "Narita Airport",
        date: "Tomorrow",
        time: "10:00",
        passengerCount: 2,
      },
      recentMessages: [{
        id: "msg_ai_address",
        role: "ai",
        text: "Could you provide your hotel address?",
        createdAt: "2026-07-20T00:00:00.000Z",
        channel: "website_widget",
      }],
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails.dropoffLocation).toBe("Park Hyatt Tokyo");
    expect(result.aiMessage.text).not.toMatch(/drop-off location/i);
  });
});

describe("analyzeCustomerTurn - message presentation", () => {
  it("uses an ISO timestamp so customer and AI times render in the same browser timezone", async () => {
    const result = await analyzeCustomerTurn({
      message: "Hello",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(Number.isNaN(Date.parse(result.aiMessage.createdAt))).toBe(false);
  });

  it("uses the latest customer's language instead of the first configured language", async () => {
    const result = await analyzeCustomerTurn({
      message: "Please quote a transfer from Narita Airport to Shinjuku",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.aiMessage.text).toMatch(/Got it|Thanks|What is|WhatsApp|Telegram|email/i);
    expect(result.aiMessage.text).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("keeps Chinese after a Chinese customer replies with only an email address", async () => {
    const result = await analyzeCustomerTurn({
      message: "guest@example.com",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
      recentMessages: [{
        id: "customer-zh",
        role: "customer",
        text: "你好，我想预订机场接送。",
        createdAt: new Date().toISOString(),
        channel: "website_widget",
      }],
    });

    expect(result.contact).toEqual({ method: "Email", value: "guest@example.com" });
    expect(result.aiMessage.text).toMatch(/[\u3400-\u9fff]/u);
    expect(result.aiMessage.text).not.toMatch(/^Thanks\b/i);
  });

  it("keeps English after an English customer replies with only an email address", async () => {
    const result = await analyzeCustomerTurn({
      message: "guest@example.com",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
      recentMessages: [{
        id: "customer-en",
        role: "customer",
        text: "Hello, I would like to book an airport transfer.",
        createdAt: new Date().toISOString(),
        channel: "website_widget",
      }],
    });

    expect(result.contact).toEqual({ method: "Email", value: "guest@example.com" });
    expect(result.aiMessage.text).toMatch(/^Thanks\b/i);
    expect(result.aiMessage.text).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("rejects a mostly Chinese reply for an English customer", () => {
    expect(replyLanguageMatches("您好，我会为您准备报价。", "en")).toBe(false);
    expect(replyLanguageMatches("Thanks. I recommend 丰田阿尔法 for this transfer.", "en")).toBe(true);
  });

  it("recognizes Arabic replies and rejects Chinese replies for Arabic customers", () => {
    expect(replyLanguageMatches("شكرًا، ما وقت الاستلام المطلوب؟", "ar")).toBe(true);
    expect(replyLanguageMatches("您好，请提供上车时间。", "ar")).toBe(false);
  });
});
