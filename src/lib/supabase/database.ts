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
  QuoteSuggestion,
  ReceiptRequest,
  TripDetails,
  WorkspaceWorkflowRecord,
} from "@/lib/domain/types";

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
  status: string;
  created_at: string;
  updated_at: string;
};

export async function createConversation(sessionId: string, companyId: string): Promise<string> {
  const body = { session_id: sessionId, company_id: companyId, status: "active" };
  const res = await supabaseFetch("/rest/v1/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as ConversationRow[];
  return data[0]?.id ?? "";
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
  passenger_count: number | null;
  luggage_count: number | null;
  vehicle_preference: string | null;
  special_requests: string[] | null;
  route_distance_km: number | null;
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

export async function upsertBooking(
  conversationId: string,
  tripDetails: TripDetails,
  companyId: string,
  existingBookingId?: string
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
    estimated_drive_time_min: tripDetails.estimatedDriveTimeMinutes,
  };

  const bookingId = existingBookingId ?? (await getBookingByConversationId(conversationId, companyId))?.id;

  if (bookingId) {
    await supabaseFetch(
      `/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}&company_id=eq.${encodeURIComponent(companyId)}`,
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
  created_at: string;
};

export async function createBossInboxItem(
  item: Partial<BossInboxItem> & { bookingId?: string; conversationId: string; companyId: string },
): Promise<string> {
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
  };

  const res = await supabaseFetch("/rest/v1/boss_inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as BossInboxRow[];
  return data[0]?.id ?? "";
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
    passengerCount: booking.passenger_count ?? undefined,
    luggageCount: booking.luggage_count ?? undefined,
    vehiclePreference: booking.vehicle_preference ?? undefined,
    routeDistanceKm: booking.route_distance_km ?? undefined,
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

function rowToQuote(row: BossInboxRow | BookingRow): QuoteSuggestion | undefined {
  const isInbox = "suggested_price" in row;
  const price = isInbox ? row.suggested_price : row.approved_price;
  if (price == null) return undefined;

  return {
    id: `quote_${row.id}`,
    serviceType: "service_type" in row ? (row.service_type as TripDetails["serviceType"] ?? undefined) : undefined,
    suggestedPrice: price,
    currency: row.currency ?? "USD",
    vehicleType: isInbox ? row.vehicle_type ?? undefined : row.vehicle_preference ?? undefined,
    includedFees: "included_fees" in row ? row.included_fees ?? undefined : ["Tolls", "Parking fees", "Taxes"],
    reason: isInbox ? row.reason ?? "" : "Owner-approved quote",
    confidence: isInbox ? row.confidence ?? 75 : 100,
    missingFields: [],
  };
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
        },
  };
}

export async function getWorkspaceInboxRecords(companyId: string): Promise<WorkspaceWorkflowRecord[]> {
  const rows = await getBossInboxItems(companyId, "pending");

  return Promise.all(rows.map(async (row) => {
    const conversation = row.conversation_id
      ? await getConversationById(row.conversation_id, companyId)
      : null;
    const booking = row.booking_id
      ? await getBookingById(row.booking_id, companyId)
      : row.conversation_id
        ? await getBookingByConversationId(row.conversation_id, companyId)
        : null;
    const messages = conversation ? await getMessages(conversation.id) : [];
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
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role as ConversationMessage["role"],
        text: message.text,
        createdAt: message.created_at,
        channel: message.channel as ConversationMessage["channel"],
      })),
    } satisfies WorkspaceWorkflowRecord;
  }));
}

export async function updateBossInboxStatus(
  id: string,
  status: "approved" | "edited" | "rejected",
  companyId: string,
  quote?: QuoteSuggestion,
): Promise<void> {
  await supabaseFetch(
    `/rest/v1/boss_inbox?id=eq.${encodeURIComponent(id)}&company_id=eq.${encodeURIComponent(companyId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        status,
        suggested_price: quote?.suggestedPrice,
        currency: quote?.currency,
        vehicle_type: quote?.vehicleType,
        reason: quote?.reason,
        updated_at: new Date().toISOString(),
      }),
    },
  );

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
        status: "ready",
        confirmation_text: summary.confirmationText,
        updated_at: new Date().toISOString(),
      }),
    },
  );
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
}

export async function recordBookingConfirmationSent(params: {
  bookingId: string;
  companyId: string;
}): Promise<void> {
  const booking = await getBookingById(params.bookingId, params.companyId);
  if (!booking?.conversation_id) throw new Error("Booking conversation not found");

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
  });
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
