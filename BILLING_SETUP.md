# Stripe Billing Setup

V4.1 uses Stripe Checkout for recurring subscriptions and Stripe Billing Portal
for existing customers. The application only trusts Stripe webhooks to update a
company's plan.

## 1. Supabase migrations

Run these files in order in the Supabase SQL editor:

1. `003_saas_foundation.sql`
2. `004_operations.sql`
3. `005_billing.sql`

## 2. Stripe test mode

Create two recurring monthly Prices in Stripe test mode:

- Starter: USD 49/month
- Growth: USD 149/month

Copy their `price_...` IDs into `.env.local`:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_GROWTH_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=http://localhost:3001
```

## 3. Webhook endpoint

Create a Stripe webhook endpoint pointing to:

```text
https://YOUR_DOMAIN/api/billing/webhook
```

Subscribe it to these events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

For local development, Stripe CLI can forward events to:

```text
stripe listen --forward-to localhost:3001/api/billing/webhook
```

Use the CLI's `whsec_...` value as `STRIPE_WEBHOOK_SECRET` locally.

## 4. Vercel

Set the same billing variables in the Vercel project. Use the production
Webhook signing secret for the production domain, not the local Stripe CLI
secret.

The owner opens `/billing`, chooses a paid plan, and is redirected to Stripe
Checkout. The plan changes only after the signed Webhook is accepted.
