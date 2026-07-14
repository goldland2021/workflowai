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

The model never owns pricing. Quote suggestions come from the company's stored
pricing rules and are sent to the owner for approval; customer replies do not
expose unapproved prices.

## Reliability and privacy

- All provider keys stay in server-only modules.
- AI outputs are schema-validated before use.
- Provider failures return a controlled response and create an operational failure record.
- Shared production rate limits protect the public AI endpoint.
- Exact tenant-scoped FAQ caching never reuses fuzzy booking messages.
- Logs do not include raw customer messages or contact identifiers.

Run `npm test`, `npm run lint`, `npm run build`, and `npm run test:e2e` before release.
