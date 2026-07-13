export type PlanId = "trial" | "starter" | "growth";

export type UsageMetric = "ai_messages" | "conversations" | "leads" | "quote_suggestions";

export interface PlanDefinition {
  id: PlanId;
  label: string;
  monthlyPrice: number;
  currency: "USD";
  description: string;
  aiMessages: number;
  conversations: number;
  leads: number;
  quoteSuggestions: number;
}

export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  trial: {
    id: "trial",
    label: "试用版",
    monthlyPrice: 0,
    currency: "USD",
    description: "先验证 AI 员工是否适合你的业务。",
    aiMessages: 200,
    conversations: 50,
    leads: 25,
    quoteSuggestions: 25,
  },
  starter: {
    id: "starter",
    label: "基础版",
    monthlyPrice: 49,
    currency: "USD",
    description: "适合刚开始接入网站客服的机场接送公司。",
    aiMessages: 3000,
    conversations: 500,
    leads: 250,
    quoteSuggestions: 250,
  },
  growth: {
    id: "growth",
    label: "增长版",
    monthlyPrice: 149,
    currency: "USD",
    description: "适合有稳定线索和更高对话量的团队。",
    aiMessages: 15000,
    conversations: 2500,
    leads: 1500,
    quoteSuggestions: 1500,
  },
};

export function normalizePlan(value: string | null | undefined): PlanId {
  if (value === "starter" || value === "growth") return value;
  return "trial";
}

export function getPlanLimit(plan: PlanId, metric: UsageMetric): number {
  const definition = PLAN_DEFINITIONS[plan];
  const key = metric === "ai_messages"
    ? "aiMessages"
    : metric === "conversations"
      ? "conversations"
      : metric === "leads"
        ? "leads"
        : "quoteSuggestions";
  return definition[key];
}
