import type { AnalyzeCustomerTurnRequest, WorkflowResult } from "@/lib/domain/workflow-types";

export async function analyzeCustomerTurnOnServer(
  input: AnalyzeCustomerTurnRequest,
): Promise<WorkflowResult> {
  const response = await fetch("/api/conversation/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Conversation analysis failed with status ${response.status}`);
  }

  return (await response.json()) as WorkflowResult;
}
