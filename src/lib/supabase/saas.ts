import "server-only";

import { createHash, randomBytes } from "crypto";
import { supabaseFetch } from "./client";
import { getPlanLimit, normalizePlan, type PlanId, type UsageMetric } from "@/lib/saas/plans";

const FALLBACK_TRIAL_MS = 1000 * 60 * 60 * 24 * 14;

export type CompanySaasState = {
  companyId: string;
  plan: PlanId;
  subscriptionStatus: string;
  trialEndsAt: string;
  emailVerifiedAt: string | null;
  allowedWidgetOrigins: string[];
  widgetTokenVersion: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type UsageCounter = {
  company_id: string;
  period_start: string;
  ai_messages: number;
  conversations: number;
  leads: number;
  quote_suggestions: number;
};

export type UsageSummary = CompanySaasState & {
  periodStart: string;
  usage: Record<UsageMetric, number>;
  limits: Record<UsageMetric, number>;
  trialExpired: boolean;
};

function currentPeriodStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function fallbackTrialEndsAt(): string {
  return new Date(Date.now() + FALLBACK_TRIAL_MS).toISOString();
}

export async function getCompanySaasState(companyId: string): Promise<CompanySaasState> {
  const fallback: CompanySaasState = {
    companyId,
    plan: "trial",
    subscriptionStatus: "trialing",
    trialEndsAt: fallbackTrialEndsAt(),
    emailVerifiedAt: null,
    allowedWidgetOrigins: [],
    widgetTokenVersion: 1,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    subscriptionCurrentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };

  try {
    const res = await supabaseFetch(
      `/rest/v1/companies?id=eq.${encodeURIComponent(companyId)}&select=id,plan,subscription_status,trial_ends_at,email_verified_at,allowed_widget_origins,widget_token_version,stripe_customer_id,stripe_subscription_id,stripe_price_id,subscription_current_period_end,cancel_at_period_end&limit=1`,
    );
    const rows = (await res.json()) as Array<{
      id: string;
      plan?: string | null;
      subscription_status?: string | null;
      trial_ends_at?: string | null;
      email_verified_at?: string | null;
      allowed_widget_origins?: string[] | null;
      widget_token_version?: number | null;
      stripe_customer_id?: string | null;
      stripe_subscription_id?: string | null;
      stripe_price_id?: string | null;
      subscription_current_period_end?: string | null;
      cancel_at_period_end?: boolean | null;
    }>;
    const row = rows[0];
    if (!row) return fallback;
    return {
      companyId: row.id,
      plan: normalizePlan(row.plan),
      subscriptionStatus: row.subscription_status ?? "trialing",
      trialEndsAt: row.trial_ends_at ?? fallbackTrialEndsAt(),
      emailVerifiedAt: row.email_verified_at ?? null,
      allowedWidgetOrigins: row.allowed_widget_origins ?? [],
      widgetTokenVersion: row.widget_token_version ?? 1,
      stripeCustomerId: row.stripe_customer_id ?? null,
      stripeSubscriptionId: row.stripe_subscription_id ?? null,
      stripePriceId: row.stripe_price_id ?? null,
      subscriptionCurrentPeriodEnd: row.subscription_current_period_end ?? null,
      cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
    // Keep the 003 SaaS foundation usable while 005 billing columns are being
    // rolled out. The full select fails on older databases because PostgREST
    // rejects unknown columns instead of returning partial rows.
    try {
      const res = await supabaseFetch(
        `/rest/v1/companies?id=eq.${encodeURIComponent(companyId)}&select=id,plan,subscription_status,trial_ends_at,email_verified_at,allowed_widget_origins,widget_token_version&limit=1`,
      );
      const rows = (await res.json()) as Array<{
        id: string;
        plan?: string | null;
        subscription_status?: string | null;
        trial_ends_at?: string | null;
        email_verified_at?: string | null;
        allowed_widget_origins?: string[] | null;
        widget_token_version?: number | null;
      }>;
      const row = rows[0];
      if (!row) return fallback;
      return {
        companyId: row.id,
        plan: normalizePlan(row.plan),
        subscriptionStatus: row.subscription_status ?? "trialing",
        trialEndsAt: row.trial_ends_at ?? fallbackTrialEndsAt(),
        emailVerifiedAt: row.email_verified_at ?? null,
        allowedWidgetOrigins: row.allowed_widget_origins ?? [],
        widgetTokenVersion: row.widget_token_version ?? 1,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePriceId: null,
        subscriptionCurrentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
    } catch {
      return fallback;
    }
  }
}

export type BillingStatePatch = {
  plan?: PlanId;
  subscriptionStatus?: "trialing" | "active" | "past_due" | "cancelled";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

export async function updateCompanyBillingState(companyId: string, patch: BillingStatePatch): Promise<void> {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.plan !== undefined) body.plan = patch.plan;
  if (patch.subscriptionStatus !== undefined) body.subscription_status = patch.subscriptionStatus;
  if (patch.stripeCustomerId !== undefined) body.stripe_customer_id = patch.stripeCustomerId;
  if (patch.stripeSubscriptionId !== undefined) body.stripe_subscription_id = patch.stripeSubscriptionId;
  if (patch.stripePriceId !== undefined) body.stripe_price_id = patch.stripePriceId;
  if (patch.subscriptionCurrentPeriodEnd !== undefined) {
    body.subscription_current_period_end = patch.subscriptionCurrentPeriodEnd;
  }
  if (patch.cancelAtPeriodEnd !== undefined) body.cancel_at_period_end = patch.cancelAtPeriodEnd;

  await supabaseFetch(`/rest/v1/companies?id=eq.${encodeURIComponent(companyId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}

export async function getCompanyIdByStripeSubscriptionId(subscriptionId: string): Promise<string | null> {
  const res = await supabaseFetch(
    `/rest/v1/companies?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=id&limit=1`,
  );
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function getUsageCounter(companyId: string, periodStart = currentPeriodStart()): Promise<UsageCounter> {
  const res = await supabaseFetch(
    `/rest/v1/usage_counters?company_id=eq.${encodeURIComponent(companyId)}&period_start=eq.${encodeURIComponent(periodStart)}&limit=1`,
  );
  const rows = (await res.json()) as UsageCounter[];
  return rows[0] ?? {
    company_id: companyId,
    period_start: periodStart,
    ai_messages: 0,
    conversations: 0,
    leads: 0,
    quote_suggestions: 0,
  };
}

export async function incrementUsageCounter(
  companyId: string,
  metric: UsageMetric,
  amount = 1,
  periodStart = currentPeriodStart(),
): Promise<void> {
  try {
    await supabaseFetch("/rest/v1/rpc/increment_company_usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_company_id: companyId,
        p_period_start: periodStart,
        p_metric: metric,
        p_amount: amount,
      }),
    });
    return;
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
    // Keep local development usable before the RPC migration is applied.
    const current = await getUsageCounter(companyId, periodStart);
    const next = { ...current, [metric]: current[metric] + amount };
    await supabaseFetch(
      `/rest/v1/usage_counters?on_conflict=company_id,period_start`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(next),
      },
    );
  }
}

export async function getUsageSummary(companyId: string): Promise<UsageSummary> {
  const state = await getCompanySaasState(companyId);
  const counter = await getUsageCounter(companyId);
  const usage: Record<UsageMetric, number> = {
    ai_messages: counter.ai_messages,
    conversations: counter.conversations,
    leads: counter.leads,
    quote_suggestions: counter.quote_suggestions,
  };
  const limits: Record<UsageMetric, number> = {
    ai_messages: getPlanLimit(state.plan, "ai_messages"),
    conversations: getPlanLimit(state.plan, "conversations"),
    leads: getPlanLimit(state.plan, "leads"),
    quote_suggestions: getPlanLimit(state.plan, "quote_suggestions"),
  };
  return {
    ...state,
    periodStart: counter.period_start,
    usage,
    limits,
    trialExpired: state.plan === "trial" && Date.parse(state.trialEndsAt) <= Date.now(),
  };
}

export async function canConsumeUsage(companyId: string, metric: UsageMetric, amount = 1): Promise<{
  allowed: boolean;
  reason?: "trial_expired" | "limit_reached";
  summary: UsageSummary;
}> {
  const summary = await getUsageSummary(companyId);
  if (summary.trialExpired) return { allowed: false, reason: "trial_expired", summary };
  if (summary.usage[metric] + amount > summary.limits[metric]) {
    return { allowed: false, reason: "limit_reached", summary };
  }
  return { allowed: true, summary };
}

export async function storeAuthSession(companyId: string, token: string, expiresAt: string): Promise<void> {
  await supabaseFetch("/rest/v1/auth_sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ company_id: companyId, token_hash: hashToken(token), expires_at: expiresAt }),
  });
}

export async function isAuthSessionActive(companyId: string, token: string): Promise<boolean> {
  const res = await supabaseFetch(
    `/rest/v1/auth_sessions?company_id=eq.${encodeURIComponent(companyId)}&token_hash=eq.${encodeURIComponent(hashToken(token))}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`,
  );
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows.length > 0;
}

export async function revokeAuthSession(companyId: string, token: string): Promise<void> {
  await supabaseFetch(
    `/rest/v1/auth_sessions?company_id=eq.${encodeURIComponent(companyId)}&token_hash=eq.${encodeURIComponent(hashToken(token))}&revoked_at=is.null`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    },
  );
}

export async function getWidgetSettings(companyId: string): Promise<Pick<CompanySaasState, "allowedWidgetOrigins" | "widgetTokenVersion">> {
  const response = await supabaseFetch(
    `/rest/v1/companies?id=eq.${encodeURIComponent(companyId)}&select=allowed_widget_origins,widget_token_version&limit=1`,
  );
  const rows = (await response.json()) as Array<{
    allowed_widget_origins?: string[] | null;
    widget_token_version?: number | null;
  }>;
  const settings = rows[0];
  if (!settings) throw new Error("Widget company not found");
  return {
    allowedWidgetOrigins: settings.allowed_widget_origins ?? [],
    widgetTokenVersion: settings.widget_token_version ?? 1,
  };
}

export async function updateWidgetSettings(companyId: string, allowedWidgetOrigins: string[]): Promise<void> {
  await supabaseFetch(`/rest/v1/companies?id=eq.${encodeURIComponent(companyId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ allowed_widget_origins: allowedWidgetOrigins, updated_at: new Date().toISOString() }),
  });
}

export async function createAuthToken(companyId: string, kind: "password_reset" | "email_verification", ttlMs: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await supabaseFetch("/rest/v1/auth_tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      company_id: companyId,
      token_hash: hashToken(token),
      kind,
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    }),
  });
  return token;
}

export async function consumeAuthToken(token: string, kind: "password_reset" | "email_verification"): Promise<string | null> {
  const tokenHash = hashToken(token);
  try {
    const response = await supabaseFetch("/rest/v1/rpc/consume_auth_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_token_hash: tokenHash, p_kind: kind }),
    });
    return (await response.json()) as string | null;
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
  }

  const res = await supabaseFetch(
    `/rest/v1/auth_tokens?token_hash=eq.${encodeURIComponent(tokenHash)}&kind=eq.${encodeURIComponent(kind)}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`,
  );
  const rows = (await res.json()) as Array<{ id: string; company_id: string }>;
  const row = rows[0];
  if (!row) return null;

  await supabaseFetch(`/rest/v1/auth_tokens?id=eq.${encodeURIComponent(row.id)}&used_at=is.null`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ used_at: new Date().toISOString() }),
  });
  return row.company_id;
}

export async function updateCompanyPassword(companyId: string, passwordHash: string): Promise<void> {
  await supabaseFetch(`/rest/v1/companies?id=eq.${encodeURIComponent(companyId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ password_hash: passwordHash, updated_at: new Date().toISOString() }),
  });
}

export async function markCompanyEmailVerified(companyId: string): Promise<void> {
  await supabaseFetch(`/rest/v1/companies?id=eq.${encodeURIComponent(companyId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ email_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
}
