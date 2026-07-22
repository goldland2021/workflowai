import type { HotelReference, TripDetails } from "./types";

function normalize(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\s\-_,.()'’]/gu, "");
}

function hotelTier(reference: HotelReference): TripDetails["hotelTier"] {
  if (typeof reference.starRating !== "number") return undefined;
  if (reference.starRating >= 5) return "luxury";
  if (reference.starRating >= 4) return "premium";
  return "standard";
}

export function findHotelReference(
  tripDetails: TripDetails,
  references: HotelReference[],
): HotelReference | undefined {
  const candidates = [
    tripDetails.hotelName,
    tripDetails.pickupLocation,
    tripDetails.dropoffLocation,
    tripDetails.returnPickupLocation,
    tripDetails.returnDropoffLocation,
    ...(tripDetails.routeStops ?? []),
  ]
    .map(normalize)
    .filter((value) => value.length >= 3);

  return references
    .filter((reference) => reference.active)
    .flatMap((reference) => [
      { reference, key: normalize(reference.hotelName) },
      ...reference.aliases.map((alias) => ({ reference, key: normalize(alias) })),
    ])
    .filter(({ key }) => key.length >= 3 && candidates.some((candidate) => candidate.includes(key) || key.includes(candidate)))
    .sort((a, b) => b.key.length - a.key.length)[0]?.reference;
}

export function enrichTripDetailsWithHotelReference(
  tripDetails: TripDetails,
  references: HotelReference[],
): TripDetails {
  const reference = findHotelReference(tripDetails, references);
  if (!reference) return tripDetails;

  return {
    ...tripDetails,
    hotelName: reference.hotelName,
    hotelReferenceId: reference.id,
    hotelStarRating: reference.starRating,
    hotelNightlyRateYen: reference.nightlyRateYen,
    hotelTier: hotelTier(reference),
    hotelCharterAdjustmentYen: reference.charterAdjustmentYen,
  };
}
