import { describe, expect, it } from "vitest";
import { createBookingSummary, getMissingBookingFields, getMissingQuoteFields } from "./booking-workflow";
import type { QuoteSuggestion, TripDetails } from "./types";

describe("getMissingQuoteFields", () => {
  it("lists the minimum fields needed to calculate a quote", () => {
    expect(getMissingQuoteFields({})).toEqual([
      "pickupLocation",
      "dropoffLocation",
      "passengerCount",
    ]);
  });

  it("only lists the fields that are still missing", () => {
    const partial: TripDetails = { pickupLocation: "Airport", date: "Tomorrow" };
    expect(getMissingQuoteFields(partial)).toEqual(["dropoffLocation", "passengerCount"]);
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

  it("keeps pickup time as a booking field instead of blocking a quote", () => {
    expect(getMissingQuoteFields({ pickupLocation: "Airport", dropoffLocation: "Hotel", passengerCount: 2 })).toEqual([]);
    expect(getMissingBookingFields({ pickupLocation: "Airport", dropoffLocation: "Hotel", passengerCount: 2 })).toEqual(["date", "time"]);
    expect(getMissingBookingFields({ pickupLocation: "Airport", dropoffLocation: "Hotel", passengerCount: 2, flightTime: "15:05" })).toEqual(["date"]);
  });

  it("treats a configured airport as the pickup location for an airport transfer", () => {
    const tripDetails: TripDetails = {
      serviceType: "airport_pickup",
      airport: "Narita",
      dropoffLocation: "The Ritz-Carlton Tokyo",
      passengerCount: 2,
    };

    expect(getMissingQuoteFields(tripDetails)).toEqual([]);
    expect(getMissingBookingFields(tripDetails)).toEqual(["date", "time"]);
  });

  it("treats a hotel as the temporary pickup reference for an airport drop-off", () => {
    const tripDetails: TripDetails = {
      serviceType: "airport_dropoff",
      airport: "Narita",
      dropoffLocation: "Narita Airport",
      hotelName: "Hotel Gracery Shinjuku",
      passengerCount: 2,
    };

    expect(getMissingQuoteFields(tripDetails)).toEqual([]);
    expect(getMissingBookingFields(tripDetails)).toEqual(["date", "time"]);
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
