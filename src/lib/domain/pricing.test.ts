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

    expect(result?.priceYen).toBe(21000);
    expect(result?.vehicleType).toBe("Toyota Alphard");
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

    expect(result?.vehicleType).toBe("Toyota HiAce");
    expect(result?.priceYen).toBe(31000);
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

  it("keeps three passengers with six ordinary bags in one Alphard", () => {
    const result = calculateWorkflowQuote(
      {
        serviceType: "airport_pickup",
        pickupLocation: "Narita Airport",
        dropoffLocation: "Tokyo hotel",
        passengerCount: 3,
        luggageCount: 6,
        routeDistanceKm: 72,
      },
      airportTransferConfiguration,
    );

    expect(result?.vehicleType).toBe("Toyota Alphard");
  });

  it("uses the standard Alphard charter price for a private itinerary", () => {
    const result = calculateWorkflowQuote(
      {
        serviceType: "day_tour",
        pickupLocation: "Odawara Station",
        dropoffLocation: "HOTEL CLAD",
        routeStops: ["Hakone Shrine", "Owakudani"],
        charterHours: 6,
        passengerCount: 4,
        luggageCount: 0,
      },
      airportTransferConfiguration,
    );

    expect(result?.priceYen).toBe(60000);
    expect(result?.pricing.source).toBe("charter_rule");
    expect(result?.pricing.approvalRequired).toBe(false);
  });

  it("uses the Fuji Alphard charter rate when the destination is Mt. Fuji", () => {
    const result = calculateWorkflowQuote(
      {
        serviceType: "day_tour",
        pickupLocation: "Tokyo",
        dropoffLocation: "Mt. Fuji",
        charterHours: 10,
        routeDistanceKm: 300,
        passengerCount: 4,
        luggageCount: 2,
        vehiclePreference: "Toyota Alphard",
      },
      airportTransferConfiguration,
    );

    expect(result?.priceYen).toBe(70000);
    expect(result?.vehicleType).toBe("Toyota Alphard");
    expect(result?.pricing.matchedRuleId).toBe("charter-fuji-alphard");
    expect(result?.pricing.approvalRequired).toBe(false);
  });

  it("requires owner review when a Fuji charter exceeds the standard distance", () => {
    const result = calculateWorkflowQuote(
      {
        serviceType: "day_tour",
        pickupLocation: "Tokyo",
        dropoffLocation: "Mt. Fuji",
        charterHours: 10,
        routeDistanceKm: 350,
        passengerCount: 4,
        luggageCount: 2,
        vehiclePreference: "Toyota Alphard",
      },
      airportTransferConfiguration,
    );

    expect(result?.priceYen).toBe(70000);
    expect(result?.pricing.approvalRequired).toBe(true);
    expect(result?.pricing.approvalReason).toContain("300 km");
  });

  it("uses Fuji and HiAce charter rates and applies a hotel adjustment", () => {
    const result = calculateWorkflowQuote(
      {
        serviceType: "day_tour",
        pickupLocation: "Tokyo",
        dropoffLocation: "Fuji area",
        charterHours: 10,
        passengerCount: 5,
        luggageCount: 6,
        vehiclePreference: "HiAce",
        hotelCharterAdjustmentYen: 5000,
      },
      airportTransferConfiguration,
    );

    expect(result?.priceYen).toBe(80000);
    expect(result?.vehicleType).toBe("Toyota HiAce");
    expect(result?.pricing.matchedRuleId).toBe("charter-fuji-hiace");
  });
});
