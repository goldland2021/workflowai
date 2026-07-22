import type {
  BusinessConfiguration,
  QuoteSuggestion,
  TripDetails,
  TripFieldKey,
} from "./types";
import { calculateWorkflowQuote } from "./pricing";

/**
 * Pricing & approval guardrail — the single authoritative source for whether a
 * quote exists, what it costs, and whether it needs owner approval.
 *
 * REFACTOR CONTRACT: prices and approval state are owned by configured business
 * rules here, never invented by the LLM. Both the legacy rule-based path and the
 * new orchestrator MUST route their pricing through `resolveAuthoritativeQuote`
 * so the model can only *describe* a price the code produced — never set one.
 */

/** True when a trip field that affects pricing changed between two snapshots. */
export function hasQuoteRelevantTripChanges(current: TripDetails, next: TripDetails): boolean {
  const fields: Array<keyof TripDetails> = [
    "serviceType",
    "pickupLocation",
    "dropoffLocation",
    "airport",
    "terminal",
    "date",
    "time",
    "flightNumber",
    "passengerCount",
    "luggageCount",
    "luggageBreakdown",
    "vehiclePreference",
    "returnPickupLocation",
    "returnDropoffLocation",
    "returnTime",
    "charterHours",
    "routeStops",
  ];

  return fields.some((field) => {
    if (field === "luggageBreakdown") {
      return JSON.stringify(current[field]) !== JSON.stringify(next[field]);
    }
    return current[field] !== next[field];
  });
}

/**
 * Produce a price suggestion from configured pricing rules, or undefined when
 * required fields are missing or no rule applies. Never called with model-
 * supplied prices.
 */
export function maybeCreateQuoteSuggestion(
  tripDetails: TripDetails,
  configuration: BusinessConfiguration,
  missingFields: TripFieldKey[],
): QuoteSuggestion | undefined {
  if (missingFields.length > 0) return undefined;

  const workflowQuote = calculateWorkflowQuote(tripDetails, configuration);
  if (workflowQuote) {
    return {
      id: `quote_${Date.now()}`,
      serviceType: tripDetails.serviceType,
      suggestedPrice: workflowQuote.priceYen,
      currency: configuration.pricingPolicy?.currency ?? "JPY",
      vehicleType: workflowQuote.vehicleType,
      includedFees: ["Tolls", "Parking fees", "Taxes"],
      routeDistanceKm: tripDetails.routeDistanceKm,
      estimatedDriveTimeMinutes: tripDetails.estimatedDriveTimeMinutes,
      reason: workflowQuote.reason,
      confidence: workflowQuote.pricing.confidence,
      missingFields,
      approvalSource: workflowQuote.pricing.approvalRequired ? undefined : "pricing_policy",
      pricing: workflowQuote.pricing,
    };
  }

  const wantsLargeVehicle =
    tripDetails.vehiclePreference?.includes("海狮") || tripDetails.vehiclePreference?.toLowerCase().includes("van") ||
    (tripDetails.passengerCount ?? 0) >= 4 ||
    (tripDetails.luggageCount ?? 0) >= 4;

  const pricingRule = wantsLargeVehicle
    ? configuration.pricingRules.find((rule) => rule.id === "price_van_airport")
    : configuration.pricingRules.find((rule) => rule.id === "price_standard_airport");

  if (!pricingRule) return undefined;

  return {
    id: `quote_${Date.now()}`,
    serviceType: tripDetails.serviceType,
    suggestedPrice: pricingRule.basePrice,
    currency: pricingRule.currency,
    vehicleType: wantsLargeVehicle ? "丰田海狮" : "丰田阿尔法",
    includedFees: ["Tolls", "Parking fees", "Taxes"],
    routeDistanceKm: tripDetails.routeDistanceKm,
    estimatedDriveTimeMinutes: tripDetails.estimatedDriveTimeMinutes,
    reason: `${pricingRule.label} applies based on route details, passengers, and luggage.`,
    confidence: wantsLargeVehicle ? 88 : 82,
    missingFields,
  };
}

export interface AuthoritativeQuote {
  /** The quote to present, or undefined when none can be produced yet. */
  quote?: QuoteSuggestion;
  /** True when reusing an owner-approved price (already confirmed). */
  quoteApproved: boolean;
  /** True when a standard rate came from an approved pricing policy (no per-trip owner approval needed). */
  quoteAutoApproved: boolean;
}

/**
 * Decide the authoritative quote for this turn:
 *  - Reuse an owner-approved price when nothing pricing-relevant changed.
 *  - Otherwise derive a fresh suggestion from pricing rules.
 *  - Mark it auto-approved only when the pricing policy says no owner approval is required.
 */
export function resolveAuthoritativeQuote(params: {
  workingTripDetails: TripDetails;
  tripDetails: TripDetails;
  configuration: BusinessConfiguration;
  missingFields: TripFieldKey[];
  approvedQuote?: QuoteSuggestion;
}): AuthoritativeQuote {
  const quoteApproved = Boolean(
    params.approvedQuote && !hasQuoteRelevantTripChanges(params.workingTripDetails, params.tripDetails),
  );
  const quote = quoteApproved
    ? params.approvedQuote
    : maybeCreateQuoteSuggestion(params.tripDetails, params.configuration, params.missingFields);
  const quoteAutoApproved = Boolean(
    quote && !quoteApproved && quote.pricing?.approvalRequired === false,
  );

  return { quote, quoteApproved, quoteAutoApproved };
}
