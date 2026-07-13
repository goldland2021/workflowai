import "server-only";

import Stripe from "stripe";
import { normalizePlan, type PlanId } from "@/lib/saas/plans";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function isStripeCheckoutConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_STARTER_PRICE_ID &&
      process.env.STRIPE_GROWTH_PRICE_ID,
  );
}

export function isStripeBillingConfigured(): boolean {
  return isStripeCheckoutConfigured() && Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
  return new Stripe(secretKey);
}

export function getStripePriceId(plan: Exclude<PlanId, "trial">): string | null {
  if (plan === "starter") return process.env.STRIPE_STARTER_PRICE_ID ?? null;
  return process.env.STRIPE_GROWTH_PRICE_ID ?? null;
}

export function getPlanForStripePrice(priceId: string | null | undefined): Exclude<PlanId, "trial"> | null {
  if (priceId && priceId === process.env.STRIPE_STARTER_PRICE_ID) return "starter";
  if (priceId && priceId === process.env.STRIPE_GROWTH_PRICE_ID) return "growth";
  return null;
}

export function subscriptionStatusFromStripe(status: Stripe.Subscription.Status): "trialing" | "active" | "past_due" | "cancelled" {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due";
  return "cancelled";
}

export function getBillingBaseUrl(request?: Request): string {
  const configuredUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");
  if (request) return new URL(request.url).origin;
  return "http://localhost:3000";
}

export function planFromMetadata(value: string | null | undefined): Exclude<PlanId, "trial"> | null {
  const normalized = normalizePlan(value);
  return normalized === "trial" ? null : normalized;
}
