-- Keep the deterministic pricing decision that produced a quote.
-- This makes owner review, later booking messages, and learning cases auditable.
ALTER TABLE IF EXISTS public.boss_inbox
  ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB;

ALTER TABLE IF EXISTS public.bookings
  ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB;

ALTER TABLE IF EXISTS public.bookings
  ADD COLUMN IF NOT EXISTS toll_yen NUMERIC;

COMMENT ON COLUMN public.boss_inbox.pricing_snapshot IS
  'WorkflowAI pricing engine snapshot used to create the quote suggestion.';

COMMENT ON COLUMN public.bookings.pricing_snapshot IS
  'WorkflowAI pricing engine snapshot retained after quote approval.';
