import "server-only";
import { supabaseFetch } from "./client";
import { createBookingSummary } from "@/lib/domain/booking-workflow";
import type {
  BossInboxItem,
  BusinessConfiguration,
  CapturedContact,
  ConversationMessage,
  DriverDetails,
  EventType,
  FlightArrivalDetails,
  HotelReference,
  PricingSnapshot,
  QuoteSuggestion,
  ReceiptRequest,
  TripDetails,
  WorkspaceWorkflowRecord,
} from "@/lib/domain/types";
import {
  applyMemoryToTripDetails,
  getChangedTripFields,
  tripDetailsToMemoryFacts,
  tripMemoryKey,
  type ConversationMemoryFact,
  type MemorySource,
} from "@/lib/domain/memory";

type RequestIdempotencyRow = {
  id: string;
  company_id: string;
  idempotency_key: string;
  request_hash: string;
  status: "processing" | "completed";
  response_body: unknown;
  updated_at: string;
};

export type RequestIdempotencyClaim =
  | { state: "claimed" }
  | { state: "replay"; responseBody: unknown }
  | { state: "in_progress" }
  | { state: "conflict" };

const IDEMPOTENCY_STALE_AFTER_MS = 10 * 60 * 1000;

function requestIdempotencyPath(companyId: string, key: string): string {
  return `/rest/v1/request_idempotency?company_id=eq.${encodeURIComponent(companyId)}&idempotency_key=eq.${encodeURIComponent(key)}&limit=1`;
}

export async function claimRequestIdempotency(
  companyId: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<RequestIdempotencyClaim> {
  const insertResponse = await supabaseFetch(
    "/rest/v1/request_idempotency?on_conflict=company_id,idempotency_key",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      body: JSON.stringify({
        company_id: companyId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        status: "processing",
      }),
    },
  );
  const inserted = (await insertResponse.json()) as RequestIdempotencyRow[];
  if (inserted[0]) return { state: "claimed" };

  const existingResponse = await supabaseFetch(requestIdempotencyPath(companyId, idempotencyKey));
  const existing = ((await existingResponse.json()) as RequestIdempotencyRow[])[0];
  if (!existing) throw new Error("Idempotency record could not be recovered.");
  if (existing.request_hash !== requestHash) return { state: "conflict" };
  if (existing.status === "completed") {
    return { state: "replay", responseBody: existing.response_body };
  }

  if (Date.parse(existing.updated_at) > Date.now() - IDEMPOTENCY_STALE_AFTER_MS) {
    return { state: "in_progress" };
  }

  const staleBefore = new Date(Date.now() - IDEMPOTENCY_STALE_AFTER_MS).toISOString();
  const reclaimResponse = await supabaseFetch(
    `${requestIdempotencyPath(companyId, idempotencyKey).replace("&limit=1", "")}&status=eq.processing&updated_at=lt.${encodeURIComponent(staleBefore)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
    },
  );
  const reclaimed = (await reclaimResponse.json()) as RequestIdempotencyRow[];
  return reclaimed[0] ? { state: "claimed" } : { state: "in_progress" };
}

export async function completeRequestIdempotency(
  companyId: string,
  idempotencyKey: string,
  requestHash: string,
  responseBody: unknown,
): Promise<void> {
  await supabaseFetch(
    `${requestIdempotencyPath(companyId, idempotencyKey).replace("&limit=1", "")}&request_hash=eq.${encodeURIComponent(requestHash)}&status=eq.processing`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "completed",
        response_body: responseBody,
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

export async function releaseRequestIdempotency(
  companyId: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<void> {
  await supabaseFetch(
    `${requestIdempotencyPath(companyId, idempotencyKey).replace("&limit=1", "")}&request_hash=eq.${encodeURIComponent(requestHash)}&status=eq.processing`,
    { method: "DELETE" },
  );
}

export async function recordAuditEvent(params: {
  companyId: string;
  actorType: "owner" | "system" | "customer";
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await supabaseFetch("/rest/v1/audit_events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      company_id: params.companyId,
      actor_type: params.actorType,
      actor_id: params.actorId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      metadata: params.metadata ?? {},
    }),
  });
}

export type AuditEventRow = {
  id: string;
  company_id: string;
  actor_type: "owner" | "system" | "customer";
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function getAuditEvents(companyId: string, limit = 100): Promise<AuditEventRow[]> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 100;
  const response = await supabaseFetch(
    `/rest/v1/audit_events?company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc&limit=${safeLimit}`,
  );
  return (await response.json()) as AuditEventRow[];
}

// ─── Companies ───

export type CompanyRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
};

export async function createCompany(params: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<CompanyRow> {
  const res = await supabaseFetch("/rest/v1/companies", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      name: params.name,
      email: params.email.toLowerCase(),
      password_hash: params.passwordHash,
    }),
  });
  const data = (await res.json()) as CompanyRow[];
  return data[0];
}

export async function getCompanyByEmail(email: string): Promise<CompanyRow | null> {
  const res = await supabaseFetch(
    `/rest/v1/companies?email=eq.${encodeURIComponent(email.toLowerCase())}&limit=1`
  );
  const data = (await res.json()) as CompanyRow[];
  return data[0] ?? null;
}

// ─── Conversations ───

export type ConversationRow = {
  id: string;
  session_id: string;
  company_id: string | null;
  customer_name: string | null;
  contact_method: string | null;
  contact_value: string | null;
  customer_language: "zh" | "en" | "ar" | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function createConversation(
  sessionId: string,
  companyId: string,
  customerLanguage: "zh" | "en" | "ar",
): Promise<{ conversation: ConversationRow; created: boolean }> {
  const body = {
    session_id: sessionId,
    company_id: companyId,
    customer_language: customerLanguage,
    status: "active",
  };
  const res = await supabaseFetch("/rest/v1/conversations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as ConversationRow[];
  if (data[0]) return { conversation: data[0], created: true };

  const existing = await getConversationBySessionId(sessionId, companyId);
  if (!existing) throw new Error("Conversation could not be created or recovered.");
  return { conversation: existing, created: false };
}

export async function updateConversationLanguage(
  conversationId: string,
  companyId: string,
  customerLanguage: "zh" | "en" | "ar",
): Promise<void> {
  await supabaseFetch(
    `/rest/v1/conversations?id=eq.${encodeURIComponent(conversationId)}&company_id=eq.${encodeURIComponent(companyId)}&customer_language=is.null`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        customer_language: customerLanguage,
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

export async function getConversations(companyId: string, limit = 20): Promise<ConversationRow[]> {
  const res = await supabaseFetch(
    `/rest/v1/conversations?company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc&limit=${limit}`
  );
  return (await res.json()) as ConversationRow[];
}

export async function getConversationBySessionId(
  sessionId: string,
  companyId: string,
): Promise<ConversationRow | null> {
  const res = await supabaseFetch(
    `/rest/v1/conversations?session_id=eq.${encodeURIComponent(sessionId)}&company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc&limit=1`
  );
  const data = (await res.json()) as ConversationRow[];
  return data[0] ?? null;
}

// Used to check ownership before returning data scoped to a raw conversationId
// supplied by a caller (e.g. a widget visitor's saved localStorage value).
export async function getConversationById(
  conversationId: string,
  companyId: string,
): Promise<ConversationRow | null> {
  const res = await supabaseFetch(
    `/rest/v1/conversations?id=eq.${encodeURIComponent(conversationId)}&company_id=eq.${encodeURIComponent(companyId)}&limit=1`
  );
  const data = (await res.json()) as ConversationRow[];
  return data[0] ?? null;
}

async function getConversationsByIds(companyId: string, ids: string[]): Promise<ConversationRow[]> {
  if (ids.length === 0) return [];
  const filter = ids.map((id) => encodeURIComponent(id)).join(",");
  const res = await supabaseFetch(
    `/rest/v1/conversations?company_id=eq.${encodeURIComponent(companyId)}&id=in.(${filter})&limit=${ids.length}`,
  );
  return (await res.json()) as ConversationRow[];
}

export async function getConversationsSince(companyId: string, sinceIso: string): Promise<ConversationRow[]> {
  const res = await supabaseFetch(
    `/rest/v1/conversations?company_id=eq.${encodeURIComponent(companyId)}&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.desc&limit=200`
  );
  return (await res.json()) as ConversationRow[];
}

export async function updateConversationContact(
  conversationId: string,
  companyId: string,
  contact: CapturedContact,
): Promise<void> {
  await supabaseFetch(
    `/rest/v1/conversations?id=eq.${encodeURIComponent(conversationId)}&company_id=eq.${encodeURIComponent(companyId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        contact_method: contact.method,
        contact_value: contact.value,
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

// ─── Messages ───

export type MessageRow = {
  id: string;
  conversation_id: string;
  idempotency_key: string | null;
  role: string;
  text: string;
  channel: string;
  created_at: string;
};

export async function saveMessage(
  conversationId: string,
  msg: ConversationMessage,
  idempotencyKey?: string,
): Promise<void> {
  const endpoint = idempotencyKey
    ? "/rest/v1/conversation_messages?on_conflict=conversation_id,idempotency_key"
    : "/rest/v1/conversation_messages";
  await supabaseFetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: idempotencyKey
        ? "resolution=ignore-duplicates,return=minimal"
        : "return=minimal",
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      idempotency_key: idempotencyKey,
      role: msg.role,
      text: msg.text,
      channel: msg.channel,
    }),
  });
}

export async function getMessages(conversationId: string): Promise<MessageRow[]> {
  const res = await supabaseFetch(
    `/rest/v1/conversation_messages?conversation_id=eq.${encodeURIComponent(conversationId)}&order=created_at.asc&limit=100`
  );
  return (await res.json()) as MessageRow[];
}

async function getMessagesByConversationIds(ids: string[]): Promise<MessageRow[]> {
  if (ids.length === 0) return [];
  const filter = ids.map((id) => encodeURIComponent(id)).join(",");
  const res = await supabaseFetch(
    `/rest/v1/conversation_messages?conversation_id=in.(${filter})&order=created_at.asc&limit=${ids.length * 100}`,
  );
  return (await res.json()) as MessageRow[];
}

export type AiFailureRow = {
  id: string;
  company_id: string;
  conversation_id: string | null;
  stage: string;
  message: string;
  provider: string | null;
  created_at: string;
};

export async function logAiFailure(params: {
  companyId: string;
  conversationId?: string;
  stage: string;
  message: string;
  provider?: string;
}): Promise<void> {
  await supabaseFetch("/rest/v1/ai_failures", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      company_id: params.companyId,
      conversation_id: params.conversationId,
      stage: params.stage,
      message: params.message.slice(0, 1000),
      provider: params.provider,
    }),
  });
}

export async function getAiFailures(companyId: string, limit = 20): Promise<AiFailureRow[]> {
  const res = await supabaseFetch(
    `/rest/v1/ai_failures?company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc&limit=${limit}`,
  );
  return (await res.json()) as AiFailureRow[];
}

// ─── Structured conversation memory ───

export async function getHotelReferenceCatalog(companyId: string): Promise<HotelReference[]> {
  const response = await supabaseFetch(
    `/rest/v1/hotel_reference_catalog?company_id=eq.${encodeURIComponent(companyId)}&active=eq.true&order=hotel_name.asc&limit=500`,
  );
  const rows = (await response.json()) as Array<{
    id: string;
    company_id: string;
    hotel_name: string;
    aliases: string[] | null;
    city: string | null;
    region: string | null;
    star_rating: number | string | null;
    nightly_rate_yen: number | null;
    currency: string;
    rate_basis: "manual" | "observed" | "average";
    source_url: string | null;
    observed_at: string | null;
    charter_adjustment_yen: number;
    notes: string | null;
    active: boolean;
  }>;

  return rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    hotelName: row.hotel_name,
    aliases: row.aliases ?? [],
    city: row.city ?? undefined,
    region: row.region ?? undefined,
    starRating: row.star_rating === null ? undefined : Number(row.star_rating),
    nightlyRateYen: row.nightly_rate_yen ?? undefined,
    currency: row.currency,
    rateBasis: row.rate_basis,
    sourceUrl: row.source_url ?? undefined,
    observedAt: row.observed_at ?? undefined,
    charterAdjustmentYen: row.charter_adjustment_yen ?? 0,
    notes: row.notes ?? undefined,
    active: row.active,
  }));
}

export type ConversationMemoryRow = {
  id: string;
  company_id: string;
  conversation_id: string;
  booking_id: string | null;
  fact_key: string;
  fact_value: unknown;
  source: MemorySource;
  confidence: number;
  confirmed: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getConversationMemory(
  conversationId: string,
  companyId: string,
): Promise<ConversationMemoryFact[]> {
  const response = await supabaseFetch(
    `/rest/v1/conversation_memory?conversation_id=eq.${encodeURIComponent(conversationId)}&company_id=eq.${encodeURIComponent(companyId)}&order=updated_at.desc&limit=100`,
  );
  const rows = (await response.json()) as ConversationMemoryRow[];
  const now = Date.now();
  return rows
    .filter((row) => !row.expires_at || Date.parse(row.expires_at) > now)
    .map((row) => ({
      key: row.fact_key,
      value: row.fact_value,
      source: row.source,
      confidence: row.confidence,
      confirmed: row.confirmed,
    }));
}

export function mergeConversationMemory(
  current: TripDetails,
  memory: ConversationMemoryFact[],
): TripDetails {
  return applyMemoryToTripDetails(current, memory);
}

export async function syncConversationMemory(params: {
  companyId: string;
  conversationId: string;
  bookingId?: string;
  tripDetails: TripDetails;
  previousTripDetails?: TripDetails;
  source?: MemorySource;
}): Promise<void> {
  const source = params.source ?? "customer";
  const changedFields = params.previousTripDetails
    ? getChangedTripFields(params.previousTripDetails, params.tripDetails)
    : Object.keys(params.tripDetails) as Array<keyof TripDetails>;
  const changedKeys = new Set(changedFields.map(tripMemoryKey));
  const facts = tripDetailsToMemoryFacts(params.tripDetails, source)
    .filter((fact) => changedKeys.has(fact.key));

  await Promise.all(facts.map((fact) =>
    supabaseFetch("/rest/v1/conversation_memory?on_conflict=company_id,conversation_id,fact_key", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        company_id: params.companyId,
        conversation_id: params.conversationId,
        booking_id: params.bookingId,
        fact_key: fact.key,
        fact_value: fact.value,
        source: fact.source,
        confidence: fact.confidence,
        confirmed: fact.confirmed,
        updated_at: new Date().toISOString(),
      }),
    }),
  ));
}

// ─── Booking timeline and learning cases ───

export async function recordBookingEvent(params: {
  companyId: string;
  bookingId: string;
  conversationId?: string;
  eventType: string;
  statusFrom?: string;
  statusTo?: string;
  actorType?: "owner" | "system" | "customer";
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await supabaseFetch("/rest/v1/booking_events?on_conflict=company_id,idempotency_key", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({
      company_id: params.companyId,
      booking_id: params.bookingId,
      conversation_id: params.conversationId,
      event_type: params.eventType,
      status_from: params.statusFrom,
      status_to: params.statusTo,
      actor_type: params.actorType ?? "system",
      idempotency_key: params.idempotencyKey,
      metadata: params.metadata ?? {},
    }),
  });
}

export type LearningCaseRow = {
  id: string;
  company_id: string;
  conversation_id: string | null;
  booking_id: string | null;
  source_type: string;
  source_id: string;
  outcome: "approved" | "edited" | "rejected";
  review_status: "candidate" | "accepted" | "dismissed";
  reason_code: string;
  safe_context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function createLearningCase(params: {
  companyId: string;
  conversationId?: string;
  bookingId?: string;
  sourceType: string;
  sourceId: string;
  outcome: "approved" | "edited" | "rejected";
  reasonCode: string;
  safeContext?: Record<string, unknown>;
}): Promise<void> {
  await supabaseFetch("/rest/v1/learning_cases?on_conflict=company_id,source_type,source_id,outcome", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({
      company_id: params.companyId,
      conversation_id: params.conversationId,
      booking_id: params.bookingId,
      source_type: params.sourceType,
      source_id: params.sourceId,
      outcome: params.outcome,
      reason_code: params.reasonCode,
      safe_context: params.safeContext ?? {},
    }),
  });
}

export async function getLearningCases(
  companyId: string,
  limit = 50,
): Promise<LearningCaseRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const response = await supabaseFetch(
    `/rest/v1/learning_cases?company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc&limit=${safeLimit}`,
  );
  return (await response.json()) as LearningCaseRow[];
}

export async function updateLearningCaseReviewStatus(params: {
  id: string;
  companyId: string;
  reviewStatus: "candidate" | "accepted" | "dismissed";
}): Promise<void> {
  await supabaseFetch(
    `/rest/v1/learning_cases?id=eq.${encodeURIComponent(params.id)}&company_id=eq.${encodeURIComponent(params.companyId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        review_status: params.reviewStatus,
        updated_at: new Date().toISOString(),
      }),
    },
  );

  await recordAuditEvent({
    companyId: params.companyId,
    actorType: "owner",
    action: "learning_case.review_status_changed",
    entityType: "learning_case",
    entityId: params.id,
    metadata: { reviewStatus: params.reviewStatus },
  }).catch(() => console.warn("Failed to record learning case audit event"));
}

// ─── Bookings ───

export type BookingRow = {
  id: string;
  conversation_id: string | null;
  company_id: string | null;
  service_type: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  airport: string | null;
  terminal: string | null;
  date: string | null;
  time: string | null;
  flight_number: string | null;
  flight_time: string | null;
  flight_arrival: FlightArrivalDetails | null;
  passenger_count: number | null;
  luggage_count: number | null;
  vehicle_preference: string | null;
  special_requests: string[] | null;
  route_distance_km: number | null;
  toll_yen: number | null;
  estimated_drive_time_min: number | null;
  approved_price: number | null;
  currency: string | null;
  included_fees: string[] | null;
  payment_method: string | null;
  status: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  driver_vehicle: string | null;
  driver_color: string | null;
  driver_license_plate: string | null;
  driver_whatsapp: string | null;
  receipt_needed: boolean | null;
  receipt_name: string | null;
  special_notes: string[] | null;
  confirmation_text: string | null;
  pricing_snapshot: PricingSnapshot | null;
  created_at: string;
  updated_at?: string;
};

export async function getRecentBookings(companyId: string, limit = 10): Promise<BookingRow[]> {
  const res = await supabaseFetch(
    `/rest/v1/bookings?company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc&limit=${limit}`
  );
  return (await res.json()) as BookingRow[];
}

export async function getBookingByConversationId(
  conversationId: string,
  companyId: string,
): Promise<BookingRow | null> {
  const res = await supabaseFetch(
    `/rest/v1/bookings?conversation_id=eq.${encodeURIComponent(conversationId)}&company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc&limit=1`
  );
  const data = (await res.json()) as BookingRow[];
  return data[0] ?? null;
}

export async function getCompanyById(companyId: string): Promise<CompanyRow | null> {
  const res = await supabaseFetch(
    `/rest/v1/companies?id=eq.${encodeURIComponent(companyId)}&limit=1`,
  );
  const data = (await res.json()) as CompanyRow[];
  return data[0] ?? null;
}

export async function getBookingById(bookingId: string, companyId: string): Promise<BookingRow | null> {
  const res = await supabaseFetch(
    `/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}&company_id=eq.${encodeURIComponent(companyId)}&limit=1`,
  );
  const data = (await res.json()) as BookingRow[];
  return data[0] ?? null;
}

async function getBookingsByIds(companyId: string, ids: string[]): Promise<BookingRow[]> {
  if (ids.length === 0) return [];
  const filter = ids.map((id) => encodeURIComponent(id)).join(",");
  const res = await supabaseFetch(
    `/rest/v1/bookings?company_id=eq.${encodeURIComponent(companyId)}&id=in.(${filter})&limit=${ids.length}`,
  );
  return (await res.json()) as BookingRow[];
}

async function getBookingsByConversationIds(companyId: string, ids: string[]): Promise<BookingRow[]> {
  if (ids.length === 0) return [];
  const filter = ids.map((id) => encodeURIComponent(id)).join(",");
  const res = await supabaseFetch(
    `/rest/v1/bookings?company_id=eq.${encodeURIComponent(companyId)}&conversation_id=in.(${filter})&order=created_at.desc&limit=${ids.length}`,
  );
  return (await res.json()) as BookingRow[];
}

export async function upsertBooking(
  conversationId: string,
  tripDetails: TripDetails,
  companyId: string,
  existingBookingId?: string,
  quote?: QuoteSuggestion,
): Promise<string> {
  const body: Record<string, unknown> = {
    conversation_id: conversationId,
    company_id: companyId,
    service_type: tripDetails.serviceType,
    pickup_location: tripDetails.pickupLocation,
    dropoff_location: tripDetails.dropoffLocation,
    airport: tripDetails.airport,
    terminal: tripDetails.terminal,
    date: tripDetails.date,
    time: tripDetails.time,
    flight_number: tripDetails.flightNumber,
    passenger_count: tripDetails.passengerCount,
    luggage_count: tripDetails.luggageCount,
    vehicle_preference: tripDetails.vehiclePreference,
    special_requests: tripDetails.specialRequests,
    route_distance_km: tripDetails.routeDistanceKm,
    toll_yen: tripDetails.tollYen,
    estimated_drive_time_min: tripDetails.estimatedDriveTimeMinutes,
    flight_arrival: tripDetails.flightArrival,
  };

  if (existingBookingId) {
    await supabaseFetch(
      `/rest/v1/bookings?id=eq.${encodeURIComponent(existingBookingId)}&company_id=eq.${encodeURIComponent(companyId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
      }
    );
    return existingBookingId;
  }

  if (quote) {
    body.currency = quote.currency;
    body.included_fees = quote.includedFees;
    body.pricing_snapshot = quote.pricing;
    if (quote.approvalSource) {
      body.approved_price = quote.suggestedPrice;
      body.status = "ready";
    }
  }

  const res = await supabaseFetch("/rest/v1/bookings?on_conflict=company_id,conversation_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as BookingRow[];
  if (data[0]?.id) return data[0].id;

  const existing = await getBookingByConversationId(conversationId, companyId);
  if (!existing) throw new Error("Booking could not be created or recovered.");
  return existing.id;
}

// ─── Boss Inbox ───

export type BossInboxRow = {
  id: string;
  conversation_id: string | null;
  booking_id: string | null;
  company_id: string | null;
  type: string;
  status: string;
  customer_name: string | null;
  summary: string | null;
  recommendation: string | null;
  reason: string | null;
  confidence: number | null;
  decision_type: string | null;
  event_type: string | null;
  severity: string | null;
  suggested_price: number | null;
  currency: string | null;
  vehicle_type: string | null;
  pricing_snapshot: PricingSnapshot | null;
  created_at: string;
};

export async function createBossInboxItem(
  item: Partial<BossInboxItem> & { bookingId?: string; conversationId: string; companyId: string },
): Promise<string> {
  const dedupeKey = [
    item.conversationId,
    item.type,
    item.decisionType || item.type,
    item.event?.eventType || "none",
    item.quote?.serviceType || "none",
    item.quote?.suggestedPrice ?? "none",
  ].join("|");
  const body: Record<string, unknown> = {
    conversation_id: item.conversationId,
    booking_id: item.bookingId,
    company_id: item.companyId,
    type: item.type,
    status: item.status || "pending",
    customer_name: item.customerName,
    summary: item.summary,
    recommendation: item.recommendation,
    reason: item.reason,
    confidence: item.confidence,
    decision_type: item.decisionType,
    event_type: item.event?.eventType,
    severity: item.event?.severity,
    suggested_price: item.quote?.suggestedPrice,
    currency: item.quote?.currency,
    vehicle_type: item.quote?.vehicleType,
    pricing_snapshot: item.quote?.pricing,
    dedupe_key: dedupeKey,
  };

  const res = await supabaseFetch("/rest/v1/boss_inbox?on_conflict=company_id,dedupe_key", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as BossInboxRow[];
  if (data[0]?.id) return data[0].id;

  const existingResponse = await supabaseFetch(
    `/rest/v1/boss_inbox?company_id=eq.${encodeURIComponent(item.companyId)}&dedupe_key=eq.${encodeURIComponent(dedupeKey)}&limit=1`,
  );
  const existing = (await existingResponse.json()) as BossInboxRow[];
  return existing[0]?.id ?? "";
}

export async function getBossInboxItems(companyId: string, status?: string): Promise<BossInboxRow[]> {
  let path = `/rest/v1/boss_inbox?company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc&limit=50`;
  if (status) path += `&status=eq.${status}`;
  const res = await supabaseFetch(path);
  return (await res.json()) as BossInboxRow[];
}

export async function getBossInboxItemById(id: string, companyId: string): Promise<BossInboxRow | null> {
  const res = await supabaseFetch(
    `/rest/v1/boss_inbox?id=eq.${encodeURIComponent(id)}&company_id=eq.${encodeURIComponent(companyId)}&limit=1`,
  );
  const data = (await res.json()) as BossInboxRow[];
  return data[0] ?? null;
}

export async function getBossInboxItemsByConversationId(
  conversationId: string,
  companyId: string,
): Promise<BossInboxRow[]> {
  const res = await supabaseFetch(
    `/rest/v1/boss_inbox?conversation_id=eq.${encodeURIComponent(conversationId)}&company_id=eq.${encodeURIComponent(companyId)}&order=created_at.asc&limit=50`,
  );
  return (await res.json()) as BossInboxRow[];
}

export function bookingRowToTripDetails(booking: BookingRow): TripDetails {
  return {
    serviceType: booking.service_type as TripDetails["serviceType"] ?? undefined,
    pickupLocation: booking.pickup_location ?? undefined,
    dropoffLocation: booking.dropoff_location ?? undefined,
    airport: booking.airport ?? undefined,
    terminal: booking.terminal ?? undefined,
    date: booking.date ?? undefined,
    time: booking.time ?? undefined,
    flightNumber: booking.flight_number ?? undefined,
    flightTime: booking.flight_time ?? undefined,
    flightArrival: booking.flight_arrival ?? undefined,
    passengerCount: booking.passenger_count ?? undefined,
    luggageCount: booking.luggage_count ?? undefined,
    vehiclePreference: booking.vehicle_preference ?? undefined,
    routeDistanceKm: booking.route_distance_km ?? undefined,
    tollYen: booking.toll_yen ?? undefined,
    estimatedDriveTimeMinutes: booking.estimated_drive_time_min ?? undefined,
    specialRequests: booking.special_requests ?? undefined,
  };
}

function bookingToDriverDetails(booking: BookingRow): DriverDetails | undefined {
  const details: DriverDetails = {
    name: booking.driver_name ?? undefined,
    phone: booking.driver_phone ?? undefined,
    vehicle: booking.driver_vehicle ?? undefined,
    color: booking.driver_color ?? undefined,
    licensePlate: booking.driver_license_plate ?? undefined,
    whatsapp: booking.driver_whatsapp ?? undefined,
  };
  return Object.values(details).some(Boolean) ? details : undefined;
}

function bookingToReceiptRequest(booking: BookingRow): ReceiptRequest {
  return {
    needed: booking.receipt_needed ?? false,
    receiptName: booking.receipt_name ?? undefined,
    amount: booking.approved_price ?? undefined,
    currency: booking.currency ?? undefined,
  };
}

export function bookingRowToQuote(row: BookingRow): QuoteSuggestion | undefined {
  if (row.approved_price == null) return undefined;

  return {
    id: `quote_${row.id}`,
    serviceType: row.service_type as TripDetails["serviceType"] ?? undefined,
    suggestedPrice: row.approved_price,
    currency: row.currency ?? "JPY",
    vehicleType: row.vehicle_preference ?? undefined,
    includedFees: row.included_fees ?? ["Tolls", "Parking fees", "Taxes"],
    reason: "Owner-approved quote",
    confidence: 100,
    missingFields: [],
    approvalSource: "owner",
    pricing: row.pricing_snapshot ?? undefined,
  };
}

function rowToQuote(row: BossInboxRow | BookingRow): QuoteSuggestion | undefined {
  if (!("suggested_price" in row)) return bookingRowToQuote(row);
  const price = row.suggested_price;
  if (price == null) return undefined;

  return {
    id: `quote_${row.id}`,
    serviceType: undefined,
    suggestedPrice: price,
    currency: row.currency ?? "JPY",
    vehicleType: row.vehicle_type ?? undefined,
    includedFees: ["Tolls", "Parking fees", "Taxes"],
    reason: row.reason ?? "",
    confidence: row.confidence ?? 75,
    missingFields: [],
    pricing: row.pricing_snapshot ?? undefined,
  };
}

export function bossInboxRowToQuote(row: BossInboxRow): QuoteSuggestion | undefined {
  return rowToQuote(row);
}

function rowToBossInboxItem(row: BossInboxRow): BossInboxItem {
  const event = row.event_type
    ? {
        id: `event_${row.id}`,
        eventType: row.event_type as EventType,
        summary: row.summary ?? "",
        suggestedOwnerAction: row.recommendation ?? "",
        severity: (row.severity ?? "medium") as "low" | "medium" | "high",
        status: row.status as BossInboxItem["status"],
      }
    : undefined;

  return {
    id: row.id,
    type: row.type as BossInboxItem["type"],
    decisionType: row.decision_type ?? row.type,
    status: row.status as BossInboxItem["status"],
    customerName: row.customer_name ?? "Website visitor",
    summary: row.summary ?? "",
    recommendation: row.recommendation ?? "",
    reason: row.reason ?? "",
    confidence: row.confidence ?? 0,
    createdAt: row.created_at,
    event,
    quote: row.suggested_price == null
      ? undefined
      : {
          id: `quote_${row.id}`,
          suggestedPrice: row.suggested_price,
          currency: row.currency ?? "USD",
          vehicleType: row.vehicle_type ?? undefined,
          reason: row.reason ?? "",
          confidence: row.confidence ?? 75,
          missingFields: [],
          includedFees: ["Tolls", "Parking fees", "Taxes"],
          pricing: row.pricing_snapshot ?? undefined,
        },
  };
}

export async function getWorkspaceInboxRecords(companyId: string): Promise<WorkspaceWorkflowRecord[]> {
  const rows = await getBossInboxItems(companyId, "pending");
  const conversationIds = [...new Set(rows.map((row) => row.conversation_id).filter(Boolean) as string[])];
  const bookingIds = [...new Set(rows.map((row) => row.booking_id).filter(Boolean) as string[])];
  const [conversations, directBookings, conversationBookings, messages] = await Promise.all([
    getConversationsByIds(companyId, conversationIds),
    getBookingsByIds(companyId, bookingIds),
    getBookingsByConversationIds(companyId, conversationIds),
    getMessagesByConversationIds(conversationIds),
  ]);
  const conversationsById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const bookingsById = new Map(
    [...directBookings, ...conversationBookings].map((booking) => [booking.id, booking]),
  );
  const bookingsByConversationId = new Map(
    conversationBookings
      .filter((booking) => booking.conversation_id)
      .map((booking) => [booking.conversation_id as string, booking]),
  );
  const messagesByConversationId = new Map<string, MessageRow[]>();
  messages.forEach((message) => {
    const current = messagesByConversationId.get(message.conversation_id) ?? [];
    current.push(message);
    messagesByConversationId.set(message.conversation_id, current);
  });

  return rows.map((row) => {
    const conversation = row.conversation_id
      ? conversationsById.get(row.conversation_id) ?? null
      : null;
    const booking = row.booking_id
      ? bookingsById.get(row.booking_id) ?? null
      : row.conversation_id
        ? bookingsByConversationId.get(row.conversation_id) ?? null
        : null;
    const conversationMessages = conversation
      ? messagesByConversationId.get(conversation.id) ?? []
      : [];
    const tripDetails = booking ? bookingRowToTripDetails(booking) : {};
    const contact = conversation?.contact_method && conversation.contact_value
      ? { method: conversation.contact_method as CapturedContact["method"], value: conversation.contact_value }
      : undefined;
    const inboxItem = rowToBossInboxItem(row);
    const approvedQuote = row.status === "approved" ? rowToQuote(row) : undefined;
    const bookingSummary = createBookingSummary({
      tripDetails,
      contact,
      approvedQuote,
      driverDetails: booking ? bookingToDriverDetails(booking) : undefined,
      paymentMethod: booking?.payment_method ?? undefined,
      receiptRequest: booking ? bookingToReceiptRequest(booking) : undefined,
    });

    return {
      inboxItem,
      conversationId: conversation?.id ?? row.conversation_id ?? undefined,
      bookingId: booking?.id ?? row.booking_id ?? undefined,
      tripDetails,
      contact,
      bookingSummary: {
        ...bookingSummary,
        id: booking?.id ?? bookingSummary.id,
        confirmationText: booking?.confirmation_text ?? bookingSummary.confirmationText,
      },
      messages: conversationMessages.map((message) => ({
        id: message.id,
        role: message.role as ConversationMessage["role"],
        text: message.text,
        createdAt: message.created_at,
        channel: message.channel as ConversationMessage["channel"],
      })),
    } satisfies WorkspaceWorkflowRecord;
  });
}

export async function updateBossInboxStatus(
  id: string,
  status: "approved" | "edited" | "rejected",
  companyId: string,
  quote?: QuoteSuggestion,
): Promise<void> {
  if (status === "approved" && !quote) {
    throw new Error("Approved Boss Inbox item requires a quote.");
  }

  const existingBeforeUpdate = await getBossInboxItemById(id, companyId);
  if (!existingBeforeUpdate) throw new Error("Boss Inbox item not found.");

  const updateResponse = await supabaseFetch(
    `/rest/v1/boss_inbox?id=eq.${encodeURIComponent(id)}&company_id=eq.${encodeURIComponent(companyId)}&status=eq.pending`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        status,
        suggested_price: quote?.suggestedPrice,
        currency: quote?.currency,
        vehicle_type: quote?.vehicleType,
        reason: quote?.reason,
        pricing_snapshot: quote?.pricing,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  const updatedRows = (await updateResponse.json()) as BossInboxRow[];
  if (!updatedRows[0]) throw new Error("Boss Inbox item is no longer pending.");

  await recordAuditEvent({
    companyId,
    actorType: "owner",
    action: "boss_inbox.status_changed",
    entityType: "boss_inbox",
    entityId: id,
    metadata: { status },
  }).catch(() => console.warn("Failed to record Boss Inbox audit event"));

  await createLearningCase({
    companyId,
    conversationId: existingBeforeUpdate.conversation_id ?? undefined,
    bookingId: existingBeforeUpdate.booking_id ?? undefined,
    sourceType: "boss_inbox",
    sourceId: id,
    outcome: status,
    reasonCode: status === "approved"
      ? "owner_approved_quote"
      : status === "edited"
        ? "owner_edited_quote"
        : "owner_rejected_decision",
    safeContext: {
      decisionType: existingBeforeUpdate.decision_type ?? existingBeforeUpdate.type,
      eventType: existingBeforeUpdate.event_type,
      suggestedPrice: existingBeforeUpdate.suggested_price,
      finalPrice: quote?.suggestedPrice ?? existingBeforeUpdate.suggested_price,
      currency: quote?.currency ?? existingBeforeUpdate.currency,
      vehicleType: quote?.vehicleType ?? existingBeforeUpdate.vehicle_type,
    },
  }).catch(() => console.warn("Failed to record learning case"));

  if (existingBeforeUpdate.booking_id) {
    await recordBookingEvent({
      companyId,
      bookingId: existingBeforeUpdate.booking_id,
      conversationId: existingBeforeUpdate.conversation_id ?? undefined,
      eventType: "quote_decision_recorded",
      actorType: "owner",
      idempotencyKey: `quote-decision:${id}:${status}`,
      metadata: {
        status,
        suggestedPrice: existingBeforeUpdate.suggested_price,
        finalPrice: quote?.suggestedPrice ?? existingBeforeUpdate.suggested_price,
        currency: quote?.currency ?? existingBeforeUpdate.currency,
      },
    }).catch(() => console.warn("Failed to record quote decision event"));
  }

  if (status !== "approved") return;

  const inboxItem = await getBossInboxItemById(id, companyId);
  if (!inboxItem?.booking_id || !quote) return;

  const booking = await getBookingById(inboxItem.booking_id, companyId);
  if (!booking) return;

  const conversation = inboxItem.conversation_id
    ? await getConversationById(inboxItem.conversation_id, companyId)
    : null;
  const contact = conversation?.contact_method && conversation.contact_value
    ? { method: conversation.contact_method as CapturedContact["method"], value: conversation.contact_value }
    : undefined;
  const summary = createBookingSummary({
    tripDetails: bookingRowToTripDetails(booking),
    contact,
    approvedQuote: quote,
    driverDetails: bookingToDriverDetails(booking),
    paymentMethod: booking.payment_method ?? undefined,
    receiptRequest: bookingToReceiptRequest(booking),
  });

  await supabaseFetch(
    `/rest/v1/bookings?id=eq.${encodeURIComponent(booking.id)}&company_id=eq.${encodeURIComponent(companyId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          approved_price: quote.suggestedPrice,
          currency: quote.currency,
          included_fees: quote.includedFees,
          pricing_snapshot: quote.pricing,
          status: "ready",
        confirmation_text: summary.confirmationText,
        updated_at: new Date().toISOString(),
      }),
    },
  );

  await recordBookingEvent({
    companyId,
    bookingId: booking.id,
    conversationId: booking.conversation_id ?? undefined,
    eventType: "quote_approved",
    actorType: "owner",
    statusFrom: booking.status ?? "draft",
    statusTo: "ready",
    idempotencyKey: `quote-approved:${id}`,
    metadata: {
      currency: quote.currency,
      approvedPrice: quote.suggestedPrice,
      vehicleType: quote.vehicleType,
    },
  }).catch(() => console.warn("Failed to record quote approval event"));

  await recordAuditEvent({
    companyId,
    actorType: "owner",
    action: "booking.quote_approved",
    entityType: "booking",
    entityId: booking.id,
    metadata: { inboxId: id, currency: quote.currency },
  }).catch(() => console.warn("Failed to record quote approval audit event"));
}

export async function updateBookingFulfillment(params: {
  bookingId: string;
  companyId: string;
  driverDetails?: DriverDetails;
  paymentMethod?: string;
  receiptRequest?: ReceiptRequest;
}): Promise<void> {
  const booking = await getBookingById(params.bookingId, params.companyId);
  if (!booking) throw new Error("Booking not found");

  const driver = params.driverDetails ?? bookingToDriverDetails(booking);
  const receipt = params.receiptRequest ?? bookingToReceiptRequest(booking);
  const paymentMethod = params.paymentMethod ?? booking.payment_method ?? undefined;
  const conversation = booking.conversation_id
    ? await getConversationById(booking.conversation_id, params.companyId)
    : null;
  const contact = conversation?.contact_method && conversation.contact_value
    ? { method: conversation.contact_method as CapturedContact["method"], value: conversation.contact_value }
    : undefined;
  const approvedQuote = rowToQuote(booking);
  const summary = createBookingSummary({
    tripDetails: bookingRowToTripDetails(booking),
    contact,
    approvedQuote,
    driverDetails: driver,
    paymentMethod,
    receiptRequest: receipt,
  });

  await supabaseFetch(
    `/rest/v1/bookings?id=eq.${encodeURIComponent(booking.id)}&company_id=eq.${encodeURIComponent(params.companyId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        driver_name: driver?.name,
        driver_phone: driver?.phone,
        driver_vehicle: driver?.vehicle,
        driver_color: driver?.color,
        driver_license_plate: driver?.licensePlate,
        driver_whatsapp: driver?.whatsapp,
        payment_method: paymentMethod,
        receipt_needed: receipt.needed,
        receipt_name: receipt.receiptName,
        confirmation_text: summary.confirmationText,
        updated_at: new Date().toISOString(),
      }),
    },
  );

  await recordBookingEvent({
    companyId: params.companyId,
    bookingId: booking.id,
    conversationId: booking.conversation_id ?? undefined,
    eventType: "fulfillment_updated",
    actorType: "owner",
    idempotencyKey: `fulfillment:${booking.id}:${JSON.stringify({ driver, paymentMethod, receipt })}`,
    metadata: {
      hasDriverDetails: Boolean(driver),
      hasPaymentMethod: Boolean(paymentMethod),
      receiptRequested: receipt.needed,
    },
  }).catch(() => console.warn("Failed to record fulfillment event"));

  await recordAuditEvent({
    companyId: params.companyId,
    actorType: "owner",
    action: "booking.fulfillment_updated",
    entityType: "booking",
    entityId: booking.id,
    metadata: {
      hasDriverDetails: Boolean(driver),
      hasPaymentMethod: Boolean(paymentMethod),
      receiptRequested: receipt.needed,
    },
  }).catch(() => console.warn("Failed to record fulfillment audit event"));
}

export async function recordBookingConfirmationSent(params: {
  bookingId: string;
  companyId: string;
}): Promise<void> {
  const booking = await getBookingById(params.bookingId, params.companyId);
  if (!booking?.conversation_id) throw new Error("Booking conversation not found");
  if (booking.status !== "ready" || booking.approved_price == null) {
    throw new Error("Booking is not ready for customer confirmation");
  }

  const conversation = await getConversationById(booking.conversation_id, params.companyId);
  if (!conversation) throw new Error("Booking conversation not found");

  let confirmationText = booking.confirmation_text;
  if (!confirmationText) {
    const contact = conversation.contact_method && conversation.contact_value
      ? { method: conversation.contact_method as CapturedContact["method"], value: conversation.contact_value }
      : undefined;
    const summary = createBookingSummary({
      tripDetails: bookingRowToTripDetails(booking),
      contact,
      approvedQuote: rowToQuote(booking),
      driverDetails: bookingToDriverDetails(booking),
      paymentMethod: booking.payment_method ?? undefined,
      receiptRequest: bookingToReceiptRequest(booking),
    });
    confirmationText = summary.confirmationText;

    await supabaseFetch(
      `/rest/v1/bookings?id=eq.${encodeURIComponent(booking.id)}&company_id=eq.${encodeURIComponent(params.companyId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          confirmation_text: confirmationText,
          status: booking.approved_price == null ? booking.status : "ready",
          updated_at: new Date().toISOString(),
        }),
      },
    );
  }

  await saveMessage(booking.conversation_id, {
    id: `owner_confirmation_${Date.now()}`,
    role: "owner",
    text: confirmationText,
    createdAt: new Date().toISOString(),
    channel: "website_widget",
  }, `booking-confirmation:${booking.id}`);

  await recordBookingEvent({
    companyId: params.companyId,
    bookingId: booking.id,
    conversationId: booking.conversation_id,
    eventType: "customer_confirmation_recorded",
    actorType: "owner",
    idempotencyKey: `booking-confirmation:${booking.id}`,
    statusFrom: booking.status ?? "draft",
    statusTo: "ready",
    metadata: { messageIdempotencyKey: `booking-confirmation:${booking.id}` },
  }).catch(() => console.warn("Failed to record booking confirmation event"));

  await recordAuditEvent({
    companyId: params.companyId,
    actorType: "owner",
    action: "booking.confirmation_recorded",
    entityType: "booking",
    entityId: booking.id,
    metadata: { messageIdempotencyKey: `booking-confirmation:${booking.id}` },
  }).catch(() => console.warn("Failed to record confirmation audit event"));
}

// ─── Business Config ───

export async function getBusinessConfig(companyId: string): Promise<BusinessConfiguration | null> {
  try {
    const res = await supabaseFetch(
      `/rest/v1/business_config?company_id=eq.${encodeURIComponent(companyId)}&limit=1`
    );
    const rows = (await res.json()) as Array<{ company_id: string; config: BusinessConfiguration }>;
    return rows[0]?.config ?? null;
  } catch {
    return null;
  }
}

export async function saveBusinessConfig(companyId: string, config: BusinessConfiguration): Promise<void> {
  await supabaseFetch("/rest/v1/business_config?on_conflict=company_id", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      company_id: companyId,
      company_name: config.companyProfile.name,
      config,
      updated_at: new Date().toISOString(),
    }),
  });
}
