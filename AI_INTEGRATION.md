# Real AI Integration

WorkflowAI uses server-side OpenAI-compatible providers with structured Zod
outputs. DeepSeek is the current production provider.

## Configuration

```env
DEEPSEEK_API_KEY=sk-...
# Optional override
LLM_MODEL=deepseek-chat
```

OpenAI is also supported:

```env
OPENAI_API_KEY=sk-...
```

For a local OpenAI-compatible service:

```env
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=qwen2.5:14b
LLM_API_KEY=ollama
```

## Request path

`analyzeCustomerTurn` in `src/lib/domain/ai-workflow.ts` runs three structured
tasks concurrently:

- trip-detail extraction;
- contact extraction;
- event detection.

The application then applies deterministic missing-field, pricing, escalation,
and owner-approval rules. The reply model receives that validated state and
writes a natural response in the visitor's language.

The first meaningful customer-language signal is stored on the conversation
and reused for every later reply. Contact-only turns such as an email address,
URL, username, or phone number do not change the established language. The host
page locale is used only as an initial fallback before the customer writes a
meaningful message.

The model never owns pricing. Quote suggestions come from the company's stored
pricing rules and are sent to the owner for approval; customer replies do not
expose unapproved prices.

Common Chinese policy questions (waiting time, payment method, child seats, and
included fees) use a deterministic fast path backed by structured configuration,
avoiding unnecessary provider latency without bypassing commercial workflows.

## Reliability and privacy

- All provider keys stay in server-only modules.
- AI outputs are schema-validated before use.
- Provider failures return a controlled response and create an operational failure record.
- Shared production rate limits protect the public AI endpoint.
- Exact tenant-scoped FAQ caching never reuses fuzzy booking messages.
- Conversation-level language locking prevents contact details from causing language drift.
- Logs do not include raw customer messages or contact identifiers.

Run `npm test`, `npm run lint`, `npm run build`, and `npm run test:e2e` before release.
