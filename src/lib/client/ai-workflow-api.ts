import type { AnalyzeCustomerTurnRequest, WorkflowResult } from "@/lib/domain/workflow-types";

function buildApiUrl(path: string, apiBaseUrl?: string): string {
  if (!apiBaseUrl) return path;
  return `${apiBaseUrl.replace(/\/$/, "")}${path}`;
}

export async function analyzeCustomerTurnOnServer(
  input: AnalyzeCustomerTurnRequest,
  apiBaseUrl?: string,
): Promise<WorkflowResult & { conversationId?: string | null }> {
  const response = await fetch(buildApiUrl("/api/conversation/analyze", apiBaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Conversation analysis failed with status ${response.status}`);
  }

  return (await response.json()) as WorkflowResult & { conversationId?: string | null };
}

/**
 * Load conversation history from the server by session or conversation ID.
 */
export async function loadConversationHistory(params: {
  sessionId?: string;
  conversationId?: string;
  companyId?: string;
}, apiBaseUrl?: string): Promise<{ messages: Array<{ id: string; role: string; text: string; created_at: string }>; conversationId: string | null }> {
  const query = new URLSearchParams();
  if (params.sessionId) query.set("sessionId", params.sessionId);
  if (params.conversationId) query.set("conversationId", params.conversationId);
  if (params.companyId) query.set("companyId", params.companyId);

  if (!query.toString()) {
    return { messages: [], conversationId: null };
  }

  const response = await fetch(buildApiUrl(`/api/conversation/analyze?${query.toString()}`, apiBaseUrl), {
    method: "GET",
  });

  if (!response.ok) {
    return { messages: [], conversationId: null };
  }

  return response.json();
}
