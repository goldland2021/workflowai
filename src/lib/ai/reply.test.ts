import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  generateReply: vi.fn(async () => "Could you provide the pickup location?"),
}));

import { asksForKnownTripField, generateAiReplyWithAI } from "./reply";
import { airportTransferConfiguration } from "../domain/airport-transfer";

describe("reply truth guards", () => {
  it("detects a generated question for a field already confirmed by the customer", () => {
    expect(
      asksForKnownTripField(
        "Could you provide the pickup location?",
        { pickupLocation: "Narita Airport" },
      ),
    ).toBe(true);
  });

  it("falls back instead of repeating a confirmed pickup question", async () => {
    const reply = await generateAiReplyWithAI({
      customerMessage: "What is the price?",
      tripDetails: {
        serviceType: "airport_pickup",
        pickupLocation: "Narita Airport",
        dropoffLocation: "The Ritz-Carlton Tokyo",
        passengerCount: 2,
      },
      detectedEvents: [],
      missingFields: [],
      quoteApproved: false,
      quoteAutoApproved: false,
      missingBookingFields: [],
      configuration: airportTransferConfiguration,
      customerLanguage: "en",
    });

    expect(reply).not.toContain("pickup location");
  });
});
