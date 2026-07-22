-- V1.5 order-state safeguards for the airport-transfer workflow.
-- New WorkflowAI bookings and inbox quotes use the business currency by default.
ALTER TABLE IF EXISTS public.bookings
  ALTER COLUMN currency SET DEFAULT 'JPY';

ALTER TABLE IF EXISTS public.boss_inbox
  ALTER COLUMN currency SET DEFAULT 'JPY';

COMMENT ON COLUMN public.bookings.currency IS
  'Currency of the latest deterministic quote snapshot; JP airport transfers use JPY.';

COMMENT ON COLUMN public.boss_inbox.currency IS
  'Currency of the quote or commercial decision shown to the owner.';
