# AI Employee V1 Scope

Version: 1.0

Status: Development Scope

Project Focus: Airport Transfer AI Employee

Real Chat Adjustment: `REAL_CHAT_DEVELOPMENT_ADJUSTMENT.md`

---

# 1. V1 Positioning

AI Employee V1 is not a general chatbot.

It is an AI front office for an airport transfer business.

The first version should help the business owner:

1. Reply to website visitors immediately.
2. Capture customer contact information before the visitor leaves.
3. Collect the information required for an airport transfer quotation.
4. Detect important business events.
5. Suggest a quote for owner approval.
6. Generate customer-ready booking confirmations.
7. Track driver, payment, receipt, and change-request needs for owner review.

V1 should feel like a focused product, not a technology demo.

---

# 2. Product Principle

Build V1 as a small but real product.

Design the foundation so future versions can expand into more industries, channels, and workflows without rewriting the core system.

Do not expose future complexity to the user in V1.

---

# 3. Primary V1 Workflow

V1 must complete this core loop:

```text
Business owner trains AI
↓
Website visitor opens chat widget
↓
AI answers questions and collects trip details
↓
AI captures contact information at the right moment
↓
AI detects key business events
↓
AI suggests a quote
↓
Owner approves, edits, or rejects in Boss Inbox
↓
AI generates booking confirmation
↓
Owner tracks driver details, payment, receipt, or change requests
```

This workflow is the heart of V1.

Features outside this loop should be avoided unless they directly support the loop.

---

# 4. V1 Included

## 4.1 Authentication

Included:

- Register
- Login
- Basic company creation

Not required in V1:

- Team roles
- Advanced permissions
- Enterprise SSO

---

## 4.2 Train Employee

Included:

- AI-guided onboarding interview for the business owner.
- Initial focus on airport transfer businesses.
- Collect core business information:
  - Business name
  - Service area
  - Airport transfer services
  - Business hours
  - Supported languages
  - Payment methods
  - Waiting policy
  - Cancellation policy
  - Overtime policy
  - Basic pricing method
  - Vehicle types
  - Included fees
  - Driver assignment process
  - Receipt policy
  - When the AI must ask the owner before replying
- Generate structured business configuration.

Train Employee must output structured data, not only free text.

Expected structured outputs:

- Company profile
- Services
- Business hours
- Pricing rules
- Escalation rules
- Contact capture rules
- Required booking fields
- Required confirmation fields
- FAQ
- AI behavior boundaries

Not required in V1:

- Multi-industry onboarding templates
- Fully automatic website crawling
- Complex document ingestion
- Advanced rule builder UI

---

## 4.3 Company Knowledge

Included:

- Basic manual knowledge entry.
- FAQ management.
- Knowledge generated from Train Employee.
- Searchable knowledge for AI responses.

Not required in V1:

- Google Drive integration
- Notion integration
- Dropbox integration
- Advanced version control UI
- Complex re-index management UI

---

## 4.4 Website Widget

Included:

- Embeddable website chat widget.
- Floating chat button.
- Live AI conversation.
- Conversation history per visitor/session.
- Basic theme color.
- Typing indicator.

Not required in V1:

- Full white-label widget builder
- Complex widget customization
- Multi-widget campaigns
- A/B testing

---

## 4.5 AI Conversation Engine

Included:

- Immediate greeting.
- Answer customer questions from company knowledge.
- Collect required airport transfer details:
  - Service type
  - Pickup location
  - Drop-off location
  - Airport and terminal when relevant
  - Date
  - Time
  - Flight number when relevant
  - Flight arrival or departure time when relevant
  - Passenger count
  - Luggage count when relevant
  - Vehicle preference when relevant
  - Special requests when relevant
- Ask follow-up questions one step at a time.
- Keep conversation moving even when information is missing.
- Generate conversation summary.

Important rule:

The AI should guide the customer toward a quotation or booking, not only answer questions.

Not required in V1:

- General multi-agent reasoning
- Complex long-term customer memory
- Voice conversation
- Phone AI

---

## 4.6 Contact Capture

Included:

- Capture customer contact information when there is purchase intent.
- Supported contact methods:
  - WhatsApp
  - Telegram
  - Email
- Store preferred contact method.
- Store contact value.

Purchase intent examples:

- Customer asks for price.
- Customer provides travel date.
- Customer asks availability.
- Customer asks to book.
- Customer discusses route or vehicle.

Important rule:

The AI should not ask for contact information immediately at the beginning unless the customer clearly wants to book.

Not required in V1:

- Phone number verification
- CRM enrichment
- Marketing automation

---

## 4.7 Event Detection

Included event types:

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

For each event, the system should store:

- Event type
- Customer
- Conversation
- Summary
- Suggested owner action
- Severity
- Status

Important rule:

The AI can detect and summarize business events, but it must not make commercial decisions without owner approval.

Not required in V1:

- Custom event builder
- Large event taxonomy
- Automated compensation decisions

---

## 4.8 Quote Suggestion

Included:

- Generate a suggested quote based on available trip details and pricing rules.
- Include service type.
- Include suggested vehicle.
- Include included fees when known.
- Include estimated distance and drive time when known.
- Include reasoning.
- Include confidence level.
- Send quote suggestion to Boss Inbox for owner approval.

Important rule:

V1 provides quote suggestions, not automatic final pricing decisions.

Not required in V1:

- Fully automated pricing engine
- Map distance API dependency as a hard requirement
- Dynamic pricing
- Historical order optimization

---

## 4.9 Boss Inbox

Included:

- Pending decision queue.
- Show customer summary.
- Show detected event or quote request.
- Show AI recommendation.
- Show reason and confidence.
- Owner actions:
  - Approve
  - Edit
  - Reject
- Decision history.

Boss Inbox is more important than the general dashboard in V1.

The owner should understand and act on a decision within 10 seconds.

Not required in V1:

- Complex CRM pipelines
- Team assignment
- SLA management
- Advanced notification rules

---

## 4.10 Booking Summary

Included:

- Generate booking-ready summary after owner approval.
- Generate customer-ready booking confirmation text.
- Include:
  - Customer name if available
  - Contact method
  - Service type
  - Pickup location
  - Drop-off location
  - Airport and terminal if relevant
  - Date and time
  - Flight number if available
  - Flight arrival or departure time if available
  - Passenger count
  - Luggage count if available
  - Vehicle preference if available
  - Approved price if available
  - Included fees if available
  - Payment method if available
  - Receipt request if applicable
  - Special notes
- Optional driver details block:
  - Driver name
  - Driver phone
  - Vehicle
  - Vehicle color
  - License plate

Not required in V1:

- Driver dispatch
- Invoice generation
- Receipt generation
- Payment collection
- Full order lifecycle automation

---

## 4.11 Basic Dashboard

Included:

- Today's leads
- Today's conversations
- Pending decisions
- Recent bookings

Not required in V1:

- Advanced analytics
- Revenue forecasting
- Funnel reports
- AI performance scoring dashboard

---

## 4.12 Conversation Test Lab

Included:

- Allow the owner to test the trained AI before installing the widget.
- Simulate customer conversations.
- Show what information the AI collected.
- Show detected events.
- Show whether the AI would ask for owner approval.

Purpose:

Help the owner trust the AI before using it with real customers.

Not required in V1:

- Automated test suite generation
- Multi-scenario simulation library
- Benchmark reports

---

# 5. V1 Explicitly Not Included

V1 should not include:

- Native iOS app
- Native Android app
- Phone AI
- Marketplace
- Multi-agent collaboration
- Advanced workflow builder
- Airport-transfer trip-payment collection
- Social media management
- Facebook Messenger
- Instagram integration
- Slack integration
- Full CRM system
- Multi-industry template marketplace
- Enterprise admin console
- Advanced analytics
- Full automation of refunds, discounts, or cancellations

These may be considered in later versions, but they should not appear as product promises in V1.

---

# 6. Architecture Expansion Rules

Although V1 is narrow, the implementation should keep future expansion possible.

## 6.1 Channels

V1 channel:

- Website Widget

Future channels:

- WhatsApp
- Telegram
- Email
- Facebook Messenger
- Instagram
- Phone AI

Architecture rule:

Conversation messages should not be hardcoded to the website widget only.

Use a channel-aware message model.

---

## 6.2 Industries

V1 industry:

- Airport Transfer

Future industries:

- Cleaning company
- Plumber
- Electrician
- Photographer
- Lawyer
- Medical clinic
- Moving company

Architecture rule:

Business configuration should support industry-specific fields without forcing every industry to share the same fixed schema.

---

## 6.3 AI Modules

V1 AI modules:

- Conversation AI
- Contact Capture AI
- Event Detection AI
- Quote Suggestion AI
- Booking Summary AI

Architecture rule:

Prompts should be managed as separate modules.

Do not scatter core AI behavior rules across unrelated application code.

---

## 6.4 Business Rules

Business rules should be stored as structured data.

Do not make the LLM the only source of truth for:

- Required booking fields
- Pricing rules
- Escalation rules
- Contact capture rules
- AI behavior boundaries

The LLM can reason with these rules, but the application should own the workflow state.

---

## 6.5 Decision Ownership

The system should distinguish between:

- AI suggestions
- Owner decisions
- Customer messages
- System-generated summaries

Architecture rule:

Commercial decisions must be traceable to the owner.

---

# 7. AI Behavior Boundaries

AI can:

- Reply immediately.
- Ask clarifying questions.
- Collect trip details.
- Capture contact information.
- Answer FAQ.
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
- Pretend the owner has approved something when they have not.

---

# 8. Success Metrics

V1 should be evaluated by practical business outcomes.

Primary metrics:

- First AI response time under 5 seconds.
- Contact capture rate above 70%.
- Owner approval action completed within 30 seconds.
- Customer trip details collected before quote suggestion.
- No commercial decision made without owner approval.

Secondary metrics:

- Number of conversations handled by AI.
- Number of leads created.
- Number of quote suggestions created.
- Number of booking summaries generated.
- Number of owner escalations.

---

# 9. Product Language

Use product language that reinforces the AI employee concept.

Prefer:

- Train your AI employee
- Company Knowledge
- Boss Inbox
- Booking Summary
- Quote Suggestion
- Customer Timeline

Avoid:

- Upload database
- Generic chatbot
- CRM pipeline
- Workflow automation builder
- Workspace setup

The product should feel simple, fast, and business-focused.

---

# 10. Development Priority

Recommended implementation order:

1. Project foundation
2. Authentication and company creation
3. Real transfer domain model
4. Train Employee
5. Structured business configuration
6. Quote intake and missing-field extraction
7. Conversation Engine
8. Website Widget
9. Contact Capture
10. Event Detection
11. Quote Suggestion
12. Boss Inbox decision types
13. Booking confirmation generator
14. Driver details block
15. Receipt request tracking
16. Conversation Test Lab
17. Basic Dashboard

If tradeoffs are required, prioritize:

1. Train Employee
2. Quote intake accuracy
3. Booking confirmation quality
4. Contact capture
5. Boss Inbox

Dashboard polish should not come before the core loop works.

---

# 11. V1 Acceptance Criteria

V1 is considered complete when:

1. A business owner can create an account and company.
2. The owner can train the AI for an airport transfer business.
3. The system stores structured business rules from the training process.
4. A website visitor can chat with the AI through the widget.
5. The AI can collect airport transfer trip details.
6. The AI captures contact information after purchase intent appears.
7. The AI detects supported business events.
8. The AI creates quote suggestions for owner approval.
9. The owner can approve, edit, or reject in Boss Inbox.
10. The system generates a customer-ready booking confirmation.
11. The owner can test the AI in Conversation Test Lab.
12. The AI does not make final commercial decisions without owner approval.
13. The system can track receipt, pickup-time change, and driver-detail needs without becoming a full dispatch system.

---

# 12. Future Expansion Candidates

Future versions may add:

- WhatsApp Business Platform
- Telegram bot
- Email conversation channel
- Google Calendar
- Airport-transfer trip-payment collection
- Map-based distance pricing
- Driver dispatch
- Invoice and receipt generation
- Multi-industry templates
- Advanced analytics
- Native mobile app
- Phone AI
- Workflow builder

These should be treated as future expansion candidates, not V1 commitments.

---

# 13. Final V1 Rule

When deciding whether to add something to V1, ask:

```text
Does this help the owner train the AI, capture a lead, make a decision, or create a booking summary?
```

If the answer is no, it should probably wait.
