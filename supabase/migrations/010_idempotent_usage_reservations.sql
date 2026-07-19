-- Bind quota reservations to API idempotency keys so a retried turn cannot
-- consume the same allowance twice after a worker crash.

CREATE TABLE IF NOT EXISTS public.usage_reservations (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  metric TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  current_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, period_start, metric, idempotency_key)
);

ALTER TABLE public.usage_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.usage_reservations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_company_usage_idempotent(
  p_company_id UUID,
  p_period_start DATE,
  p_metric TEXT,
  p_limit INTEGER,
  p_amount INTEGER DEFAULT 1,
  p_idempotency_key TEXT DEFAULT NULL
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
  v_reserved_allowed BOOLEAN;
  v_reserved_count INTEGER;
BEGIN
  IF p_metric NOT IN ('ai_messages', 'conversations', 'leads', 'quote_suggestions') THEN
    RAISE EXCEPTION 'Unsupported usage metric';
  END IF;
  IF p_amount < 1 OR p_limit < 0 THEN
    RAISE EXCEPTION 'Invalid usage amount or limit';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.usage_reservations (
      company_id, period_start, metric, idempotency_key, allowed, current_count
    )
    VALUES (p_company_id, p_period_start, p_metric, p_idempotency_key, FALSE, 0)
    ON CONFLICT (company_id, period_start, metric, idempotency_key) DO NOTHING;

    IF NOT FOUND THEN
      SELECT allowed, current_count
      INTO v_reserved_allowed, v_reserved_count
      FROM public.usage_reservations
      WHERE company_id = p_company_id
        AND period_start = p_period_start
        AND metric = p_metric
        AND idempotency_key = p_idempotency_key;

      RETURN QUERY SELECT
        v_reserved_allowed,
        v_reserved_count,
        p_limit,
        CASE WHEN v_reserved_allowed THEN NULL::TEXT ELSE 'limit_reached'::TEXT END;
      RETURN;
    END IF;
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
    IF p_idempotency_key IS NOT NULL THEN
      UPDATE public.usage_reservations
      SET allowed = FALSE, current_count = v_current
      WHERE company_id = p_company_id
        AND period_start = p_period_start
        AND metric = p_metric
        AND idempotency_key = p_idempotency_key;
    END IF;
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

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.usage_reservations
    SET allowed = TRUE, current_count = v_next
    WHERE company_id = p_company_id
      AND period_start = p_period_start
      AND metric = p_metric
      AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN QUERY SELECT TRUE, v_next, p_limit, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_company_usage_idempotent(UUID, DATE, TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_company_usage_idempotent(UUID, DATE, TEXT, INTEGER, INTEGER, TEXT) TO service_role;
