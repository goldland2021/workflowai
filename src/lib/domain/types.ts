export type Channel = "website_widget" | "whatsapp" | "telegram" | "email" | "phone";

export type MessageRole = "customer" | "ai" | "owner" | "system";

export type EventType =
  | "Discount Request"
  | "Urgent Booking"
  | "Route Change"
  | "Flight Delay"
  | "Complaint"
  | "Cancellation Request"
  | "Receipt Request"
  | "Driver Assignment Needed"
  | "Pickup Time Change"
  | "Early Pickup Request"
  | "Same Driver Request"
  | "English-speaking Driver Request"
  | "Multi-leg Itinerary Request"
  | "Round Trip Discount"
  | "Payment Coordination"
  | "Driver Coordination Issue";

export type Severity = "low" | "medium" | "high";

export type BossInboxStatus = "pending" | "approved" | "edited" | "rejected";

export type BossInboxType =
  | "quote_approval"
  | "event_review"
  | "driver_assignment"
  | "receipt_request"
  | "change_request"
  | "payment_coordination";

export type ContactMethod = "WhatsApp" | "Telegram" | "Email";

export type ServiceType =
  | "airport_pickup"
  | "airport_dropoff"
  | "city_transfer"
  | "round_trip"
  | "day_tour"
  | "hourly_charter"
  | "multi_leg_itinerary";

export type TripFieldKey =
  | "serviceType"
  | "pickupLocation"
  | "dropoffLocation"
  | "airport"
  | "terminal"
  | "date"
  | "time"
  | "flightNumber"
  | "flightTime"
  | "passengerCount"
  | "luggageCount"
  | "vehiclePreference";

export interface CompanyProfile {
  id: string;
  name: string;
  industry: "airport_transfer";
  serviceArea: string;
  languages: string[];
  paymentMethods: string[];
}

export interface Service {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

export interface PricingRule {
  id: string;
  label: string;
  description: string;
  basePrice: number;
  currency: string;
}

export interface PricingAirportRule {
  aliases: string[];
  baseYen: number;
  minimumYen: number;
  standardTollYen: number;
}

export interface PricingFixedRoute {
  id: string;
  label: string;
  keywords: string[];
  pricesByAirport: Record<string, number>;
}

export interface PricingCityRoute {
  id: string;
  label: string;
  pickupKeywords: string[];
  dropoffKeywords: string[];
  oneWayYen: number;
  roundTripYen?: number;
}

export interface CharterPricingPolicy {
  standardHours: number;
  standardDistanceKm: number;
  alphardBaseYen: number;
  hiaceBaseYen: number;
  fujiAlphardBaseYen: number;
  fujiHiaceBaseYen: number;
  fujiKeywords: string[];
}

export interface HotelReference {
  id: string;
  companyId?: string;
  hotelName: string;
  aliases: string[];
  city?: string;
  region?: string;
  starRating?: number;
  nightlyRateYen?: number;
  currency: string;
  rateBasis: "manual" | "observed" | "average";
  sourceUrl?: string;
  observedAt?: string;
  charterAdjustmentYen: number;
  notes?: string;
  active: boolean;
}

export interface PricingPolicy {
  engineVersion: string;
  currency: string;
  cityRateYenPerKm: number;
  cityTransferMinimumYen?: number;
  priceBufferYen: number;
  hiaceSurchargeYen: number;
  standardTollAllowanceYen: number;
  autoQuoteEnabled: boolean;
  autoQuoteMinConfidence: number;
  airports: Record<string, PricingAirportRule>;
  fixedRoutes: PricingFixedRoute[];
  cityRoutes?: PricingCityRoute[];
  charter?: CharterPricingPolicy;
  interAirportFares: Record<string, number>;
}

export interface EscalationRule {
  id: string;
  eventType: EventType;
  description: string;
  requiresOwnerApproval: boolean;
}

export interface ContactCaptureRule {
  id: string;
  trigger: string;
  preferredMethods: ContactMethod[];
}

export interface RequiredBookingField {
  key: TripFieldKey;
  label: string;
  requiredForQuote: boolean;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
}

export interface Vehicle {
  id: string;
  name: string;           // e.g. "丰田阿尔法"
  type: string;           // e.g. "Alphard"
  capacity: {
    passengers: number;
    luggage: number;
  };
  description?: string;   // e.g. "高端舒适MPV"
}

export interface BusinessConfiguration {
  companyProfile: CompanyProfile;
  services: Service[];
  businessHours: string;
  pricingRules: PricingRule[];
  escalationRules: EscalationRule[];
  contactCaptureRules: ContactCaptureRule[];
  requiredBookingFields: RequiredBookingField[];
  faq: FAQ[];
  aiBehaviorBoundaries: string[];
  vehicles?: Vehicle[];   // 可用车型列表
  pricingPolicy?: PricingPolicy;
}

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  text: string;
  createdAt: string;
  channel: Channel;
}

export interface TripDetails {
  serviceType?: ServiceType;
  pickupLocation?: string;
  dropoffLocation?: string;
  airport?: string;
  terminal?: string;
  date?: string;
  time?: string;
  flightNumber?: string;
  flightTime?: string;
  passengerCount?: number;
  luggageCount?: number;
  luggageBreakdown?: LuggageBreakdown;
  vehiclePreference?: string;
  returnPickupLocation?: string;
  returnDropoffLocation?: string;
  returnTime?: string;
  charterHours?: number;
  routeStops?: string[];
  hotelName?: string;
  hotelReferenceId?: string;
  hotelStarRating?: number;
  hotelNightlyRateYen?: number;
  hotelTier?: "standard" | "premium" | "luxury";
  hotelCharterAdjustmentYen?: number;
  routeDistanceKm?: number;
  tollYen?: number;
  estimatedDriveTimeMinutes?: number;
  specialRequests?: string[];
  flightArrival?: FlightArrivalDetails;
}

export interface LuggageBreakdown {
  large?: number;
  medium?: number;
  small?: number;
  carryOn?: number;
  backpack?: number;
  total: number;
}

export interface FlightArrivalDetails {
  flightNumber: string;
  airportCode: string;
  airportName: string;
  terminal?: string;
  arrivalLobby?: string;
  scheduledArrival?: string;
  estimatedArrival?: string;
  actualArrival?: string;
  status?: string;
  source: string;
  checkedAt: string;
  confidence: "confirmed" | "estimated" | "scheduled" | "partial";
  flightId?: string;
}

export type MemorySource = "customer" | "owner" | "system";

export interface ConversationMemoryFact {
  key: string;
  value: unknown;
  source: MemorySource;
  confidence: number;
  confirmed: boolean;
  updatedAt?: string;
}

export interface LearningCase {
  id: string;
  sourceType: string;
  sourceId: string;
  outcome: "approved" | "edited" | "rejected";
  reviewStatus: "candidate" | "accepted" | "dismissed";
  reasonCode: string;
  safeContext: Record<string, unknown>;
  createdAt: string;
}

export interface CapturedContact {
  method: ContactMethod;
  value: string;
}

export interface DetectedEvent {
  id: string;
  eventType: EventType;
  summary: string;
  suggestedOwnerAction: string;
  severity: Severity;
  status: BossInboxStatus;
}

export interface QuoteSuggestion {
  id: string;
  serviceType?: ServiceType;
  suggestedPrice: number;
  currency: string;
  vehicleType?: string;
  includedFees?: string[];
  routeDistanceKm?: number;
  estimatedDriveTimeMinutes?: number;
  reason: string;
  confidence: number;
  missingFields: TripFieldKey[];
  approvalSource?: "owner" | "pricing_policy";
  pricing?: PricingSnapshot;
}

export type PricingSource = "fixed_route" | "distance_formula" | "business_rule" | "charter_rule";
export type PricingConfidence = "high" | "medium" | "low";

export interface PricingSnapshot {
  engineVersion: string;
  source: PricingSource;
  confidence: number;
  confidenceBand: PricingConfidence;
  approvalRequired: boolean;
  approvalReason?: string;
  airportId?: string;
  direction?: "pickup" | "dropoff";
  routeDistanceKm?: number;
  tollYen?: number;
  waitingMinutes?: number;
  matchedRuleId?: string;
  vehicleType?: string;
  vehicleCount: number;
  unitPriceYen: number;
  totalPriceYen: number;
  priceLowYen?: number;
  priceHighYen?: number;
}

export interface BossInboxItem {
  id: string;
  type: BossInboxType;
  decisionType: string;
  status: BossInboxStatus;
  customerName: string;
  summary: string;
  recommendation: string;
  reason: string;
  confidence: number;
  createdAt: string;
  event?: DetectedEvent;
  quote?: QuoteSuggestion;
}

export interface DriverDetails {
  name?: string;
  phone?: string;
  vehicle?: string;
  color?: string;
  licensePlate?: string;
  whatsapp?: string;
}

export interface ReceiptRequest {
  needed: boolean;
  receiptName?: string;
  amount?: number;
  currency?: string;
}

export interface BookingSummary {
  id: string;
  customerName: string;
  contact?: CapturedContact;
  tripDetails: TripDetails;
  serviceType?: ServiceType;
  approvedPrice?: number;
  currency?: string;
  includedFees?: string[];
  paymentMethod?: string;
  driverDetails?: DriverDetails;
  receiptRequest?: ReceiptRequest;
  specialNotes: string[];
  confirmationText?: string;
  status: "draft" | "ready";
}

export interface DemoSnapshot {
  businessConfiguration: BusinessConfiguration;
  conversation: ConversationMessage[];
  tripDetails: TripDetails;
  contact?: CapturedContact;
  detectedEvents: DetectedEvent[];
  bossInbox: BossInboxItem[];
  bookingSummary: BookingSummary;
}

export interface WorkspaceWorkflowRecord {
  inboxItem: BossInboxItem;
  conversationId?: string;
  bookingId?: string;
  tripDetails: TripDetails;
  contact?: CapturedContact;
  bookingSummary: BookingSummary;
  messages: ConversationMessage[];
}
