import "server-only";

import { canConsumeUsage, incrementUsageCounter, type UsageSummary } from "@/lib/supabase/saas";
import type { UsageMetric } from "./plans";

export async function checkUsageLimit(companyId: string, metric: UsageMetric, amount = 1): Promise<{
  allowed: boolean;
  reason?: "trial_expired" | "limit_reached";
  summary: UsageSummary;
}> {
  return canConsumeUsage(companyId, metric, amount);
}

export async function consumeUsage(companyId: string, metric: UsageMetric, amount = 1): Promise<void> {
  await incrementUsageCounter(companyId, metric, amount);
}
