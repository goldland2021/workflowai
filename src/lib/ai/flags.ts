import "server-only";

/**
 * Feature flags for the conversation engine refactor.
 *
 * The orchestrator (single structured LLM call that owns extraction, event
 * detection, and reply drafting) runs behind this flag so it can be rolled out
 * gradually alongside the legacy rule-based path. Default OFF: production keeps
 * the current behavior until the flag is explicitly enabled.
 */
export function isOrchestratorEnabled(): boolean {
  return process.env.AI_ORCHESTRATOR_ENABLED === "true";
}
