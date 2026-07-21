import { describe, expect, it } from "vitest";
import { airportTransferConfiguration } from "./airport-transfer";
import { calculateWorkflowQuote } from "./pricing";

describe("WorkflowAI pricing engine", () => {
  it("calculates a high-confidence Narita city route in JPY", () => {
    const result = calculateWorkflowQuote(
      {
        serviceType: "airport_pickup",
        pickupLocation: "Narita Airport",
        dropoffLocation: "The Ritz-Carlton Tokyo",
        passengerCount: 2,
        luggageCount: 3,
        routeDistanceKm: 72,
      },
      airportTransferConfiguration,
    );

    expect(result?.priceYen).toBe(23000);
    expect(result?.vehicleType).toBe("丰田阿尔法");
    expect(result?.pricing.source).toBe("distance_formula");
    expect(result?.pricing.approvalRequired).toBe(false);
    expect(result?.pricing.confidenceBand).toBe("high");
  });

  it("adds the HiAce surcharge when capacity requires a larger vehicle", () => {
    const result = calculateWorkflowQuote(
      {
        serviceType: "airport_pickup",
        airport: "NRT",
        pickupLocation: "Narita Airport",
        dropoffLocation: "Yokohama hotel",
        passengerCount: 5,
        luggageCount: 5,
        routeDistanceKm: 98,
      },
      airportTransferConfiguration,
    );

    expect(result?.vehicleType).toBe("丰田海狮");
    expect(result?.priceYen).toBe(34000);
    expect(result?.pricing.approvalRequired).toBe(false);
  });

  it("uses a fixed Hakone fare without requiring a route distance", () => {
    const result = calculateWorkflowQuote(
      {
        serviceType: "airport_dropoff",
        pickupLocation: "Hakone hotel",
        dropoffLocation: "Narita Airport",
        passengerCount: 2,
        luggageCount: 3,
      },
      airportTransferConfiguration,
    );

    expect(result?.priceYen).toBe(60000);
    expect(result?.pricing.matchedRuleId).toBe("hakone");
    expect(result?.pricing.approvalRequired).toBe(false);
  });

  it("keeps incomplete city pricing in owner review", () => {
    const result = calculateWorkflowQuote(
      {
        serviceType: "airport_pickup",
        pickupLocation: "Narita Airport",
        dropoffLocation: "Shinjuku hotel",
        passengerCount: 2,
      },
      airportTransferConfiguration,
    );

    expect(result?.pricing.confidenceBand).toBe("low");
    expect(result?.pricing.approvalRequired).toBe(true);
    expect(result?.pricing.approvalReason).toContain("distance");
  });

  it("keeps discount requests in Boss Inbox even on a known route", () => {
    const result = calculateWorkflowQuote(
      {
        serviceType: "airport_pickup",
        pickupLocation: "Narita Airport",
        dropoffLocation: "Shinjuku hotel",
        passengerCount: 2,
        luggageCount: 2,
        routeDistanceKm: 75,
        specialRequests: ["Can you offer a discount?"] ,
      },
      airportTransferConfiguration,
    );

    expect(result?.pricing.approvalRequired).toBe(true);
    expect(result?.pricing.approvalReason).toContain("special");
  });
});
