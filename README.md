# WorkflowAI

WorkflowAI is an AI front office for airport-transfer businesses. It trains on
structured company rules, serves a public website widget, collects trip and
contact details, escalates commercial decisions to the owner, and prepares
booking confirmations.

Production: https://workflowai-henna.vercel.app

## Product flow

1. The owner registers and trains the AI employee.
2. A visitor chats through the signed website widget.
3. The AI collects booking fields and detects operational events.
4. Pricing rules create a quote suggestion for the Boss Inbox.
5. The owner approves, edits, or rejects the decision.
6. The app creates the customer-facing booking confirmation and tracks follow-up work.

The LLM assists with extraction, event detection, and natural replies. Structured
business rules remain the source of truth for pricing, escalation, and workflow state.

WorkflowAI also stores structured conversation memory, booking timeline events,
and owner-reviewable learning cases. Customer facts are scoped to one company
and conversation; learning cases are candidates only and never modify pricing or
business rules automatically.

When `FLIGHT_DATA_API_KEY` is configured, the server can look up an arrival
flight by flight number, date, and airport, then map the verified terminal to an
airport arrival-lobby instruction. The customer-facing reply never invents a
terminal when the provider cannot verify one.

## Stack

- Next.js App Router, React, TypeScript, and Tailwind CSS
- Supabase Postgres for tenant-owned records and revocable sessions
- DeepSeek by default, with OpenAI-compatible cloud/local providers supported
- Stripe Checkout, Billing Portal, and signed webhooks for SaaS subscriptions
- Vitest unit tests, Playwright browser tests, and GitHub Actions CI

## Local setup

```bash
npm install
copy .env.example .env.local
npm run dev
```

Run every SQL file in `supabase/migrations` in numeric order through
`012_flight_arrival_details.sql` before testing authenticated or
persistent workflows. `npm run build` checks the migration files automatically;
run `CHECK_LIVE_DB=true npm run check:migrations` with production Supabase
credentials to verify the live schema too. Then open http://localhost:3000.

At minimum, configure:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SESSION_SECRET=...
DEEPSEEK_API_KEY=...
```

Optional production integrations are documented in `.env.example`,
`AI_INTEGRATION.md`, and `BILLING_SETUP.md`.

## Verification

```bash
npm test
npm run lint
npm run build
npm run test:e2e
```

Pull requests and pushes to `main` run the same checks in GitHub Actions.

## Security model

- Every application query is scoped to a company ID.
- Public widgets require a signed, versioned token and an allowed origin.
- Database RLS blocks direct `anon` and `authenticated` access to private tables.
- Production rate limits are atomic and shared through Supabase.
- Session revocation, usage checks, and customer-message persistence fail closed in production.
- Customer messages and contact identifiers are not written to application logs.

See `PRODUCTION_READINESS.md` for the release checklist and remaining external
service setup.
