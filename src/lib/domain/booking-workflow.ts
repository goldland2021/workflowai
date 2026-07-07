import type { CapturedContact, QuoteSuggestion, TripDetails, TripFieldKey } from "./types";
import { buildBookingConfirmationText } from "./booking-confirmation";

const quoteRequiredFields: TripFieldKey[] = [
  "pickupLocation",
  "dropoffLocation",
  "date",
  "time",
  "passengerCount",
];

export function getMissingQuoteFields(tripDetails: TripDetails): TripFieldKey[] {
  return quoteRequiredFields.filter((field) => !tripDetails[field]);
}

export function createBookingSummary(params: {
  tripDetails: TripDetails;
  contact?: CapturedContact;
  approvedQuote?: QuoteSuggestion;
}) {
  const summary = {
    id: "booking_live_summary",
    customerName: "Website visitor",
    contact: params.contact,
    tripDetails: params.tripDetails,
    serviceType: params.tripDetails.serviceType,
    approvedPrice: params.approvedQuote?.suggestedPrice,
    currency: params.approvedQuote?.currency,
    includedFees: params.approvedQuote?.includedFees ?? ["Tolls", "Parking fees", "Taxes"],
    paymentMethod: "Cash to driver after service",
    receiptRequest: {
      needed: params.tripDetails.specialRequests?.some((request) => request.toLowerCase().includes("receipt")) ?? false,
    },
    specialNotes: params.approvedQuote
      ? [params.approvedQuote.reason, "Owner-approved quote can now be sent to the customer."]
      : ["Waiting for owner approval before confirming commercial terms."],
    status: params.approvedQuote ? ("ready" as const) : ("draft" as const),
  };

  return {
    ...summary,
    confirmationText: buildBookingConfirmationText(summary),
  };
}
