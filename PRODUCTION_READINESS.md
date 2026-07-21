# Production readiness

## Required database state

Run every SQL file in `supabase/migrations` in numeric order. The production
build runs `npm run check:migrations` automatically. Set
`CHECK_LIVE_DB=true` in a deployment check when production Supabase credentials
are available to verify the live schema too. Migration 006 is required before
deploying the matching application code because production rate limiting and
atomic auth-token consumption fail closed when their RPCs are absent. Migration
  007 stores the customer's established conversation language so later
  contact-only turns cannot switch the reply language. Migration 008 adds
  database-level conversation/booking/InBox deduplication and atomic usage
  reservation. Migration 009 adds replay protection for API requests and an
  owner-operation audit trail. Migration 010 binds quota reservations to
  idempotency keys. Migration 011 stores scoped structured conversation facts,
  booking timeline events, and owner-reviewable learning cases. Applying 011 is
  required before the memory-aware conversation path is enabled in production.
  Migration 012 stores the latest verified flight-arrival enrichment on bookings.

## Required Vercel variables

```env
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SESSION_SECRET
DEEPSEEK_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_STARTER_PRICE_ID
STRIPE_GROWTH_PRICE_ID
APP_URL=https://workflowai-henna.vercel.app
FLIGHT_DATA_API_KEY
FLIGHT_DATA_BASE_URL=https://aeroapi.flightaware.com/aeroapi
```

Use either an auth-email webhook:

```env
AUTH_EMAIL_WEBHOOK_URL
```

or Resend:

```env
RESEND_API_KEY
AUTH_EMAIL_FROM=WorkflowAI <auth@your-domain.example>
```

Without one of those email options, registration still works but email
verification and password-reset messages cannot be delivered.

## Stripe webhook

Endpoint: `https://workflowai-henna.vercel.app/api/billing/webhook`

Subscribe to checkout completion, subscription create/update/delete, invoice
paid, and invoice payment failed. Keep the signing secret in Vercel Production.

## Release gate

```bash
npm test
npm run lint
npm run build
npm run test:e2e
```

After deployment, verify login/register pages, protected page redirects,
unauthorized API responses, signed widget chat/history, an authenticated owner
workflow, Stripe Checkout redirection, and signed webhook acceptance.
