-- Keep the customer's established language stable across the whole conversation.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS customer_language TEXT;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_customer_language_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_customer_language_check
  CHECK (customer_language IS NULL OR customer_language IN ('zh', 'en', 'ar'));
