import { describe, expect, it } from "vitest";
import { buildConversationWorksheet } from "./conversation-worksheet";

describe("conversation worksheet", () => {
  it("marks flight plus hotel as an estimate-ready route basis", () => {
    const worksheet = buildConversationWorksheet({
      serviceType: "airport_pickup",
      pickupLocation: "Airport",
      dropoffLocation: "The Ritz-Carlton Tokyo",
      flightNumber: "UA8011",
      passengerCount: 2,
    });

    expect(worksheet.canEstimate).toBe(true);
    expect(worksheet.locationBasis).toBe("flight-and-hotel");
    expect(worksheet.missingForEstimate).toEqual([]);
    expect(worksheet.slots.find((slot) => slot.key === "flightNumber")).toMatchObject({
      value: "UA8011",
      filled: true,
    });
  });

  it("keeps booking-only fields separate from estimate fields", () => {
    const worksheet = buildConversationWorksheet({
      serviceType: "airport_pickup",
      pickupLocation: "Narita Airport",
      dropoffLocation: "Shinjuku hotel",
      passengerCount: 2,
    });

    expect(worksheet.canEstimate).toBe(true);
    expect(worksheet.missingForBooking).toEqual(["date", "time"]);
  });
});
