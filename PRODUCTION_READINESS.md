# Production readiness

## Required database state

Run every SQL file in `supabase/migrations` in numeric order. Migration 006 is
required before deploying the matching application code because production rate
limiting and atomic auth-token consumption fail closed when their RPCs are absent.

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
