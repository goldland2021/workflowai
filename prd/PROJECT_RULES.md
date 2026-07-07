# AI Employee Project Rules

Version: 1.0

Status: Required Development Rules

Project: AI Employee V1

Primary Scope File: `V1_SCOPE.md`

Real Chat Adjustment File: `REAL_CHAT_DEVELOPMENT_ADJUSTMENT.md`

---

# 1. Scope Rules

V1 is an airport transfer AI Employee.

Do not build a generic chatbot.

Do not build a full CRM.

Do not build features outside `V1_SCOPE.md` unless the product owner explicitly updates the scope.

When there is a conflict between documents, follow this priority:

1. `V1_SCOPE.md`
2. `REAL_CHAT_DEVELOPMENT_ADJUSTMENT.md`
3. Current PRD or APS for the module being built
4. `PROJECT_RULES.md`
5. Original high-level product requirement documents

Future expansion should be supported in architecture, but not exposed as V1 product promises.

---

# 2. Product Principles

Every feature must help at least one of these outcomes:

1. Train the AI employee.
2. Capture a lead.
3. Collect information required for an airport transfer quote.
4. Detect a business event.
5. Help the owner make a decision.
6. Generate a booking-ready summary.
7. Generate a customer-ready booking confirmation.
8. Track driver, payment, receipt, or change-request needs.

If a feature does not support one of these outcomes, it probably does not belong in V1.

The product should feel:

- Fast
- Minimal
- Practical
- Owner-focused
- Business-oriented

Avoid building a complex SaaS dashboard when a simple decision workflow would solve the problem.

---

# 3. V1 Commitment Rules

V1 may include:

- Authentication
- Company creation
- Train Employee
- Company Knowledge
- Website Widget
- AI Conversation Engine
- Contact Capture
- Event Detection
- Quote Suggestion
- Boss Inbox
- Booking Summary
- Basic Dashboard
- Conversation Test Lab

V1 must not include:

- Native iOS app
- Native Android app
- Phone AI
- Marketplace
- Multi-agent collaboration
- Advanced workflow builder
- Full CRM system
- Full social media management
- Stripe payments
- Automated refunds
- Automated discounts
- Automated cancellation approval
- Enterprise admin console

Do not add hidden future features into the UI.

Do not show disabled navigation items for future products unless the product owner asks for them.

---

# 4. AI Behavior Rules

AI can:

- Reply immediately.
- Ask follow-up questions.
- Collect airport transfer details.
- Capture contact information.
- Answer questions using company knowledge.
- Detect business events.
- Suggest quotes.
- Summarize conversations.
- Prepare booking summaries.

AI cannot:

- Approve discounts.
- Approve refunds.
- Promise compensation.
- Confirm cancellations without owner approval.
- Make final price changes without owner approval.
- Modify business rules by itself.
- Pretend the owner approved something.

Commercial decisions must always be traceable to the owner.

---

# 5. AI Implementation Rules

Do not rely on a single giant prompt.

Keep AI behavior separated into modules:

- Conversation AI
- Contact Capture AI
- Event Detection AI
- Quote Suggestion AI
- Booking Summary AI

Prompts should be stored in clear, dedicated files or modules.

Do not scatter critical prompt instructions across random UI components, API handlers, or database helpers.

The application should own workflow state.

The LLM may reason with business rules, but it should not be the only source of truth for:

- Required booking fields
- Pricing rules
- Escalation rules
- Contact capture rules
- AI behavior boundaries

Prefer structured AI outputs when the result will be stored or used by another part of the system.

Validate AI outputs before saving important data.

---

# 6. Business Rules

Business rules must be stored as structured data whenever possible.

Do not store important business logic only as plain natural language.

Important structured data includes:

- Company profile
- Services
- Service area
- Business hours
- Supported languages
- Payment methods
- Pricing rules
- Waiting policy
- Cancellation policy
- Overtime policy
- Required booking fields
- Escalation rules
- Contact capture rules
- FAQ
- AI behavior boundaries

Train Employee must generate structured configuration, not only a summary.

---

# 7. Conversation Rules

The AI should guide customers toward a quote or booking.

Do not let the conversation become passive FAQ-only chat.

The AI should ask one main follow-up question at a time.

The AI should not ask for contact information immediately unless the customer clearly wants to book.

The AI should ask for contact information after purchase intent appears.

Purchase intent includes:

- Asking for price
- Asking for availability
- Providing trip date
- Providing route details
- Asking to book
- Asking about vehicle options

The AI should never stop the conversation unexpectedly.

---

# 8. Event Rules

V1 supported event types:

- Discount Request
- Urgent Booking
- Route Change
- Flight Delay
- Complaint
- Cancellation Request
- Receipt Request
- Pickup Time Change
- Early Pickup Request
- Same Driver Request
- English-speaking Driver Request
- Multi-leg Itinerary Request
- Round Trip Discount
- Payment Coordination
- Driver Coordination Issue

Each detected event should include:

- Event type
- Customer
- Conversation
- Summary
- Suggested owner action
- Severity
- Status

Events should create owner-visible work only when the owner needs to make or review a decision.

---

# 9. Quote Rules

V1 is Quote Suggestion, not Quote Automation.

AI may suggest:

- Service type
- Suggested price
- Suggested vehicle
- Included fees
- Estimated distance when known
- Estimated drive time when known
- Reasoning
- Confidence
- Missing information

AI must not present a final confirmed price if owner approval is required.

If trip details are incomplete, the system should collect missing information before producing a quote suggestion when practical.

---

# 10. Boss Inbox Rules

Boss Inbox is the most important owner workflow in V1.

The owner should be able to understand a pending decision within 10 seconds.

Each Boss Inbox item should clearly show:

- Customer
- What happened
- Decision type
- What the AI recommends
- Why the AI recommends it
- What action the owner can take

Supported owner actions:

- Approve
- Edit
- Reject

Do not turn Boss Inbox into a complex CRM pipeline.

---

# 11. Data Model Rules

Design data models for V1, but leave room for future expansion.

Use clear ownership and traceability fields.

Most business records should be associated with:

- Company
- Customer when available
- Conversation when relevant
- Channel when relevant
- Created time
- Updated time

Conversation messages should support multiple future channels.

Do not hardcode the data model to website widget only.

Recommended channel values:

- `website_widget`
- `whatsapp`
- `telegram`
- `email`
- `phone`

Only `website_widget` is required in V1.

Commercial decisions should be stored separately from AI suggestions.

Do not overwrite AI suggestions when the owner edits or approves a decision.

---

# 12. UI and UX Rules

Use product language that matches the AI employee concept.

Prefer:

- Train your AI employee
- Company Knowledge
- Boss Inbox
- Quote Suggestion
- Booking Summary
- Customer Timeline

Avoid:

- Generic chatbot
- CRM pipeline
- Upload database
- Workflow automation builder
- Workspace setup

The interface should be simple and calm.

Do not create a marketing landing page as the main app experience.

Do not add complex navigation before the core workflow works.

Dashboard polish should not come before:

1. Train Employee
2. Conversation quality
3. Contact capture
4. Boss Inbox
5. Booking summary

---

# 13. Engineering Rules

Prefer TypeScript for application code.

Prefer clear domain modules over large mixed utility files.

Keep business logic out of UI components when it can live in domain services or server-side modules.

Use reusable components where they reduce real duplication.

Do not introduce abstractions before there is a real need.

Do not duplicate core logic across frontend and backend.

Do not hardcode airport transfer logic in places that should support future industries.

Airport transfer can be the V1 configuration, but the system structure should support future industry configurations.

Document any major technical decision before implementation if `TECH_ARCHITECTURE.md` does not exist yet.

---

# 14. Security and Privacy Rules

Customer contact details are sensitive.

Protect:

- Names
- Phone numbers
- WhatsApp numbers
- Telegram handles
- Email addresses
- Pickup and drop-off locations
- Flight information
- Conversation history

Do not expose one company's customers, conversations, rules, or bookings to another company.

Every company-owned record must enforce company-level access control.

Do not log secrets or private customer data unnecessarily.

API keys and provider tokens must be stored in environment variables, not source code.

---

# 15. Testing Rules

At minimum, test critical business behavior:

- AI does not make final commercial decisions.
- Contact capture happens after purchase intent.
- Required trip fields are tracked.
- Quote suggestions require enough context or clearly list missing fields.
- Boss Inbox stores owner decisions separately from AI suggestions.
- Booking summary includes approved owner decisions.

Conversation behavior should be tested with realistic airport transfer scenarios.

Important scenarios:

- Customer asks for a price.
- Customer provides incomplete route details.
- Customer asks for discount.
- Customer says flight is delayed.
- Customer changes route.
- Customer asks to cancel.
- Customer complains.
- Customer asks to book urgently.

---

# 16. Documentation Rules

When adding a major module, create or update the matching PRD or APS.

Each module specification should include:

- Business goal
- User story
- Flow
- UI requirements
- Data requirements
- API requirements
- AI behavior
- Edge cases
- Acceptance criteria
- Future expansion notes

Do not leave important AI behavior only inside code.

Do not leave important product decisions only inside chat history.

---

# 17. Naming Rules

Use consistent domain names:

- Company
- Customer
- Lead
- Conversation
- Message
- Event
- Quote Suggestion
- Boss Inbox Item
- Booking Summary
- Business Rules
- Company Knowledge

Avoid ambiguous names like:

- Data
- Info
- Record
- Bot thing
- Task item
- AI result

Names should explain the business object, not the implementation detail.

---

# 18. Real Chat Rules

Real customer chats should shape the product.

Use real chats to improve:

- Quote fields
- Missing-field questions
- Event detection
- Boss Inbox decision types
- Booking confirmation format
- Driver detail format
- Receipt request handling
- Conversation Test Lab scenarios

Do not copy private real customer data into seed data, demos, screenshots, or UI examples.

Anonymize:

- Customer names
- Emails
- Phone numbers
- WhatsApp numbers
- Driver names
- Driver phone numbers
- License plates
- Group links

Keep business-useful structure:

- Route
- Time
- Flight
- Passenger count
- Luggage count
- Vehicle type
- Price
- Payment method
- Special request type

---

# 19. Final Rule

Before adding any feature, ask:

```text
Does this help the owner train the AI, capture a lead, make a decision, or create a booking summary?
```

If the answer is no, do not add it to V1.
