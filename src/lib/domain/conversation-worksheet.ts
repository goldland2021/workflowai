import type { TripDetails, TripFieldKey } from "./types";
import { getMissingBookingFields, getMissingQuoteFields } from "./booking-workflow";

export type ConversationWorksheetSlot = {
  key: TripFieldKey;
  value?: TripDetails[TripFieldKey];
  filled: boolean;
};

export type ConversationWorksheet = {
  slots: ConversationWorksheetSlot[];
  missingForEstimate: TripFieldKey[];
  missingForBooking: TripFieldKey[];
  canEstimate: boolean;
  locationBasis: "exact-route" | "airport-and-hotel" | "flight-and-hotel" | "incomplete";
};

const worksheetFields: TripFieldKey[] = [
  "serviceType",
  "pickupLocation",
  "dropoffLocation",
  "airport",
  "date",
  "time",
  "flightNumber",
  "passengerCount",
  "luggageCount",
  "vehiclePreference",
];

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

export function buildConversationWorksheet(tripDetails: TripDetails): ConversationWorksheet {
  const missingForEstimate = getMissingQuoteFields(tripDetails);
  const missingForBooking = getMissingBookingFields(tripDetails);
  const hasFlightAndHotel = Boolean(tripDetails.flightNumber && tripDetails.dropoffLocation);
  const hasAirportAndHotel = Boolean(tripDetails.airport && tripDetails.dropoffLocation);
  const hasExactRoute = Boolean(tripDetails.pickupLocation && tripDetails.dropoffLocation && tripDetails.routeDistanceKm);

  return {
    slots: worksheetFields.map((key) => ({
      key,
      value: tripDetails[key],
      filled: hasValue(tripDetails[key]),
    })),
    missingForEstimate,
    missingForBooking,
    canEstimate: missingForEstimate.length === 0,
    locationBasis: hasExactRoute
      ? "exact-route"
      : hasFlightAndHotel
        ? "flight-and-hotel"
        : hasAirportAndHotel
          ? "airport-and-hotel"
          : "incomplete",
  };
}
