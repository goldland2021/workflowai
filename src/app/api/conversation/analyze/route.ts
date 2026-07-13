import { z } from "zod";
import { TripDetailsSchema, DetectedEventSchema } from "@/lib/ai/schemas";
import { airportTransferConfiguration } from "@/lib/domain/airport-transfer";
import { analyzeCustomerTurn } from "@/lib/domain/ai-workflow";
import {
  BossInboxStatusSchema,
  BossInboxTypeSchema,
  BusinessConfigurationSchema,
  ChannelSchema,
  MessageRoleSchema,
} from "@/lib/domain/schemas";
import type { ConversationMessage } from "@/lib/domain/types";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { isWidgetOriginAllowed, verifyWidgetToken } from "@/lib/auth/widget";
import { isConfigured } from "@/lib/supabase/client";
import {
  bookingRowToTripDetails,
  createBossInboxItem,
  createConversation,
  getBusinessConfig,
  getBookingByConversationId,
  getBossInboxItemsByConversationId,
  getConversationById,
  getConversationBySessionId,
  getMessages,
  logAiFailure,
  saveMessage,
  updateConversationContact,
  upsertBooking,
} from "@/lib/supabase/database";
import { findCachedReply, cacheReply } from "@/lib/ai/reply-cache";
import { checkRateLimit, getClientIp } from "@/lib/ai/rate-limit";
import { checkUsageLimit, consumeUsage } from "@/lib/saas/usage";
import { getWidgetSettings } from "@/lib/supabase/saas";

export const runtime = "nodejs";

const TripDetailsRequestSchema = TripDetailsSchema.extend({
  routeDistanceKm: z.number().optional(),
  estimatedDriveTimeMinutes: z.number().optional(),
});

const ExistingBossInboxItemSchema = z.object({
  status: BossInboxStatusSchema,
  type: BossInboxTypeSchema,
  event: DetectedEventSchema.pick({ eventType: true }).optional(),
});

const RecentMessageRequestSchema = z
  .object({
    id: z.string().optional(),
    role: MessageRoleSchema,
    text: z.string().trim().min(1).max(4000),
    createdAt: z.string().optional(),
    channel: ChannelSchema.optional(),
  })
  .strict();

const AnalyzeCustomerTurnRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  currentTripDetails: TripDetailsRequestSchema,
  existingBossItems: z.array(ExistingBossInboxItemSchema).max(50),
  recentMessages: z.array(RecentMessageRequestSchema).max(8).optional(),
  businessConfiguration: BusinessConfigurationSchema.optional(),
  // ─── Persistence fields ───
  sessionId: z.string().optional(),
  conversationId: z.string().optional(),
  // Which company this widget visitor belongs to. Ignored for authenticated
  // admin requests, which are always scoped to the session's own company.
  companyId: z.string().optional(),
  widgetToken: z.string().max(300).optional(),
  widgetOrigin: z.string().max(500).optional(),
  // Test Lab preview turn - only honored for an authenticated admin session.
  simulate: z.boolean().optional(),
});

type AnalyzeCustomerTurnPayload = z.infer<typeof AnalyzeCustomerTurnRequestSchema>;

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = AnalyzeCustomerTurnRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid conversation analysis request.",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const payload: AnalyzeCustomerTurnPayload = parsed.data;

  // An authenticated admin session always identifies its own company; a
  // widget visitor has no session and must supply the company they belong to
  // (the embed script bakes this in, see /api/widget-embed).
  const sessionCompanyId = await getCurrentCompanyId();
  const isAdmin = Boolean(sessionCompanyId);
  const companyId = sessionCompanyId ?? payload.companyId;

  if (!companyId) {
    return Response.json({ error: "companyId is required." }, { status: 400 });
  }

  if (!checkRateLimit(`${companyId}:${getClientIp(request)}`)) {
    return Response.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  if (!isAdmin) {
    if (!verifyWidgetToken(companyId, payload.widgetToken)) {
      return Response.json({ error: "Invalid widget token." }, { status: 403 });
    }

    if (isConfigured()) {
      try {
        const widgetSettings = await getWidgetSettings(companyId);
        if (!isWidgetOriginAllowed(payload.widgetOrigin, widgetSettings.allowedWidgetOrigins)) {
          return Response.json({ error: "Widget origin is not allowed." }, { status: 403 });
        }
      } catch {
        return Response.json({ error: "Widget security is not configured." }, { status: 503 });
      }
    }
  }

  // The owner's Test Lab previews how the AI would behave without creating
  // real conversations, bookings, or Boss Inbox items - and without polluting
  // the cache with test replies. Only an admin session can request this.
  const isSimulation = isAdmin && payload.simulate === true;

  // ─── 1. Database persistence ───
  const hasDb = isConfigured() && !isSimulation;
  const canUseCache = !isSimulation;

  if (hasDb) {
    try {
      const gate = await checkUsageLimit(companyId, "ai_messages");
      if (!gate.allowed) {
        return Response.json(
          {
            error: gate.reason === "trial_expired" ? "Trial expired." : "Usage limit reached.",
            code: gate.reason,
            usage: gate.summary.usage,
            limits: gate.summary.limits,
          },
          { status: 402 },
        );
      }
    } catch (e) {
      console.warn("Usage gate unavailable; continuing until migration 003 is applied", e);
    }
  }

  let conversationId: string | undefined = payload.conversationId;
  let createdNewConversation = false;
  let currentTripDetails = payload.currentTripDetails;
  let existingBossItems = payload.existingBossItems;
  const customerMessage: ConversationMessage = {
    id: `msg_customer_${Date.now()}`,
    role: "customer",
    text: payload.message,
    createdAt: new Date().toISOString(),
    channel: "website_widget",
  };

  if (hasDb && conversationId) {
    try {
      // A browser can replay any conversation ID it has seen. Verify the
      // conversation belongs to this company before accepting a new message.
      const conversation = await getConversationById(conversationId, companyId);
      if (!conversation) {
        return Response.json({ error: "Conversation not found." }, { status: 404 });
      }

      try {
        const storedBooking = await getBookingByConversationId(conversationId, companyId);
        if (storedBooking) currentTripDetails = bookingRowToTripDetails(storedBooking);
      } catch (e) {
        console.warn("Failed to load stored trip details", e);
      }

      try {
        const storedInboxItems = await getBossInboxItemsByConversationId(conversationId, companyId);
        existingBossItems = storedInboxItems.map((item) => ({
          status: item.status as "pending" | "approved" | "edited" | "rejected",
          type: item.type as "quote_approval" | "event_review" | "driver_assignment" | "receipt_request" | "change_request" | "payment_coordination",
          event: item.event_type ? { eventType: item.event_type as never } : undefined,
        }));
      } catch (e) {
        console.warn("Failed to load existing inbox items", e);
      }
    } catch (e) {
      console.warn("Failed to verify conversation ownership", e);
      return Response.json({ error: "Unable to verify conversation." }, { status: 503 });
    }
  }

  if (hasDb) {
    try {
      // Auto-create conversation if needed
      if (!conversationId) {
        const sessionId = payload.sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        conversationId = await createConversation(sessionId, companyId);
        createdNewConversation = true;
      }

      // Save customer message to DB
      await saveMessage(conversationId, customerMessage);
      try {
        await consumeUsage(companyId, "ai_messages");
        if (createdNewConversation) await consumeUsage(companyId, "conversations");
      } catch (e) {
        console.warn("Failed to record usage", e);
      }
    } catch (e) {
      console.warn("Failed to save message to DB, continuing without persistence", e);
    }
  }

  // ─── 2. Try cache after persistence so every turn keeps a history trail ───
  if (canUseCache && (payload.recentMessages?.length === 0 || !payload.recentMessages)) {
    const cached = findCachedReply(companyId, payload.message);
    if (cached) {
      const aiMessage: ConversationMessage = {
        id: `cached_${Date.now()}`,
        role: "ai",
        text: cached,
        createdAt: new Date().toISOString(),
        channel: "website_widget",
      };

      if (hasDb && conversationId) {
        try {
          await saveMessage(conversationId, aiMessage);
        } catch (e) {
          console.warn("Failed to save cached AI reply to DB", e);
        }
      }

      return Response.json({
        aiMessage,
        tripDetails: currentTripDetails,
        contact: null,
        detectedEvents: [],
        bossInboxItems: [],
        conversationId,
        isNewConversation: createdNewConversation,
      });
    }
  }

  // ─── 3. Run AI analysis ───
  const recentMessagesForAI = payload.recentMessages?.map(
    (message, index): ConversationMessage => ({
      id: message.id ?? `hist_${index}`,
      role: message.role,
      text: message.text,
      createdAt: message.createdAt ?? "",
      channel: message.channel ?? "website_widget",
    }),
  );

  // Only an authenticated admin session may override the business configuration
  // for this request (used by the owner's Test Lab to preview unsaved edits).
  // Anonymous widget visitors always get the persisted/default configuration —
  // otherwise a visitor could submit their own pricing rules or behavior
  // boundaries and have the AI reason from them.
  const configToUse =
    isAdmin && payload.businessConfiguration
      ? payload.businessConfiguration
      : (isConfigured() ? await getBusinessConfig(companyId) : null) ?? airportTransferConfiguration;

  let result;
  try {
    result = await analyzeCustomerTurn({
      message: payload.message,
      currentTripDetails,
      configuration: configToUse,
      existingBossItems,
      recentMessages: recentMessagesForAI,
    });
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : "AI analysis failed";
    if (hasDb) {
      await logAiFailure({
        companyId,
        conversationId,
        stage: "analyze_customer_turn",
        message: failureMessage,
        provider: "workflow-ai",
      }).catch(() => undefined);
    }
    return Response.json({ error: "AI 暂时不可用，请稍后重试。" }, { status: 503 });
  }

  let bossInboxItems = result.bossInboxItems;

  // ─── 4. Save AI reply and operational records to DB ───
  if (hasDb && conversationId) {
    try {
      await saveMessage(conversationId, result.aiMessage);
    } catch (e) {
      console.warn("Failed to save AI reply to DB", e);
    }

    let bookingId: string | undefined;
    try {
      bookingId = await upsertBooking(conversationId, result.tripDetails, companyId);
    } catch (e) {
      console.warn("Failed to upsert booking draft to DB", e);
    }

    if (result.contact) {
      try {
        await updateConversationContact(conversationId, companyId, result.contact);
        await consumeUsage(companyId, "leads");
      } catch (e) {
        console.warn("Failed to persist captured contact or usage", e);
      }
    }

    if (result.bossInboxItems.length > 0) {
      if (result.bossInboxItems.some((item) => item.type === "quote_approval")) {
        try {
          await consumeUsage(companyId, "quote_suggestions");
        } catch (e) {
          console.warn("Failed to record quote usage", e);
        }
      }
      try {
        bossInboxItems = await Promise.all(
          result.bossInboxItems.map(async (item) => {
            const savedId = await createBossInboxItem({
              ...item,
              bookingId,
              conversationId,
              companyId,
            });

            return savedId ? { ...item, id: savedId } : item;
          }),
        );
      } catch (e) {
        console.warn("Failed to save Boss Inbox items to DB", e);
      }
    }
  }

  // ─── 5. Cache the reply (only for simple turns without events) ───
  if (canUseCache && result.detectedEvents.length === 0 && !result.contact && result.bossInboxItems.length === 0) {
    cacheReply(companyId, payload.message, result.aiMessage.text);
  }

  return Response.json({
    ...result,
    bossInboxItems,
    conversationId,
    isNewConversation: createdNewConversation,
  });
}

// ─── GET: Load conversation history by sessionId ───
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  const conversationId = searchParams.get("conversationId");

  const sessionCompanyId = await getCurrentCompanyId();
  const companyId = sessionCompanyId ?? searchParams.get("companyId");

  if (!companyId) {
    return Response.json({ error: "companyId is required" }, { status: 400 });
  }

  if (!conversationId && !sessionId) {
    return Response.json(
      { error: "Provide either conversationId or sessionId" },
      { status: 400 },
    );
  }

  if (!isConfigured()) {
    return Response.json({ messages: [], conversationId: null });
  }

  try {
    // If we have a direct conversationId, verify it belongs to this company
    // before returning anything — otherwise a visitor who guesses or replays
    // another company's conversationId could read that company's messages.
    if (conversationId) {
      const conversation = await getConversationById(conversationId, companyId);
      if (!conversation) {
        return Response.json({ messages: [], conversationId: null });
      }

      const messages = await getMessages(conversationId);
      return Response.json({ messages, conversationId });
    }

    // Otherwise, look up the latest conversation for this browser session.
    const match = sessionId ? await getConversationBySessionId(sessionId, companyId) : null;

    if (!match) {
      return Response.json({ messages: [], conversationId: null });
    }

    const messages = await getMessages(match.id);
    return Response.json({ messages, conversationId: match.id });
  } catch (e) {
    console.warn("Failed to load conversation history", e);
    return Response.json({ messages: [], conversationId: null, error: "Failed to load" });
  }
}
