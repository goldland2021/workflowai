# WorkflowAI Pricing System

Version: 1.0

## Purpose

WorkflowAI owns its pricing decision. It does not import runtime code from the
marketing site and it does not ask the language model to invent a price.

The pricing engine uses structured business policy and returns a pricing
snapshot with the source, rule version, confidence, vehicle count, and approval
reason.

## Pricing Sources

1. Fixed route rules for airport-to-airport transfers and known resort areas.
2. Distance formula for supported airport routes when route distance is known.
3. Existing business rules for non-airport services that are not yet covered by
   the airport pricing engine.

The first engine version is calibrated in JPY with airport-specific base fares,
minimum fares, toll allowances, a HiAce surcharge, and pickup/drop-off waiting
minutes.

## Approval Policy

The engine may mark a quote as eligible for a standard policy quote only when:

- the airport and direction are recognized;
- the required trip fields are present;
- the route has a fixed-rule match or a known distance;
- one configured vehicle can carry the passengers and luggage;
- there is no discount, urgent, round-trip, multi-leg, or special pricing request;
- confidence meets `autoQuoteMinConfidence`.

The engine keeps the quote in Boss Inbox when automatic quotes are disabled,
distance is missing, more than one vehicle is needed, the request is special,
or confidence is below the configured threshold.

An automatic standard quote never confirms vehicle availability, driver
assignment, cancellation, refund, or a customer-requested discount.

## Persistence

Every quote that reaches WorkflowAI carries a `pricing` snapshot. The snapshot
is retained on Boss Inbox items and bookings so the owner can understand which
rule produced a price and later compare it with the owner's decision.
