# Real Chat Development Adjustment

Version: 1.0

Source: `客服报价过程.txt`

Status: Development Priority Update

---

# 1. Why This Matters

The real customer chats show that the product is not only an AI chat widget.

The real value is an AI-assisted transfer operations workflow:

```text
Inquiry
↓
Quote information collection
↓
Quote suggestion
↓
Owner decision
↓
Customer confirmation
↓
Booking confirmation
↓
Driver assignment
↓
Pre-trip coordination
↓
Payment or receipt follow-up
```

V1 should still stay small, but it should be shaped around this real workflow.

---

# 2. Updated V1 Product Focus

Previous focus:

```text
Train AI → Widget chat → Contact capture → Quote suggestion → Boss Inbox → Booking summary
```

Updated focus:

```text
Train AI → Collect transfer details → Suggest quote → Owner approves → Generate confirmation → Track driver/payment/receipt needs
```

The first version should feel like a transfer business assistant, not a generic chatbot demo.

---

# 3. Service Types Observed

Real chats include these transfer service types:

- Airport pickup
- Airport drop-off
- City-to-city transfer
- Hotel-to-attraction transfer
- Round trip transfer
- Private day tour
- Hourly charter
- Multi-leg itinerary
- Repeat customer follow-up

V1 does not need to fully support every service type in the UI.

However, the data model should not be hardcoded to airport pickup only.

---

# 4. Quote Fields Observed

The quote and booking process needs these fields:

- Service type
- Pickup date
- Pickup time
- Pickup location
- Drop-off location
- Airport
- Airport terminal
- Flight number
- Flight arrival or departure time
- Passenger count
- Luggage count
- Vehicle type
- Route distance
- Estimated drive time
- Price
- Currency
- Included fees
- Payment method
- Customer name
- Contact method
- Special requests

Special requests include:

- English-speaking driver
- Same driver
- Early arrival
- Driver should wait
- Driver should not wait
- Receipt needed
- Receipt name
- Multiple transfers paid by one customer

---

# 5. Booking Confirmation Format

Real customers respond well to a structured confirmation format.

V1 should generate booking confirmations like:

```text
Transfer Booking Confirmation

Date:
Pickup Time:
Pickup Address:
Destination:
Flight:
Passengers:
Luggage:
Vehicle:
Price:
Payment:

Notes:
Driver will arrive early.
Price includes tolls, parking fees, and taxes.
```

Driver details should be a separate block:

```text
Driver Details

Driver Name:
Phone:
Vehicle:
Color:
License Plate:
WhatsApp:
```

Do not mix quote suggestion, booking confirmation, and driver assignment into one unclear output.

---

# 6. New Business Events

The real chats show additional event types beyond the original list.

V1 should add these event candidates:

- Receipt Request
- Driver Assignment Needed
- Pickup Time Change
- Early Pickup Request
- Same Driver Request
- English-speaking Driver Request
- Multi-leg Itinerary Request
- Round Trip Discount
- Payment Coordination
- Driver Coordination Issue

Not all of these need full automation in V1.

They should at least be detectable and visible in Boss Inbox or the customer timeline.

---

# 7. Boss Inbox Decision Types

Boss Inbox should support more than quote approval.

Observed decision types:

- Approve quote
- Edit quote
- Approve discount
- Confirm driver availability
- Confirm special request
- Confirm receipt handling
- Confirm pickup time change
- Confirm multi-leg itinerary pricing
- Confirm payment coordination

V1 can still keep only three actions:

- Approve
- Edit
- Reject

But each inbox item needs a clearer `decisionType`.

---

# 8. Development Sequence Adjustment

The next development sequence should be:

1. Real transfer domain model
2. Quote intake and missing-field extraction
3. Quote suggestion with service type, vehicle, included fees, and reason
4. Boss Inbox decision types
5. Booking confirmation generator
6. Driver details block
7. Receipt request tracking
8. Conversation Test Lab scenarios from real chats
9. Train Employee pricing and operation rules
10. Customer Timeline for repeat and multi-leg customers

This sequence is better than building dashboard polish or broad integrations early.

---

# 9. V1 Boundary After Real Chat Review

Add to V1:

- Service type field
- Structured transfer details
- Booking confirmation format
- Driver details block
- Receipt request event
- Pickup time change event
- Multi-leg itinerary detection
- Special request tracking

Still not V1:

- Full driver dispatch system
- Driver mobile app
- Automatic driver assignment
- Automatic payment collection
- Full invoice system
- Advanced route optimization
- Full multi-day travel planner

The system may record and summarize these needs, but the owner still makes decisions.

---

# 10. Data Privacy Rule

Real chat records are training material.

Do not copy private data into seed data or UI examples.

Always anonymize:

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

# 11. Final Adjustment

The project should now optimize for:

```text
Can the AI turn messy transfer chat into an owner-ready quote and booking confirmation?
```

If yes, the product is becoming valuable.

If no, more dashboard features will not save it.
