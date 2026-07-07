# AI Employee Technical Architecture

Version: 1.0

Status: V1 Development Baseline

---

# 1. Stack

V1 uses:

- Next.js
- TypeScript
- Tailwind CSS
- React Server Components where practical
- Local in-memory/domain data for the first prototype

This keeps the first version fast to build while preserving a clean path to a real database and provider integrations later.

---

# 2. V1 Architecture

```text
Next.js App
↓
Domain Modules
↓
Structured Business Configuration
↓
AI Logic Modules
↓
Owner Workflows
```

The first implementation should prove the core product loop before adding production infrastructure.

---

# 3. Domain Modules

Core domain modules should live outside UI components.

Required V1 domains:

- Company
- Business Rules
- Company Knowledge
- Conversation
- Contact Capture
- Event Detection
- Quote Suggestion
- Boss Inbox
- Booking Confirmation
- Driver Details
- Receipt Request
- Customer Timeline

UI components may display and collect data, but they should not own core business rules.

---

# 4. AI Module Shape

AI behavior should be separated by responsibility:

- Conversation AI
- Contact Capture AI
- Event Detection AI
- Quote Suggestion AI
- Booking Confirmation AI
- Operations Event AI

For the first prototype, these modules may use deterministic rule-based logic to simulate the intended AI behavior.

When OpenAI API integration is added, it should replace or enhance these modules without rewriting the UI workflow.

---

# 5. Data Strategy

V1 prototype:

- Uses typed seed data and local domain functions.
- Keeps data structures close to future database tables.

Future production:

- Postgres
- Row-level company isolation
- pgvector or equivalent vector search for knowledge retrieval
- Object storage for documents

Important rule:

Do not design UI around temporary mock data shapes. Mock data should follow the intended domain model.

---

# 6. Channel Strategy

V1 required channel:

- Website Widget

Future channels:

- WhatsApp
- Telegram
- Email
- Phone AI

Conversation records should include a channel field from the beginning.

---

# 7. Security Direction

V1 prototype may use local placeholder data.

Production must enforce:

- Company-level access control
- Secure customer contact storage
- Environment variables for secrets
- No cross-company data leakage

---

# 8. First Development Slice

The first implementation slice should include:

1. App shell
2. Dashboard overview
3. Train Employee page
4. Company Knowledge preview
5. Conversation Test Lab
6. Boss Inbox
7. Booking Confirmation preview
8. Driver Details preview
9. Receipt and change-request tracking

This gives the product owner a visible end-to-end V1 loop before production integrations are added.
