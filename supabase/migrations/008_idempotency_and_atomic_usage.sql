-- Production hardening for concurrent widget requests and quota checks.
-- Run after 007_conversation_language.sql.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.conversations
    WHERE company_id IS NOT NULL
    GROUP BY company_id, session_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate company/session conversations exist; clean them before applying 008.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE company_id IS NOT NULL AND conversation_id IS NOT NULL
    GROUP BY company_id, conversation_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate company/conversation bookings exist; clean them before applying 008.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_company_session_unique
  ON public.conversations(company_id, session_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_company_conversation_unique
  ON public.bookings(company_id, conversation_id);

ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_idempotency_unique
  ON public.conversation_messages(conversation_id, idempotency_key);

ALTER TABLE public.boss_inbox
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_boss_inbox_company_dedupe_unique
  ON public.boss_inbox(company_id, dedupe_key);

CREATE OR REPLACE FUNCTION public.consume_company_usage(
  p_company_id UUID,
  p_period_start DATE,
  p_metric TEXT,
  p_limit INTEGER,
  p_amount INTEGER DEFAULT 1
)
RETURNS TABLE(
  allowed BOOLEAN,
  current_count INTEGER,
  limit_count INTEGER,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INTEGER;
  v_next INTEGER;
BEGIN
  IF p_metric NOT IN ('ai_messages', 'conversations', 'leads', 'quote_suggestions') THEN
    RAISE EXCEPTION 'Unsupported usage metric';
  END IF;
  IF p_amount < 1 OR p_limit < 0 THEN
    RAISE EXCEPTION 'Invalid usage amount or limit';
  END IF;

  INSERT INTO public.usage_counters (company_id, period_start)
  VALUES (p_company_id, p_period_start)
  ON CONFLICT (company_id, period_start) DO NOTHING;

  SELECT CASE p_metric
    WHEN 'ai_messages' THEN ai_messages
    WHEN 'conversations' THEN conversations
    WHEN 'leads' THEN leads
    WHEN 'quote_suggestions' THEN quote_suggestions
  END
  INTO v_current
  FROM public.usage_counters
  WHERE company_id = p_company_id AND period_start = p_period_start
  FOR UPDATE;

  IF v_current + p_amount > p_limit THEN
    RETURN QUERY SELECT FALSE, v_current, p_limit, 'limit_reached'::TEXT;
    RETURN;
  END IF;

  v_next := v_current + p_amount;
  UPDATE public.usage_counters
  SET
    ai_messages = ai_messages + CASE WHEN p_metric = 'ai_messages' THEN p_amount ELSE 0 END,
    conversations = conversations + CASE WHEN p_metric = 'conversations' THEN p_amount ELSE 0 END,
    leads = leads + CASE WHEN p_metric = 'leads' THEN p_amount ELSE 0 END,
    quote_suggestions = quote_suggestions + CASE WHEN p_metric = 'quote_suggestions' THEN p_amount ELSE 0 END,
    updated_at = now()
  WHERE company_id = p_company_id AND period_start = p_period_start;

  RETURN QUERY SELECT TRUE, v_next, p_limit, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_company_usage(UUID, DATE, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_company_usage(UUID, DATE, TEXT, INTEGER, INTEGER) TO service_role;
