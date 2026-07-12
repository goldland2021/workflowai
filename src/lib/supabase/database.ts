import "server-only";
import { supabaseFetch } from "./client";
import type { BossInboxItem, BusinessConfiguration, ConversationMessage, TripDetails } from "@/lib/domain/types";

// ─── Conversations ───

export type ConversationRow = {
  id: string;
  session_id: string;
  customer_name: string | null;
  contact_method: string | null;
  contact_value: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function createConversation(sessionId: string): Promise<string> {
  const body = { session_id: sessionId, status: "active" };
  const res = await supabaseFetch("/rest/v1/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as ConversationRow[];
  return data[0]?.id ?? "";
}

export async function getConversations(limit = 20): Promise<ConversationRow[]> {
  const res = await supabaseFetch(
    `/rest/v1/conversations?order=created_at.desc&limit=${limit}`
  );
  return (await res.json()) as ConversationRow[];
}

export async function getConversationBySessionId(sessionId: string): Promise<ConversationRow | null> {
  const res = await supabaseFetch(
    `/rest/v1/conversations?session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.desc&limit=1`
  );
  const data = (await res.json()) as ConversationRow[];
  return data[0] ?? null;
}

// ─── Messages ───

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  text: string;
  channel: string;
  created_at: string;
};

export async function saveMessage(conversationId: string, msg: ConversationMessage): Promise<void> {
  await supabaseFetch("/rest/v1/conversation_messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      conversation_id: conversationId,
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

// ─── Bookings ───

export type BookingRow = {
  id: string;
  conversation_id: string | null;
  service_type: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  date: string | null;
  time: string | null;
  passenger_count: number | null;
  luggage_count: number | null;
  vehicle_preference: string | null;
  approved_price: number | null;
  currency: string | null;
  status: string | null;
  created_at: string;
};

export async function getBookingByConversationId(conversationId: string): Promise<BookingRow | null> {
  const res = await supabaseFetch(
    `/rest/v1/bookings?conversation_id=eq.${encodeURIComponent(conversationId)}&order=created_at.desc&limit=1`
  );
  const data = (await res.json()) as BookingRow[];
  return data[0] ?? null;
}

export async function upsertBooking(
  conversationId: string,
  tripDetails: TripDetails,
  existingBookingId?: string
): Promise<string> {
  const body: Record<string, unknown> = {
    conversation_id: conversationId,
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
    estimated_drive_time_min: tripDetails.estimatedDriveTimeMinutes,
  };

  const bookingId = existingBookingId ?? (await getBookingByConversationId(conversationId))?.id;

  if (bookingId) {
    await supabaseFetch(
      `/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
      }
    );
    return bookingId;
  }

  const res = await supabaseFetch("/rest/v1/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as BookingRow[];
  return data[0]?.id ?? "";
}

// ─── Boss Inbox ───

export type BossInboxRow = {
  id: string;
  conversation_id: string | null;
  booking_id: string | null;
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
  created_at: string;
};

export async function createBossInboxItem(
  item: Partial<BossInboxItem> & { bookingId?: string; conversationId: string },
): Promise<string> {
  const body: Record<string, unknown> = {
    conversation_id: item.conversationId,
    booking_id: item.bookingId,
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
  };

  const res = await supabaseFetch("/rest/v1/boss_inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as BossInboxRow[];
  return data[0]?.id ?? "";
}

export async function getBossInboxItems(status?: string): Promise<BossInboxRow[]> {
  let path = "/rest/v1/boss_inbox?order=created_at.desc&limit=50";
  if (status) path += `&status=eq.${status}`;
  const res = await supabaseFetch(path);
  return (await res.json()) as BossInboxRow[];
}

export async function updateBossInboxStatus(
  id: string,
  status: "approved" | "edited" | "rejected"
): Promise<void> {
  await supabaseFetch(`/rest/v1/boss_inbox?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
  });
}

// ─── Business Config ───

export async function getBusinessConfig(): Promise<BusinessConfiguration | null> {
  try {
    const res = await supabaseFetch("/rest/v1/business_config?id=eq.default&limit=1");
    const rows = (await res.json()) as Array<{ id: string; config: BusinessConfiguration }>;
    return rows[0]?.config ?? null;
  } catch {
    return null;
  }
}

export async function saveBusinessConfig(config: BusinessConfiguration): Promise<void> {
  await supabaseFetch("/rest/v1/business_config", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      id: "default",
      company_name: config.companyProfile.name,
      config,
      updated_at: new Date().toISOString(),
    }),
  });
}
