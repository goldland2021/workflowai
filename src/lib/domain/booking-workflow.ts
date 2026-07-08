import type {
  CapturedContact,
  DriverDetails,
  QuoteSuggestion,
  ReceiptRequest,
  TripDetails,
  TripFieldKey,
} from "./types";
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
  driverDetails?: DriverDetails;
  paymentMethod?: string;
  receiptRequest?: ReceiptRequest;
}) {
  const receiptRequest = buildReceiptRequest({
    tripDetails: params.tripDetails,
    approvedQuote: params.approvedQuote,
    receiptRequest: params.receiptRequest,
  });
  const includedFees = params.approvedQuote?.includedFees ?? ["Tolls", "Parking fees", "Taxes"];
  const summary = {
    id: "booking_live_summary",
    customerName: "Website visitor",
    contact: params.contact,
    tripDetails: params.tripDetails,
    serviceType: params.tripDetails.serviceType,
    approvedPrice: params.approvedQuote?.suggestedPrice,
    currency: params.approvedQuote?.currency,
    includedFees,
    paymentMethod: params.paymentMethod ?? "Cash to driver after service",
    driverDetails: normalizeDriverDetails(params.driverDetails),
    receiptRequest,
    specialNotes: buildSpecialNotes(params.tripDetails, params.approvedQuote),
    status: params.approvedQuote ? ("ready" as const) : ("draft" as const),
  };

  return {
    ...summary,
    confirmationText: buildBookingConfirmationText(summary),
  };
}

function buildReceiptRequest(params: {
  tripDetails: TripDetails;
  approvedQuote?: QuoteSuggestion;
  receiptRequest?: ReceiptRequest;
}): ReceiptRequest {
  const detectedReceiptRequest =
    params.tripDetails.specialRequests?.some((request) => {
      const lower = request.toLowerCase();
      return lower.includes("receipt") || lower.includes("invoice") || request.includes("收据") || request.includes("发票");
    }) ?? false;

  const needed = params.receiptRequest?.needed ?? detectedReceiptRequest;

  return {
    needed,
    receiptName: params.receiptRequest?.receiptName,
    amount: params.receiptRequest?.amount ?? params.approvedQuote?.suggestedPrice,
    currency: params.receiptRequest?.currency ?? params.approvedQuote?.currency,
  };
}

function buildSpecialNotes(tripDetails: TripDetails, approvedQuote?: QuoteSuggestion): string[] {
  const notes = new Set<string>();

  tripDetails.specialRequests?.forEach((request) => {
    const lower = request.toLowerCase();
    if (lower.includes("early") || request.includes("提前")) {
      notes.add("Driver will arrive early.");
    } else if (!lower.includes("receipt") && !lower.includes("invoice") && !request.includes("收据") && !request.includes("发票")) {
      notes.add(request);
    }
  });

  if (approvedQuote?.vehicleType) {
    notes.add(`Vehicle arranged: ${approvedQuote.vehicleType}.`);
  }

  return Array.from(notes);
}

function normalizeDriverDetails(driverDetails?: DriverDetails): DriverDetails | undefined {
  if (!driverDetails) return undefined;
  const normalized = Object.fromEntries(
    Object.entries(driverDetails).filter(([, value]) => Boolean(value)),
  ) as DriverDetails;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}
