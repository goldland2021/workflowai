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
import { isConfigured } from "@/lib/supabase/client";
import {
  createBossInboxItem,
  createConversation,
  getConversationBySessionId,
  getMessages,
  saveMessage,
  upsertBooking,
} from "@/lib/supabase/database";
import { findCachedReply, cacheReply } from "@/lib/ai/reply-cache";

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

  // ─── 1. Database persistence ───
  const hasDb = isConfigured();
  let conversationId: string | undefined = payload.conversationId;
  let createdNewConversation = false;
  const customerMessage: ConversationMessage = {
    id: `msg_customer_${Date.now()}`,
    role: "customer",
    text: payload.message,
    createdAt: new Date().toISOString(),
    channel: "website_widget",
  };

  if (hasDb) {
    try {
      // Auto-create conversation if needed
      if (!conversationId) {
        const sessionId = payload.sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        conversationId = await createConversation(sessionId);
        createdNewConversation = true;
      }

      // Save customer message to DB
      await saveMessage(conversationId, customerMessage);
    } catch (e) {
      console.warn("Failed to save message to DB, continuing without persistence", e);
    }
  }

  // ─── 2. Try cache after persistence so every turn keeps a history trail ───
  if (payload.recentMessages?.length === 0 || !payload.recentMessages) {
    const cached = findCachedReply(payload.message);
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
        tripDetails: payload.currentTripDetails,
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

  const configToUse = payload.businessConfiguration ?? airportTransferConfiguration;

  const result = await analyzeCustomerTurn({
    message: payload.message,
    currentTripDetails: payload.currentTripDetails,
    configuration: configToUse,
    existingBossItems: payload.existingBossItems,
    recentMessages: recentMessagesForAI,
  });

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
      bookingId = await upsertBooking(conversationId, result.tripDetails);
    } catch (e) {
      console.warn("Failed to upsert booking draft to DB", e);
    }

    if (result.bossInboxItems.length > 0) {
      try {
        bossInboxItems = await Promise.all(
          result.bossInboxItems.map(async (item) => {
            const savedId = await createBossInboxItem({
              ...item,
              bookingId,
              conversationId,
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
  if (result.detectedEvents.length === 0 && !result.contact && result.bossInboxItems.length === 0) {
    cacheReply(payload.message, result.aiMessage.text);
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
    // If we have a direct conversationId, load messages
    if (conversationId) {
      const messages = await getMessages(conversationId);
      return Response.json({ messages, conversationId });
    }

    // Otherwise, look up the latest conversation for this browser session.
    const match = sessionId ? await getConversationBySessionId(sessionId) : null;

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
