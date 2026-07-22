import type { TripDetails } from "./types";

export type MemorySource = "customer" | "owner" | "system";

export type ConversationMemoryFact = {
  key: string;
  value: unknown;
  source: MemorySource;
  confidence: number;
  confirmed: boolean;
};

const memoryFields: Array<keyof TripDetails> = [
  "serviceType",
  "pickupLocation",
  "dropoffLocation",
  "airport",
  "terminal",
  "date",
  "time",
  "flightNumber",
  "flightTime",
  "passengerCount",
  "luggageCount",
  "vehiclePreference",
  "returnPickupLocation",
  "returnDropoffLocation",
  "returnTime",
  "charterHours",
  "routeStops",
  "hotelName",
  "hotelReferenceId",
  "hotelStarRating",
  "hotelNightlyRateYen",
  "hotelTier",
  "hotelCharterAdjustmentYen",
  "routeDistanceKm",
  "tollYen",
  "estimatedDriveTimeMinutes",
  "specialRequests",
  "flightArrival",
];

const numericFields = new Set<keyof TripDetails>([
  "passengerCount",
  "luggageCount",
  "charterHours",
  "hotelStarRating",
  "hotelNightlyRateYen",
  "hotelCharterAdjustmentYen",
  "routeDistanceKm",
  "tollYen",
  "estimatedDriveTimeMinutes",
]);

export function tripMemoryKey(field: keyof TripDetails): string {
  return `trip.${field}`;
}

export function tripDetailsToMemoryFacts(
  tripDetails: TripDetails,
  source: MemorySource = "customer",
): ConversationMemoryFact[] {
  return memoryFields.flatMap((field) => {
    const value = tripDetails[field];
    if (value === undefined || value === null || value === "") return [];

    return [{
      key: tripMemoryKey(field),
      value,
      source,
      confidence: source === "customer" ? 0.95 : 1,
      confirmed: source !== "system",
    }];
  });
}

function coerceMemoryValue(field: keyof TripDetails, value: unknown): unknown {
  if (numericFields.has(field)) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  if (field === "specialRequests") {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
    return typeof value === "string" ? [value] : undefined;
  }

  if (field === "routeStops") {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
  }

  if (field === "flightArrival") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.flightNumber !== "string" || typeof candidate.airportCode !== "string") return undefined;
    return value;
  }

  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function applyMemoryToTripDetails(
  current: TripDetails,
  facts: ConversationMemoryFact[],
): TripDetails {
  const next: TripDetails = { ...current };

  for (const fact of facts) {
    if (!fact.key.startsWith("trip.")) continue;
    const field = fact.key.slice("trip.".length) as keyof TripDetails;
    if (!memoryFields.includes(field)) continue;

    const value = coerceMemoryValue(field, fact.value);
    if (value === undefined) continue;

    if (field === "specialRequests") {
      next.specialRequests = Array.from(new Set([
        ...(next.specialRequests ?? []),
        ...(value as string[]),
      ]));
      continue;
    }

    const currentValue = next[field];
    if (currentValue === undefined || currentValue === null || currentValue === "") {
      (next as Record<string, unknown>)[field] = value;
    }
  }

  return next;
}

export function getChangedTripFields(
  previous: TripDetails,
  next: TripDetails,
): Array<keyof TripDetails> {
  return memoryFields.filter((field) => JSON.stringify(previous[field]) !== JSON.stringify(next[field]));
}
