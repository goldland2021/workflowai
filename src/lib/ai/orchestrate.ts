import "server-only";

import { z } from "zod";
import { generateStructured, orchestratorModel } from "./client";
import { TripDetailsSchema, DetectedEventSchema, ContactSchema } from "./schemas";
import type { PromptLang } from "./prompts/templates";
import type {
  BusinessConfiguration,
  CapturedContact,
  ConversationMessage,
  DetectedEvent,
  TripDetails,
} from "../domain/types";

/**
 * Phase 1 orchestrator: a SINGLE structured LLM call that produces, in one
 * round trip, the trip-detail delta, detected events, any captured contact, and
 * a natural-language reply draft.
 *
 * Control is inverted relative to the legacy path: the model understands the
 * message and decides what to say. The caller then applies deterministic
 * guardrails on top (pricing/approval from `pricing-guardrail`, event boundary
 * filtering, field normalization). Crucially, the model is told never to invent
 * a price — the code injects the authoritative amount afterward.
 *
 * This module only performs the model call and shape-mapping. All downstream
 * guardrails stay in `analyzeCustomerTurn`, shared with the legacy path.
 */

// Each trip field catches to undefined on its own, so one malformed field
// (e.g. a bad enum) drops only that field instead of wiping the whole delta.
const LenientTripDetailsSchema = z.object(
  Object.fromEntries(
    Object.entries(TripDetailsSchema.shape).map(([key, schema]) => [
      key,
      (schema as z.ZodTypeAny).catch(undefined),
    ]),
  ),
);

const OrchestratorTurnSchema = z.object({
  // Each sub-field degrades gracefully: a malformed part never throws away the
  // whole turn (which would force a fallback to the legacy rule path).
  tripDetails: LenientTripDetailsSchema.catch({}),
  events: z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((item) => {
        const parsed = DetectedEventSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
  contact: ContactSchema.nullable().catch(null),
  reply: z.string().catch(""),
});

export interface OrchestratedTurn {
  tripDetailsDelta: TripDetails;
  detectedEvents: DetectedEvent[];
  contact?: CapturedContact;
  replyDraft: string;
}

function langInstruction(lang: PromptLang): string {
  if (lang === "zh") return "用简体中文回复客户。";
  if (lang === "ar") return "Reply to the customer in Arabic only.";
  return "Reply to the customer in English only.";
}

function buildOrchestratorPrompt(params: {
  lang: PromptLang;
  configuration: BusinessConfiguration;
  currentTripDetails: TripDetails;
  recentMessages?: ConversationMessage[];
  message: string;
}): { system: string; prompt: string } {
  const company = params.configuration.companyProfile;
  const vehicles = (params.configuration.vehicles ?? [])
    .map((v) => `- ${v.name}: up to ${v.capacity.passengers} passengers, ${v.capacity.luggage} luggage. ${v.description ?? ""}`)
    .join("\n") || "- Toyota Alphard\n- Toyota Hiace";
  const faq = (params.configuration.faq ?? [])
    .map((f) => `- ${f.question} => ${f.answer}`)
    .join("\n") || "(none)";
  const boundaries = (params.configuration.aiBehaviorBoundaries ?? [])
    .map((b) => `- ${b}`)
    .join("\n") || "(none)";
  const history = (params.recentMessages ?? [])
    .slice(-10)
    .map((m) => `${m.role === "customer" ? "Customer" : "AI"}: ${m.text}`)
    .join("\n") || "(none)";
  const allowedEvents = (params.configuration.escalationRules ?? [])
    .map((rule) => `- ${rule.eventType}: ${rule.description ?? ""}`)
    .join("\n") || "(none)";

  const system = [
    `You are the AI front-desk agent for "${company?.name ?? "an airport transfer company"}".`,
    "You handle airport transfers, private charters, and day tours.",
    "Understand the latest customer message in the context of the conversation, then produce ONE structured result.",
    "",
    "Rules:",
    "- NEVER invent or state a price, currency, or amount. Pricing is added by the system afterward; if the customer asks the price, acknowledge and continue collecting what is needed.",
    "- NEVER promise anything only the owner can decide (discounts, refunds, guaranteed availability). Flag those as events instead.",
    "- Extract only fields explicitly stated or confidently inferable; do not fabricate.",
    "- Extract passenger and luggage counts written in ANY language or numerals (e.g. Arabic \"4 ركاب\", Chinese \"4 件行李\").",
    "- Detect serviceType. Going out and returning to the SAME start point with ONE destination (even same-day, e.g. airport -> town -> back to airport) => \"round_trip\". Use \"day_tour\" ONLY for MULTIPLE distinct sightseeing stops. List named stops in routeStops.",
    "- If the customer changes an already-agreed pickup time, set the new time AND add a \"Pickup Time Change\" event.",
    "- Ask at most ONE question, prioritizing the most important missing field.",
    "- Keep the reply short and natural (1 short sentence by default, at most 2).",
    `- ${langInstruction(params.lang)}`,
    "",
    "Available vehicles:",
    vehicles,
    "",
    "FAQ:",
    faq,
    "",
    "AI boundaries (must respect):",
    boundaries,
    "",
    "Allowed event types (use the eventType string EXACTLY as written, or omit the event):",
    allowedEvents,
  ].join("\n");

  const prompt = [
    "Recent conversation:",
    history,
    "",
    `Latest customer message: "${params.message}"`,
    "",
    "Known trip details so far (JSON):",
    JSON.stringify(params.currentTripDetails, null, 2),
    "",
    "Return a JSON object with these fields:",
    '- "tripDetails": object with ONLY the new or corrected trip fields from this message (a delta, camelCase keys). ALWAYS populate passengerCount and luggageCount as integers whenever the customer states a number of people or bags, in ANY language or script (Arabic/Chinese numerals included) — never leave them only in the reply text. serviceType must be one of: airport_pickup, airport_dropoff, city_transfer, round_trip, day_tour, hourly_charter, multi_leg_itinerary.',
    '- "events": array of business events needing owner attention. eventType MUST be copied verbatim from the allowed event types list above (do not invent or rephrase). Include a complaint, a change to an already-agreed time, or a multi-stop itinerary as their matching event. Each: eventType, summary, suggestedOwnerAction, severity. Empty if none; do not over-detect.',
    '- "contact": { method, value } if the customer shared a WhatsApp/Telegram/Email to be reached at, else null.',
    '- "reply": the customer-facing reply text, following the rules above and with NO price.',
  ].join("\n");

  return { system, prompt };
}

/**
 * Run the single-call orchestrator. Throws on model/parse failure so the caller
 * can fall back to the legacy multi-call path within the same turn.
 */
export async function orchestrateTurn(params: {
  message: string;
  currentTripDetails: TripDetails;
  configuration: BusinessConfiguration;
  recentMessages?: ConversationMessage[];
  lang: PromptLang;
}): Promise<OrchestratedTurn> {
  const { system, prompt } = buildOrchestratorPrompt(params);

  const parsed = await generateStructured(OrchestratorTurnSchema, prompt, system, 0.2, orchestratorModel);

  if (process.env.ORCH_DEBUG === "1") {
    // eslint-disable-next-line no-console
    console.log("[ORCH_DEBUG] parsed =", JSON.stringify(parsed));
  }

  const detectedEvents: DetectedEvent[] = parsed.events.map((ev, i) => ({
    id: `event_orch_${Date.now()}_${i}`,
    eventType: ev.eventType,
    summary: ev.summary,
    suggestedOwnerAction: ev.suggestedOwnerAction,
    severity: ev.severity,
    status: "pending" as const,
  }));

  const contact: CapturedContact | undefined = parsed.contact
    ? { method: parsed.contact.method, value: parsed.contact.value }
    : undefined;

  return {
    tripDetailsDelta: parsed.tripDetails as TripDetails,
    detectedEvents,
    contact,
    replyDraft: parsed.reply ?? "",
  };
}
