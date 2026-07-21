-- Structured conversation memory, booking timeline events, and owner-reviewable
-- learning cases. Run after 010_idempotent_usage_reservations.sql.

CREATE TABLE IF NOT EXISTS public.conversation_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  fact_key TEXT NOT NULL,
  fact_value JSONB NOT NULL,
  source TEXT NOT NULL DEFAULT 'customer'
    CHECK (source IN ('customer', 'owner', 'system')),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 1
    CHECK (confidence >= 0 AND confidence <= 1),
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, conversation_id, fact_key)
);

CREATE INDEX IF NOT EXISTS idx_conversation_memory_lookup
  ON public.conversation_memory(company_id, conversation_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.booking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  status_from TEXT,
  status_to TEXT,
  actor_type TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('owner', 'system', 'customer')),
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_booking_events_timeline
  ON public.booking_events(company_id, booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.learning_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('approved', 'edited', 'rejected')),
  review_status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (review_status IN ('candidate', 'accepted', 'dismissed')),
  reason_code TEXT NOT NULL,
  safe_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, source_type, source_id, outcome)
);

CREATE INDEX IF NOT EXISTS idx_learning_cases_review
  ON public.learning_cases(company_id, review_status, created_at DESC);

ALTER TABLE public.conversation_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_cases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.conversation_memory, public.booking_events, public.learning_cases
  FROM anon, authenticated;
