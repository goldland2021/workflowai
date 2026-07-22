import { describe, expect, it } from "vitest";
import { enrichTripDetailsWithHotelReference, findHotelReference } from "./hotel-reference";

const references = [
  {
    id: "hotel-clad",
    hotelName: "HOTEL CLAD",
    aliases: ["Hotel Clad Gotemba"],
    city: "Gotemba",
    region: "Shizuoka",
    starRating: 4,
    nightlyRateYen: 28000,
    currency: "JPY",
    rateBasis: "manual" as const,
    charterAdjustmentYen: 5000,
    active: true,
  },
];

describe("hotel reference catalog", () => {
  it("matches a hotel mentioned as a drop-off location", () => {
    expect(findHotelReference({ dropoffLocation: "HOTEL CLAD Gotemba" }, references)?.id).toBe("hotel-clad");
  });

  it("adds hotel positioning data without using the nightly rate as the transfer price", () => {
    const trip = enrichTripDetailsWithHotelReference(
      { serviceType: "day_tour", dropoffLocation: "Hotel Clad Gotemba" },
      references,
    );

    expect(trip.hotelName).toBe("HOTEL CLAD");
    expect(trip.hotelStarRating).toBe(4);
    expect(trip.hotelNightlyRateYen).toBe(28000);
    expect(trip.hotelCharterAdjustmentYen).toBe(5000);
    expect(trip.hotelTier).toBe("premium");
  });
});
