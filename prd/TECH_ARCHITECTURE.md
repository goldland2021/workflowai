# AI Employee Technical Architecture

Version: 2.0

Status: Production baseline

## 1. Runtime architecture

```text
Owner workspace / signed public widget
  -> Next.js App Router and Route Handlers
  -> authentication, widget authorization, shared rate limits, usage gate
  -> domain workflow engine
  -> structured AI modules + deterministic business rules
  -> Supabase Postgres
  -> Stripe webhooks for subscription state
```

The browser never receives provider or service-role secrets. AI, database, and
billing calls run in server-only modules or Route Handlers.

## 2. Domain ownership

Domain modules under `src/lib/domain` own trip state, missing-field rules,
events, quote suggestions, Boss Inbox records, and booking confirmation rules.
UI components display and collect data but do not decide commercial outcomes.

The LLM is used for structured trip/contact/event extraction and natural reply
generation. Pricing comes only from configured pricing rules. Owner approval is
required before a suggestion becomes a commercial decision.

## 3. Data and tenant isolation

Supabase stores companies, conversations, messages, bookings, Boss Inbox items,
business configuration, usage counters, sessions, auth tokens, and AI failures.

Isolation is enforced twice:

1. Application queries include the authenticated or widget-authorized company ID.
2. Migration `006_security_hardening.sql` enables RLS and revokes direct
   `anon`/`authenticated` access to private tables.

Only the server-side service role may access those records. Password-reset and
email-verification tokens are consumed atomically.

## 4. Public widget boundary

The embed endpoint issues an HMAC-signed, versioned widget token. Both message
submission and history loading verify the token and configured origin. Widget
credentials are sent in headers for history requests instead of URL query logs.

## 5. Availability and abuse protection

Production request limits use an atomic Supabase RPC shared by all Vercel
instances. Authentication endpoints have tighter IP and account/token limits.
Local development falls back to an in-memory limiter when Supabase is absent.

Security boundaries fail closed in production: an unavailable revocation check,
usage gate, shared limiter, or initial message write does not silently proceed.

## 6. AI execution

Trip extraction, contact extraction, and event detection run concurrently. Once
structured state is available, deterministic pricing rules produce any quote
suggestion and the reply model writes the customer-facing response. Removing an
LLM pricing round trip reduces latency and prevents model-invented prices.

Provider failures return a controlled 503 response and are recorded without raw
customer content. When no provider is configured, deterministic development
fallbacks keep the core workflow testable.

## 7. Billing

Stripe Checkout creates recurring subscriptions. Signed webhooks are the source
of truth for plan state, and the Billing Portal handles existing subscriptions.
This is WorkflowAI SaaS billing, not airport-transfer trip-payment collection.

## 8. Verification and delivery

Vitest covers domain and security behavior. Playwright covers signed-out routing,
public pages, private API protection, billing protection, and widget-history
authorization. GitHub Actions runs unit tests, lint, build, and browser tests on
pull requests and `main`.

Vercel deploys the production application after the required Supabase migration
and environment variables are in place.
