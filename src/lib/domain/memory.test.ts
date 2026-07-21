import { describe, expect, it } from "vitest";
import {
  applyMemoryToTripDetails,
  getChangedTripFields,
  tripDetailsToMemoryFacts,
} from "./memory";

describe("structured conversation memory", () => {
  it("stores trip facts as small structured records instead of raw messages", () => {
    const facts = tripDetailsToMemoryFacts({
      pickupLocation: "Narita Airport",
      dropoffLocation: "The Ritz-Carlton Tokyo",
      passengerCount: 2,
      specialRequests: ["Cash payment after service"],
    });

    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "trip.pickupLocation", value: "Narita Airport" }),
      expect.objectContaining({ key: "trip.dropoffLocation", value: "The Ritz-Carlton Tokyo" }),
      expect.objectContaining({ key: "trip.passengerCount", value: 2 }),
      expect.objectContaining({ key: "trip.specialRequests", value: ["Cash payment after service"] }),
    ]));
    expect(facts.some((fact) => "text" in fact)).toBe(false);
  });

  it("fills missing trip fields from memory without overwriting current state", () => {
    const next = applyMemoryToTripDetails(
      { pickupLocation: "Narita Airport", passengerCount: 3 },
      [
        { key: "trip.dropoffLocation", value: "Hilton Tokyo Odaiba", source: "customer", confidence: 0.95, confirmed: true },
        { key: "trip.passengerCount", value: 2, source: "customer", confidence: 0.95, confirmed: true },
      ],
    );

    expect(next).toMatchObject({
      pickupLocation: "Narita Airport",
      dropoffLocation: "Hilton Tokyo Odaiba",
      passengerCount: 3,
    });
  });

  it("identifies only changed facts for an idempotent memory write", () => {
    expect(getChangedTripFields(
      { pickupLocation: "Narita Airport", passengerCount: 2 },
      { pickupLocation: "Narita Airport", passengerCount: 3, luggageCount: 2 },
    )).toEqual(["passengerCount", "luggageCount"]);
  });
});
