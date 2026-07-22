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

import {
  analyzeCustomerTurn,
  filterDetectedEventsForMessage,
  getFastFaqReply,
  getFastFlightArrivalReply,
  getFastOperationalReply,
  mergeTripDetails,
} from "./ai-workflow";
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

describe("getFastFaqReply", () => {
  it("answers configured Chinese policy questions without an LLM call", () => {
    expect(getFastFaqReply("司机可以等待多久？", airportTransferConfiguration)).toBe(
      "航班实际落地后提供90分钟免费等候。",
    );
  });

  it("answers included-fee questions without confirming a final price", () => {
    const answer = getFastFaqReply("报价是否包含高速费和停车费？", airportTransferConfiguration);
    expect(answer).toContain("老板确认");
    expect(answer).toContain("最终以老板批准的报价为准");
  });

  it("does not intercept non-Chinese or commercial event messages", () => {
    expect(getFastFaqReply("How long can the driver wait?", airportTransferConfiguration)).toBeUndefined();
    expect(getFastFaqReply("我已经付款，请确认。", airportTransferConfiguration)).toBeUndefined();
  });

  it("does not trust a stale FAQ id after the owner changes its content", () => {
    const editedConfiguration = {
      ...airportTransferConfiguration,
      faq: [
        {
          id: "faq_waiting",
          question: "可以安排哪些包车服务？",
          answer: "机场接送和私人包车。",
        },
      ],
    };

    expect(getFastFaqReply("司机可以等待多久？", editedConfiguration)).toBeUndefined();
  });
});

describe("analyzeCustomerTurn - quote suggestion rules", () => {
  it("treats a labelled English widget form as authoritative structured state", async () => {
    const result = await analyzeCustomerTurn({
      message: [
        "Airport: Haneda Airport (HND)",
        "Flight number: PR422",
        "Landing time: July 23, 1:35pm",
        "Hotel or address: 6-chōme-20-3 Nishikasai, Edogawa City, Tokyo 134-0088, Japan",
        "Passengers: 4",
        "Luggage: 8",
        "Vehicle: Toyota Hiace",
      ].join("\n"),
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails).toMatchObject({
      serviceType: "airport_pickup",
      pickupLocation: "Haneda Airport (HND)",
      dropoffLocation: "6-chōme-20-3 Nishikasai, Edogawa City, Tokyo 134-0088, Japan",
      airport: "Haneda",
      date: "July 23",
      time: "1:35 PM",
      flightNumber: "PR422",
      passengerCount: 4,
      luggageCount: 8,
      vehiclePreference: "Toyota HiAce",
    });
    expect(result.quote?.currency).toBe("JPY");
    expect(result.quote?.vehicleType).toContain("HiAce");
    expect(result.detectedEvents).not.toContainEqual(expect.objectContaining({ eventType: "Discount Request" }));
  });

  it("updates only the changed luggage field without creating a discount approval", async () => {
    const result = await analyzeCustomerTurn({
      message: "Luggage: 4 how much?",
      currentTripDetails: {
        serviceType: "airport_pickup",
        pickupLocation: "Haneda Airport (HND)",
        dropoffLocation: "6-chōme-20-3 Nishikasai, Edogawa City, Tokyo",
        airport: "Haneda",
        date: "July 23",
        time: "1:35 PM",
        flightNumber: "PR422",
        passengerCount: 4,
        luggageCount: 8,
        vehiclePreference: "Toyota HiAce",
      },
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails.passengerCount).toBe(4);
    expect(result.tripDetails.luggageCount).toBe(4);
    expect(result.detectedEvents).not.toContainEqual(expect.objectContaining({ eventType: "Discount Request" }));
  });

  it("does not let model extraction overwrite confirmed trip facts", () => {
    const result = mergeTripDetails(
      {
        serviceType: "airport_pickup",
        pickupLocation: "Narita Airport",
        dropoffLocation: "The Ritz-Carlton Tokyo",
        passengerCount: 2,
      },
      "What is the price?",
      {
        serviceType: "city_transfer",
        pickupLocation: "Haneda Airport",
        dropoffLocation: "Another hotel",
        passengerCount: 6,
      },
    );

    expect(result).toMatchObject({
      serviceType: "airport_pickup",
      pickupLocation: "Narita Airport",
      dropoffLocation: "The Ritz-Carlton Tokyo",
      passengerCount: 2,
    });
  });

  it("recognizes a Chinese charter itinerary and uses the charter price book", async () => {
    const result = await analyzeCustomerTurn({
      message: [
        "这是一个包车订单",
        "接车地点：小田原站",
        "接车时间：下午1:00",
        "计划景点：箱根神社、大涌谷",
        "送达地点：HOTEL CLAD",
        "预计到达：晚上7:00",
        "乘客人数：4人",
        "行李：0件",
      ].join("\n"),
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails.serviceType).toBe("day_tour");
    expect(result.tripDetails.pickupLocation).toBe("小田原站");
    expect(result.tripDetails.dropoffLocation).toBe("HOTEL CLAD");
    expect(result.tripDetails.passengerCount).toBe(4);
    expect(result.tripDetails.charterHours).toBe(6);
    expect(result.tripDetails.routeStops).toEqual(["箱根神社", "大涌谷"]);
    expect(result.quote?.suggestedPrice).toBe(60000);
    expect(result.quote?.pricing?.source).toBe("charter_rule");
  });

  it("provides a quote before pickup time is known", async () => {
    const result = await analyzeCustomerTurn({
      message: "Please quote Narita Airport to The Ritz-Carlton Tokyo for 2 passengers with 2 suitcases.",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.quote?.currency).toBe("JPY");
    expect(result.quote?.suggestedPrice).toBeGreaterThan(0);
    expect(result.aiMessage.text).not.toMatch(/drop-off location|下车地点/iu);
  });

  it("uses server-provided route distance before calculating the quote", async () => {
    const result = await analyzeCustomerTurn({
      message: "Please quote Narita Airport to The Ritz-Carlton Tokyo for 2 passengers with 2 suitcases.",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
      routeEnricher: async (tripDetails) => ({
        ...tripDetails,
        routeDistanceKm: 72,
        estimatedDriveTimeMinutes: 85,
        tollYen: 3000,
      }),
    });

    expect(result.tripDetails.routeDistanceKm).toBe(72);
    expect(result.tripDetails.estimatedDriveTimeMinutes).toBe(85);
    expect(result.quote?.suggestedPrice).toBe(21000);
    expect(result.quoteAutoApproved).toBe(true);
  });

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
    expect(result.aiMessage.text.replace(/,/g, "")).toContain(String(quoteItem?.quote?.suggestedPrice));
    expect(result.aiMessage.text).toMatch(/初步报价|老板确认|preliminary|owner confirmation/iu);
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

  it("auto-sends a high-confidence standard quote without creating a quote approval item", async () => {
    const result = await analyzeCustomerTurn({
      message: "Please quote this route.",
      currentTripDetails: {
        ...completeTripDetails,
        luggageCount: 3,
        routeDistanceKm: 72,
      },
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.quoteAutoApproved).toBe(true);
    expect(result.quote?.currency).toBe("JPY");
    expect(result.quote?.suggestedPrice).toBe(21000);
    expect(result.bossInboxItems.some((item) => item.type === "quote_approval")).toBe(false);
    expect(result.aiMessage.text).toMatch(/standard rate|标准报价/iu);
    expect(result.aiMessage.text).not.toMatch(/owner confirmation|老板确认/iu);
  });

  it("does not claim owner approval when a customer confirms an auto quote", async () => {
    const result = await analyzeCustomerTurn({
      message: "Yes, please confirm the booking.",
      currentTripDetails: {
        ...completeTripDetails,
        luggageCount: 3,
        routeDistanceKm: 72,
      },
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.quoteAutoApproved).toBe(true);
    expect(result.aiMessage.text).toMatch(/standard rate|标准报价/iu);
    expect(result.aiMessage.text).not.toMatch(/owner has confirmed|老板已确认/iu);
  });

  it("uses an owner-approved quote on later customer turns without reopening approval", async () => {
    const result = await analyzeCustomerTurn({
      message: "Can you confirm the quote?",
      currentTripDetails: completeTripDetails,
      approvedQuote: {
        id: "quote-approved",
        serviceType: "airport_pickup",
        suggestedPrice: 78,
        currency: "USD",
        vehicleType: "Toyota Alphard",
        includedFees: ["Tolls", "Parking fees", "Taxes"],
        reason: "Owner-approved quote",
        confidence: 100,
        missingFields: [],
      },
      existingBossItems: [{ status: "approved", type: "quote_approval" }],
      configuration: airportTransferConfiguration,
    });

    expect(result.aiMessage.text).toMatch(/老板已确认|owner has confirmed/iu);
    expect(result.aiMessage.text).toContain("USD 78");
    expect(result.bossInboxItems.some((item) => item.type === "quote_approval")).toBe(false);
  });

  it("handles payment questions without reopening missing trip fields", async () => {
    const result = await analyzeCustomerTurn({
      message: "The price is fine. When do I pay?",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.aiMessage.text).toMatch(/cash|PayPal/i);
    expect(result.aiMessage.text).not.toMatch(/pickup|drop-off|location/i);
  });

  it("keeps cash wording inside a quote request instead of switching to payment support", async () => {
    const result = await analyzeCustomerTurn({
      message: "Please quote Narita Airport to The Ritz-Carlton Tokyo for 2 passengers. Cash payment is fine.",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.quote?.currency).toBe("JPY");
    expect(result.aiMessage.text).toMatch(/JPY|price|报价/iu);
    expect(result.aiMessage.text).not.toMatch(/Payment is normally made|付款方式/iu);
  });

  it("extracts a city round trip and separate return time", async () => {
    const result = await analyzeCustomerTurn({
      message: "What is the price for 7 people from The Ritz-Carlton, Kyoto to Universal Studios Japan tomorrow morning, and back at 5 PM?",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails).toMatchObject({
      serviceType: "round_trip",
      pickupLocation: "The Ritz-Carlton, Kyoto",
      dropoffLocation: "Universal Studios Japan",
      passengerCount: 7,
      returnPickupLocation: "Universal Studios Japan",
      returnDropoffLocation: "The Ritz-Carlton, Kyoto",
      returnTime: "5 PM",
    });
    expect(result.quote?.suggestedPrice).toBe(40000);
  });

  it("keeps luggage categories and recommends vehicles by checked luggage", async () => {
    const result = await analyzeCustomerTurn({
      message: "Narita Airport to Yokohama hotel on October 27 for 19 passengers: 19 large suitcases, 19 carry-on bags and 19 backpacks.",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails.luggageBreakdown).toMatchObject({ large: 19, carryOn: 19, backpack: 19, total: 57 });
    expect(result.tripDetails.luggageCount).toBe(57);
    expect(result.quote?.vehicleType).toBe("3 × Toyota HiAce");
  });

  it("asks only for pickup time when a customer confirms before the booking is complete", async () => {
    const result = await analyzeCustomerTurn({
      message: "Yes, please confirm the booking.",
      currentTripDetails: {
        pickupLocation: "Narita Airport",
        dropoffLocation: "The Ritz-Carlton Tokyo",
        date: "July 21",
        passengerCount: 2,
      },
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.aiMessage.text).toMatch(/pickup time|上车时间/iu);
    expect(result.aiMessage.text).not.toMatch(/drop-off location|下车地点/iu);
  });
});

describe("getFastOperationalReply", () => {
  it("keeps acknowledgements to one short sentence", () => {
    expect(getFastOperationalReply("Well noted, thanks", "en")).toBe("You're welcome!");
    expect(getFastOperationalReply("😊", "en")).toBe("Noted.");
  });

  it("does not repeat the booking when the customer will contact the driver", () => {
    expect(
      getFastOperationalReply("Before the flight, I will contact the driver, thx", "en"),
    ).toBe("Noted. Safe travels!");
  });

  it("acknowledges a later pickup-time confirmation without asking for the address again", () => {
    expect(getFastOperationalReply("The time confirm you later", "en")).toBe(
      "Noted. Please confirm the pickup time when ready.",
    );
  });

  it("does not intercept a quote request", () => {
    expect(getFastOperationalReply("How much is the transfer?", "en")).toBeUndefined();
  });
});

describe("getFastFlightArrivalReply", () => {
  const tripDetails: TripDetails = {
    flightNumber: "UA8011",
    airport: "Narita",
    flightArrival: {
      flightNumber: "UA8011",
      airportCode: "NRT",
      airportName: "Narita International Airport",
      terminal: "Terminal 1",
      arrivalLobby: "International Arrivals Lobby, Terminal 1 (1F)",
      source: "FlightAware AeroAPI",
      checkedAt: "2026-07-21T00:00:00.000Z",
      confidence: "scheduled",
    },
  };

  it("answers a follow-up terminal question from the stored lookup", () => {
    const reply = getFastFlightArrivalReply("Which terminal will I arrive at?", tripDetails, "en");

    expect(reply).toContain("Terminal 1");
    expect(reply).toContain("International Arrivals Lobby");
  });

  it("answers Chinese arrival-lobby questions without another model turn", () => {
    const reply = getFastFlightArrivalReply("过海关后到哪个到达大厅？", tripDetails, "zh");

    expect(reply).toContain("航班 UA8011");
    expect(reply).toContain("到达大厅");
  });

  it("does not intercept unrelated customer messages", () => {
    expect(getFastFlightArrivalReply("Can I pay in cash?", tripDetails, "en")).toBeUndefined();
  });
});

describe("analyzeCustomerTurn - concise operational turns", () => {
  it("does not create a quote or inbox item for a simple acknowledgement", async () => {
    const result = await analyzeCustomerTurn({
      message: "Well noted, thanks",
      currentTripDetails: completeTripDetails,
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.aiMessage.text).toBe("You're welcome!");
    expect(result.bossInboxItems).toEqual([]);
    expect(result.detectedEvents).toEqual([]);
  });

  it("answers a greeting without repeating the current booking", async () => {
    const result = await analyzeCustomerTurn({
      message: "hello",
      currentTripDetails: completeTripDetails,
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.aiMessage.text).toBe("Hello! How can I help?");
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

  it("builds an airport estimate from a flight number and hotel without exact pickup details", async () => {
    const result = await analyzeCustomerTurn({
      message: [
        "Flight UA8011.",
        "My hotel address is The Ritz-Carlton Tokyo.",
        "2 passengers and 2 suitcases.",
      ].join(" "),
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails).toMatchObject({
      serviceType: "airport_pickup",
      pickupLocation: "Airport",
      dropoffLocation: "The Ritz-Carlton Tokyo",
      flightNumber: "UA8011",
      passengerCount: 2,
      luggageCount: 2,
    });
    expect(result.worksheet?.locationBasis).toBe("flight-and-hotel");
    expect(result.quote?.suggestedPrice).toBeGreaterThan(0);
    expect(result.aiMessage.text).toMatch(/flight and hotel|航班和酒店/iu);
    expect(result.aiMessage.text).not.toMatch(/exact pickup location|drop-off location/iu);
  });

  it("recovers a hotel address from recent customer messages instead of asking again", async () => {
    const result = await analyzeCustomerTurn({
      message: "How much will it be?",
      currentTripDetails: {
        flightNumber: "UA8011",
        passengerCount: 2,
        luggageCount: 2,
      },
      recentMessages: [
        {
          id: "customer-address",
          role: "customer",
          text: "My hotel address is The Ritz-Carlton Tokyo.",
          createdAt: "2026-07-22T00:00:00.000Z",
          channel: "website_widget",
        },
      ],
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails.dropoffLocation).toBe("The Ritz-Carlton Tokyo");
    expect(result.worksheet?.slots.find((slot) => slot.key === "dropoffLocation")?.filled).toBe(true);
    expect(result.aiMessage.text).not.toMatch(/drop-off location|hotel address/iu);
  });

  it("uses Narita from the airport field without asking for pickup location", async () => {
    const result = await analyzeCustomerTurn({
      message: "How much will it be?",
      currentTripDetails: {
        airport: "Narita",
        dropoffLocation: "The Ritz-Carlton Tokyo",
        passengerCount: 2,
      },
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails.serviceType).toBe("airport_pickup");
    expect(result.quote?.suggestedPrice).toBeGreaterThan(0);
    expect(result.aiMessage.text).not.toMatch(/pickup location|上车地点/iu);
  });

  it("uses a known hotel as the temporary pickup reference for airport drop-off", async () => {
    const result = await analyzeCustomerTurn({
      message: "How much for the airport transfer?",
      currentTripDetails: {
        serviceType: "airport_dropoff",
        airport: "Narita",
        dropoffLocation: "Narita Airport",
        hotelName: "Hotel Gracery Shinjuku",
        passengerCount: 2,
      },
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails.pickupLocation).toBe("Hotel Gracery Shinjuku");
    expect(result.quote?.suggestedPrice).toBeGreaterThan(0);
    expect(result.aiMessage.text).not.toMatch(/pickup location|pick-up location|上车地点/iu);
  });

  it("keeps Mt. Fuji intact and extracts charter hours and distance", async () => {
    const result = await analyzeCustomerTurn({
      message: "Please quote a private charter from Tokyo to Mt. Fuji, 10 hours and about 350 km, for 4 passengers with 2 suitcases.",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails).toMatchObject({
      serviceType: "day_tour",
      pickupLocation: "Tokyo",
      dropoffLocation: "Mt. Fuji",
      charterHours: 10,
      routeDistanceKm: 350,
      passengerCount: 4,
      luggageCount: 2,
    });
    expect(result.quote?.suggestedPrice).toBe(70000);
    expect(result.quote?.pricing?.approvalRequired).toBe(true);
  });

  it("preserves the stored route when a customer asks about the same route", async () => {
    const result = await analyzeCustomerTurn({
      message: "For 3 passengers with 6 large suitcases, is a Toyota Alphard suitable for this same Haneda to Nishikasai route?",
      currentTripDetails: {
        serviceType: "airport_pickup",
        pickupLocation: "Haneda Airport",
        dropoffLocation: "Nishikasai",
        passengerCount: 3,
        luggageCount: 6,
        routeDistanceKm: 25,
      },
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails.pickupLocation).toBe("Haneda Airport");
    expect(result.tripDetails.dropoffLocation).toBe("Nishikasai");
    expect(result.quote?.vehicleType).toBe("Toyota Alphard");
  });

  it("extracts Chinese route, date, passenger, luggage, airport, and vehicle fields", async () => {
    const result = await analyzeCustomerTurn({
      message: "你好，我想在8月15日安排5位乘客从成田机场到东京新宿酒店，有4件行李，想要阿尔法，可以吗？",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails).toMatchObject({
      serviceType: "airport_pickup",
      pickupLocation: "成田机场",
      dropoffLocation: "东京新宿酒店",
      airport: "Narita",
      date: "8月15日",
      passengerCount: 5,
      luggageCount: 4,
      vehiclePreference: "丰田阿尔法",
    });
  });

  it("captures an explicitly supplied hotel address as the drop-off location", async () => {
    const result = await analyzeCustomerTurn({
      message: "My hotel address is 1-2-3 Shinjuku, Tokyo.",
      currentTripDetails: {
        serviceType: "airport_pickup",
        pickupLocation: "Narita Airport",
        date: "Tomorrow",
        time: "10:00",
        passengerCount: 2,
      },
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails.dropoffLocation).toBe("1-2-3 Shinjuku, Tokyo");
    expect(result.aiMessage.text).not.toMatch(/drop-off location/i);
  });

  it("captures a Chinese hotel address instead of asking for it again", async () => {
    const result = await analyzeCustomerTurn({
      message: "酒店地址是东京都新宿区西新宿2-8-1。",
      currentTripDetails: {
        serviceType: "airport_pickup",
        pickupLocation: "成田机场",
        date: "明天",
        time: "10:00",
        passengerCount: 2,
      },
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails.dropoffLocation).toBe("东京都新宿区西新宿2-8-1");
    expect(result.aiMessage.text).not.toMatch(/下车地点/);
  });

  it("uses a bare hotel reply when the previous AI message asked for the address", async () => {
    const result = await analyzeCustomerTurn({
      message: "Park Hyatt Tokyo",
      currentTripDetails: {
        serviceType: "airport_pickup",
        pickupLocation: "Narita Airport",
        date: "Tomorrow",
        time: "10:00",
        passengerCount: 2,
      },
      recentMessages: [{
        id: "msg_ai_address",
        role: "ai",
        text: "Could you provide your hotel address?",
        createdAt: "2026-07-20T00:00:00.000Z",
        channel: "website_widget",
      }],
      configuration: airportTransferConfiguration,
      existingBossItems: [],
    });

    expect(result.tripDetails.dropoffLocation).toBe("Park Hyatt Tokyo");
    expect(result.aiMessage.text).not.toMatch(/drop-off location/i);
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

  it("keeps Chinese after a Chinese customer replies with only an email address", async () => {
    const result = await analyzeCustomerTurn({
      message: "guest@example.com",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
      recentMessages: [{
        id: "customer-zh",
        role: "customer",
        text: "你好，我想预订机场接送。",
        createdAt: new Date().toISOString(),
        channel: "website_widget",
      }],
    });

    expect(result.contact).toEqual({ method: "Email", value: "guest@example.com" });
    expect(result.aiMessage.text).toMatch(/[\u3400-\u9fff]/u);
    expect(result.aiMessage.text).not.toMatch(/^Thanks\b/i);
  });

  it("keeps English after an English customer replies with only an email address", async () => {
    const result = await analyzeCustomerTurn({
      message: "guest@example.com",
      currentTripDetails: {},
      configuration: airportTransferConfiguration,
      existingBossItems: [],
      recentMessages: [{
        id: "customer-en",
        role: "customer",
        text: "Hello, I would like to book an airport transfer.",
        createdAt: new Date().toISOString(),
        channel: "website_widget",
      }],
    });

    expect(result.contact).toEqual({ method: "Email", value: "guest@example.com" });
    expect(result.aiMessage.text).toMatch(/^Thanks\b/i);
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
