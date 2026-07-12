import { describe, expect, it } from "vitest";
import { createBookingSummary, getMissingQuoteFields } from "./booking-workflow";
import type { QuoteSuggestion, TripDetails } from "./types";

describe("getMissingQuoteFields", () => {
  it("lists every required field when trip details are empty", () => {
    expect(getMissingQuoteFields({})).toEqual([
      "pickupLocation",
      "dropoffLocation",
      "date",
      "time",
      "passengerCount",
    ]);
  });

  it("only lists the fields that are still missing", () => {
    const partial: TripDetails = { pickupLocation: "Airport", date: "Tomorrow" };
    expect(getMissingQuoteFields(partial)).toEqual(["dropoffLocation", "time", "passengerCount"]);
  });

  it("lists nothing once every required field is present", () => {
    const complete: TripDetails = {
      pickupLocation: "Airport",
      dropoffLocation: "Hotel",
      date: "Tomorrow",
      time: "18:30",
      passengerCount: 2,
    };
    expect(getMissingQuoteFields(complete)).toEqual([]);
  });
});

describe("createBookingSummary - owner approval is required for a final price", () => {
  const tripDetails: TripDetails = {
    pickupLocation: "Airport",
    dropoffLocation: "Hotel",
    date: "Tomorrow",
    time: "18:30",
    passengerCount: 2,
  };

  it("stays in draft status with no price when the owner has not approved a quote", () => {
    const summary = createBookingSummary({ tripDetails });

    expect(summary.status).toBe("draft");
    expect(summary.approvedPrice).toBeUndefined();
    expect(summary.confirmationText).toMatch(/Price: TBC/);
  });

  it("becomes ready and carries the approved price once the owner approves a quote", () => {
    const approvedQuote: QuoteSuggestion = {
      id: "quote_1",
      suggestedPrice: 118,
      currency: "USD",
      vehicleType: "Van",
      reason: "Large group",
      confidence: 90,
      missingFields: [],
      includedFees: ["Tolls"],
    };

    const summary = createBookingSummary({ tripDetails, approvedQuote });

    expect(summary.status).toBe("ready");
    expect(summary.approvedPrice).toBe(118);
    expect(summary.currency).toBe("USD");
    expect(summary.confirmationText).toMatch(/Price: USD 118/);
  });

  it("flags a receipt request detected from special requests", () => {
    const summary = createBookingSummary({
      tripDetails: { ...tripDetails, specialRequests: ["Receipt requested"] },
    });

    expect(summary.receiptRequest?.needed).toBe(true);
  });
});
