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
  const recentMessagesForAI = payload.recentMessages?.map(
    (message, index): ConversationMessage => ({
      id: message.id ?? `hist_${index}`,
      role: message.role,
      text: message.text,
      createdAt: message.createdAt ?? "",
      channel: message.channel ?? "website_widget",
    }),
  );

  // Use provided config from UI (for teaching/correcting data) or default
  const configToUse = payload.businessConfiguration ?? airportTransferConfiguration;

  const result = await analyzeCustomerTurn({
    message: payload.message,
    currentTripDetails: payload.currentTripDetails,
    configuration: configToUse,
    existingBossItems: payload.existingBossItems,
    recentMessages: recentMessagesForAI,
  });

  return Response.json(result);
}
