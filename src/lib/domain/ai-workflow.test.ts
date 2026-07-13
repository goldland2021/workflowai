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

import { analyzeCustomerTurn, filterDetectedEventsForMessage } from "./ai-workflow";
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

  it("rejects a mostly Chinese reply for an English customer", () => {
    expect(replyLanguageMatches("您好，我会为您准备报价。", "en")).toBe(false);
    expect(replyLanguageMatches("Thanks. I recommend 丰田阿尔法 for this transfer.", "en")).toBe(true);
  });

  it("recognizes Arabic replies and rejects Chinese replies for Arabic customers", () => {
    expect(replyLanguageMatches("شكرًا، ما وقت الاستلام المطلوب؟", "ar")).toBe(true);
    expect(replyLanguageMatches("您好，请提供上车时间。", "ar")).toBe(false);
  });
});
