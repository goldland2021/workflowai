import "server-only";

import { canConsumeUsage, type UsageSummary } from "@/lib/supabase/saas";
import type { UsageMetric } from "./plans";

export async function checkUsageLimit(
  companyId: string,
  metric: UsageMetric,
  amount = 1,
  idempotencyKey?: string,
): Promise<{
  allowed: boolean;
  reason?: "trial_expired" | "limit_reached";
  summary: UsageSummary;
}> {
  return canConsumeUsage(companyId, metric, amount, idempotencyKey);
}

export async function consumeUsage(
  companyId: string,
  metric: UsageMetric,
  amount = 1,
  idempotencyKey?: string,
): Promise<boolean> {
  return (await canConsumeUsage(companyId, metric, amount, idempotencyKey)).allowed;
}
