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
  updateConversationLanguage,
  upsertBooking,
} from "@/lib/supabase/database";
import { findCachedReply, cacheReply } from "@/lib/ai/reply-cache";
import { checkDistributedRateLimit, getClientIp } from "@/lib/ai/rate-limit";
import { checkUsageLimit, consumeUsage } from "@/lib/saas/usage";
import { getWidgetSettings } from "@/lib/supabase/saas";
import { resolveConversationLang } from "@/lib/ai/prompts/templates";

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
  languageHint: z.enum(["zh", "en", "ar"]).optional(),
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

async function authorizeWidgetRequest(
  companyId: string,
  widgetToken: string | undefined,
  widgetOrigin: string | undefined,
): Promise<Response | null> {
  if (!widgetToken) {
    return Response.json({ error: "Invalid widget token." }, { status: 403 });
  }

  if (!isConfigured()) {
    return verifyWidgetToken(companyId, widgetToken)
      ? null
      : Response.json({ error: "Invalid widget token." }, { status: 403 });
  }

  try {
    const widgetSettings = await getWidgetSettings(companyId);
    if (!verifyWidgetToken(companyId, widgetToken, widgetSettings.widgetTokenVersion)) {
      return Response.json({ error: "Invalid widget token." }, { status: 403 });
    }
    if (!isWidgetOriginAllowed(widgetOrigin, widgetSettings.allowedWidgetOrigins)) {
      return Response.json({ error: "Widget origin is not allowed." }, { status: 403 });
    }
    return null;
  } catch {
    return Response.json({ error: "Widget security is not configured." }, { status: 503 });
  }
}

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

  const [rateAllowed, authorizationError] = await Promise.all([
    checkDistributedRateLimit(`conversation:${companyId}:${getClientIp(request)}`),
    isAdmin
      ? Promise.resolve(null)
      : authorizeWidgetRequest(companyId, payload.widgetToken, payload.widgetOrigin),
  ]);

  if (!rateAllowed) {
    return Response.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }
  if (authorizationError) return authorizationError;

  // The owner's Test Lab previews how the AI would behave without creating
  // real conversations, bookings, or Boss Inbox items - and without polluting
  // the cache with test replies. Only an admin session can request this.
  const isSimulation = isAdmin && payload.simulate === true;

  // ─── 1. Database persistence ───
  const hasDb = isConfigured() && !isSimulation;
  const canUseCache = !isSimulation;

  let conversationId: string | undefined = payload.conversationId;
  let createdNewConversation = false;
  let currentTripDetails = payload.currentTripDetails;
  let existingBossItems = payload.existingBossItems;
  let persistedCustomerLanguage: "zh" | "en" | "ar" | undefined;
  const customerMessage: ConversationMessage = {
    id: `msg_customer_${Date.now()}`,
    role: "customer",
    text: payload.message,
    createdAt: new Date().toISOString(),
    channel: "website_widget",
  };

  let configToUse = airportTransferConfiguration;
  try {
    const [gate, persistedConfig, conversation] = await Promise.all([
      hasDb ? checkUsageLimit(companyId, "ai_messages") : Promise.resolve(null),
      isAdmin && payload.businessConfiguration
        ? Promise.resolve(payload.businessConfiguration)
        : isConfigured()
          ? getBusinessConfig(companyId)
          : Promise.resolve(null),
      hasDb && conversationId
        ? getConversationById(conversationId, companyId)
        : Promise.resolve(undefined),
    ]);

    configToUse = persistedConfig ?? airportTransferConfiguration;
    persistedCustomerLanguage = conversation?.customer_language ?? undefined;
    if (gate && !gate.allowed) {
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
    if (hasDb && conversationId && !conversation) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }
  } catch {
    return Response.json({ error: "Required conversation services are unavailable." }, { status: 503 });
  }

  if (hasDb && conversationId) {
    const [bookingResult, inboxResult] = await Promise.allSettled([
      getBookingByConversationId(conversationId, companyId),
      getBossInboxItemsByConversationId(conversationId, companyId),
    ]);

    if (bookingResult.status === "fulfilled") {
      if (bookingResult.value) currentTripDetails = bookingRowToTripDetails(bookingResult.value);
    } else {
      console.warn("Failed to load stored trip details");
    }

    if (inboxResult.status === "fulfilled") {
      existingBossItems = inboxResult.value.map((item) => ({
        status: item.status as "pending" | "approved" | "edited" | "rejected",
        type: item.type as "quote_approval" | "event_review" | "driver_assignment" | "receipt_request" | "change_request" | "payment_coordination",
        event: item.event_type ? { eventType: item.event_type as never } : undefined,
      }));
    } else {
      console.warn("Failed to load existing inbox items");
    }
  }

  const recentMessagesForAI = payload.recentMessages?.map(
    (message, index): ConversationMessage => ({
      id: message.id ?? `hist_${index}`,
      role: message.role,
      text: message.text,
      createdAt: message.createdAt ?? "",
      channel: message.channel ?? "website_widget",
    }),
  );
  const customerLanguage = resolveConversationLang({
    customerMessage: payload.message,
    recentMessages: recentMessagesForAI,
    config: configToUse,
    lockedLanguage: persistedCustomerLanguage,
    languageHint: payload.languageHint,
  });

  if (hasDb) {
    try {
      // Auto-create conversation if needed
      if (!conversationId) {
        const sessionId = payload.sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        conversationId = await createConversation(sessionId, companyId, customerLanguage);
        createdNewConversation = true;
      }

      const persistenceTasks: Promise<unknown>[] = [
        saveMessage(conversationId, customerMessage),
        consumeUsage(companyId, "ai_messages"),
      ];
      if (createdNewConversation) {
        persistenceTasks.push(consumeUsage(companyId, "conversations"));
      } else if (!persistedCustomerLanguage) {
        persistenceTasks.push(updateConversationLanguage(conversationId, companyId, customerLanguage));
      }
      await Promise.all(persistenceTasks);
    } catch {
      return Response.json({ error: "Unable to persist this message." }, { status: 503 });
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
        } catch {
          console.warn("Failed to save cached AI reply to DB");
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
  let result;
  try {
    result = await analyzeCustomerTurn({
      message: payload.message,
      currentTripDetails,
      configuration: configToUse,
      existingBossItems,
      recentMessages: recentMessagesForAI,
      customerLanguage,
    });
  } catch {
    if (hasDb) {
      await logAiFailure({
        companyId,
        conversationId,
        stage: "analyze_customer_turn",
        message: "AI workflow request failed",
        provider: "workflow-ai",
      }).catch(() => undefined);
    }
    return Response.json({ error: "AI 暂时不可用，请稍后重试。" }, { status: 503 });
  }

  let bossInboxItems = result.bossInboxItems;

  // ─── 4. Save AI reply and operational records to DB ───
  if (hasDb && conversationId) {
    const shouldUpdateBooking = result.tripDetails !== currentTripDetails;
    const [messageResult, bookingResult] = await Promise.allSettled([
      saveMessage(conversationId, result.aiMessage),
      shouldUpdateBooking
        ? upsertBooking(conversationId, result.tripDetails, companyId)
        : Promise.resolve(undefined),
    ]);

    if (messageResult.status === "rejected") {
      console.warn("Failed to save AI reply to DB");
    }

    const bookingId = bookingResult.status === "fulfilled" ? bookingResult.value : undefined;
    if (bookingResult.status === "rejected") {
      console.warn("Failed to upsert booking draft to DB");
    }

    if (result.contact) {
      try {
        await updateConversationContact(conversationId, companyId, result.contact);
        await consumeUsage(companyId, "leads");
      } catch {
        console.warn("Failed to persist captured contact or usage");
      }
    }

    if (result.bossInboxItems.length > 0) {
      if (result.bossInboxItems.some((item) => item.type === "quote_approval")) {
        try {
          await consumeUsage(companyId, "quote_suggestions");
        } catch {
          console.warn("Failed to record quote usage");
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
      } catch {
        console.warn("Failed to save Boss Inbox items to DB");
      }
    }
  }

  // ─── 5. Cache the reply (only for simple turns without events) ───
  if (
    canUseCache &&
    Object.keys(result.tripDetails).length === 0 &&
    result.detectedEvents.length === 0 &&
    !result.contact &&
    result.bossInboxItems.length === 0
  ) {
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

  if (!sessionCompanyId) {
    const authorizationError = await authorizeWidgetRequest(
      companyId,
      request.headers.get("x-workflowai-widget-token") ?? undefined,
      request.headers.get("x-workflowai-widget-origin") ?? undefined,
    );
    if (authorizationError) return authorizationError;
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
  } catch {
    console.warn("Failed to load conversation history");
    return Response.json({ messages: [], conversationId: null, error: "Failed to load" });
  }
}
