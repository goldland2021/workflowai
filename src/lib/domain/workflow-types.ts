import type {
  BossInboxItem,
  BusinessConfiguration,
  CapturedContact,
  ConversationMessage,
  DetectedEvent,
  TripDetails,
} from "./types";

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
  businessConfiguration?: BusinessConfiguration; // allow teaching/editing config via UI
}

export interface WorkflowResult {
  aiMessage: ConversationMessage;
  tripDetails: TripDetails;
  contact?: CapturedContact;
  detectedEvents: DetectedEvent[];
  bossInboxItems: BossInboxItem[];
}
