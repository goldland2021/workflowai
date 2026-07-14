import type {
  BossInboxItem,
  BusinessConfiguration,
  CapturedContact,
  ConversationMessage,
  DetectedEvent,
  TripDetails,
} from "./types";
import type { PromptLang } from "../ai/prompts/templates";

export interface ExistingBossInboxItem {
  status: BossInboxItem["status"];
  type: BossInboxItem["type"];
  event?: Pick<DetectedEvent, "eventType">;
}

export interface AnalyzeCustomerTurnRequest {
  message: string;
  currentTripDetails: TripDetails;
  existingBossItems: ExistingBossInboxItem[];
  recentMessages?: ConversationMessage[];   // last few turns for context
  languageHint?: PromptLang; // host-page locale, used only until the customer language is established
  businessConfiguration?: BusinessConfiguration; // allow teaching/editing config via UI
  sessionId?: string;       // browser session for persistence
  conversationId?: string;  // existing conversation to continue
  companyId?: string;       // which company this conversation belongs to (widget visitors only; admin requests use the session's company)
  widgetToken?: string;     // signed public widget credential
  widgetOrigin?: string;    // top-level site origin captured by the embed script
  simulate?: boolean;       // Test Lab preview turn (admin only) - skips DB persistence and the reply cache
}

export interface WorkflowResult {
  aiMessage: ConversationMessage;
  tripDetails: TripDetails;
  contact?: CapturedContact;
  detectedEvents: DetectedEvent[];
  bossInboxItems: BossInboxItem[];
  conversationId?: string | null;  // assigned by server
  isNewConversation?: boolean;
}
