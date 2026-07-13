import type Stripe from "stripe";
import { getPlanForStripePrice, getStripe, isStripeConfigured, planFromMetadata, subscriptionStatusFromStripe } from "@/lib/billing/stripe";
import { getCompanyIdByStripeSubscriptionId, updateCompanyBillingState } from "@/lib/supabase/saas";
import { isConfigured } from "@/lib/supabase/client";

export const runtime = "nodejs";

function unixSecondsToIso(value: number | null | undefined): string | null {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return typeof subscription === "string" ? subscription : subscription?.id ?? null;
}

async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const companyId = subscription.metadata.companyId || await getCompanyIdByStripeSubscriptionId(subscription.id);
  if (!companyId) {
    console.warn("Stripe subscription has no matching WorkflowAI company", subscription.id);
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanForStripePrice(priceId) ?? planFromMetadata(subscription.metadata.plan);
  if (!plan) {
    console.warn("Stripe subscription has no recognized WorkflowAI plan", subscription.id);
    return;
  }

  const isDeleted = subscription.status === "canceled";

  await updateCompanyBillingState(companyId, {
    plan: isDeleted ? "trial" : plan,
    subscriptionStatus: subscriptionStatusFromStripe(subscription.status),
    stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    stripeSubscriptionId: isDeleted ? null : subscription.id,
    stripePriceId: isDeleted ? null : priceId ?? null,
    subscriptionCurrentPeriodEnd: isDeleted ? null : unixSecondsToIso(subscription.items.data[0]?.current_period_end),
    cancelAtPeriodEnd: isDeleted ? false : subscription.cancel_at_period_end,
  });
}

export async function POST(request: Request) {
  if (!isConfigured() || !isStripeConfigured()) return Response.json({ error: "Billing is not configured." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) return Response.json({ error: "Missing Stripe webhook signature." }, { status: 400 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.warn("Invalid Stripe webhook signature", error);
    return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.companyId ?? session.client_reference_id;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const plan = planFromMetadata(session.metadata?.plan);
        if (companyId && subscriptionId && customerId && plan) {
          await updateCompanyBillingState(companyId, {
            plan,
            subscriptionStatus: "active",
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (subscriptionId) {
          const companyId = await getCompanyIdByStripeSubscriptionId(subscriptionId);
          if (companyId) await updateCompanyBillingState(companyId, { subscriptionStatus: "past_due" });
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (subscriptionId) {
          const companyId = await getCompanyIdByStripeSubscriptionId(subscriptionId);
          if (companyId) await updateCompanyBillingState(companyId, { subscriptionStatus: "active" });
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("Failed to process Stripe webhook", event.type, error);
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return Response.json({ received: true });
}
