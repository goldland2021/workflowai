import { describe, expect, it } from "vitest";
import { airportTransferConfiguration } from "./airport-transfer";
import {
  hasQuoteRelevantTripChanges,
  maybeCreateQuoteSuggestion,
  resolveAuthoritativeQuote,
} from "./pricing-guardrail";
import type { QuoteSuggestion, TripDetails } from "./types";

const completeTrip: TripDetails = {
  serviceType: "airport_pickup",
  pickupLocation: "Narita Airport",
  dropoffLocation: "City Hotel",
  passengerCount: 2,
  date: "Tomorrow",
  time: "18:00",
};

describe("hasQuoteRelevantTripChanges", () => {
  it("is false when nothing pricing-relevant changed", () => {
    expect(hasQuoteRelevantTripChanges(completeTrip, { ...completeTrip })).toBe(false);
  });

  it("is true when passenger count changes", () => {
    expect(hasQuoteRelevantTripChanges(completeTrip, { ...completeTrip, passengerCount: 4 })).toBe(true);
  });

  it("ignores non-pricing fields like specialRequests", () => {
    expect(
      hasQuoteRelevantTripChanges(completeTrip, { ...completeTrip, specialRequests: ["Receipt requested"] }),
    ).toBe(false);
  });
});

describe("maybeCreateQuoteSuggestion", () => {
  it("returns undefined while required fields are missing", () => {
    expect(maybeCreateQuoteSuggestion({}, airportTransferConfiguration, ["pickupLocation"])).toBeUndefined();
  });

  it("produces a quote priced by configuration, not the caller", () => {
    const quote = maybeCreateQuoteSuggestion(completeTrip, airportTransferConfiguration, []);
    expect(quote).toBeDefined();
    expect(typeof quote?.suggestedPrice).toBe("number");
    expect(quote?.suggestedPrice).toBeGreaterThan(0);
  });
});

describe("resolveAuthoritativeQuote", () => {
  const approved: QuoteSuggestion = {
    id: "quote_owner_1",
    serviceType: "airport_pickup",
    suggestedPrice: 30000,
    currency: "JPY",
    vehicleType: "丰田阿尔法",
    includedFees: ["Tolls"],
    reason: "Owner approved",
    confidence: 100,
    missingFields: [],
  };

  it("reuses the owner-approved price when nothing pricing-relevant changed", () => {
    const result = resolveAuthoritativeQuote({
      workingTripDetails: completeTrip,
      tripDetails: { ...completeTrip },
      configuration: airportTransferConfiguration,
      missingFields: [],
      approvedQuote: approved,
    });
    expect(result.quoteApproved).toBe(true);
    expect(result.quote?.suggestedPrice).toBe(30000);
  });

  it("re-quotes (does not reuse approval) when the trip changes", () => {
    const result = resolveAuthoritativeQuote({
      workingTripDetails: completeTrip,
      tripDetails: { ...completeTrip, passengerCount: 6 },
      configuration: airportTransferConfiguration,
      missingFields: [],
      approvedQuote: approved,
    });
    expect(result.quoteApproved).toBe(false);
  });

  it("produces no quote and no approval when required fields are missing", () => {
    const result = resolveAuthoritativeQuote({
      workingTripDetails: {},
      tripDetails: {},
      configuration: airportTransferConfiguration,
      missingFields: ["pickupLocation", "dropoffLocation", "passengerCount"],
      approvedQuote: undefined,
    });
    expect(result.quote).toBeUndefined();
    expect(result.quoteApproved).toBe(false);
    expect(result.quoteAutoApproved).toBe(false);
  });
});
