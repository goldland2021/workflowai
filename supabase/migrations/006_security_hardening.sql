-- Shared rate limits and database-level isolation for production traffic.

CREATE TABLE IF NOT EXISTS public.request_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_rate_limits_updated_at
  ON public.request_rate_limits(updated_at);

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_bucket_key TEXT,
  p_window_seconds INTEGER,
  p_max_requests INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_count INTEGER;
BEGIN
  IF p_bucket_key IS NULL OR length(p_bucket_key) <> 64 THEN
    RAISE EXCEPTION 'Invalid rate-limit key';
  END IF;
  IF p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate-limit window';
  END IF;
  IF p_max_requests < 1 OR p_max_requests > 10000 THEN
    RAISE EXCEPTION 'Invalid rate-limit maximum';
  END IF;

  INSERT INTO public.request_rate_limits (
    bucket_key,
    window_started_at,
    request_count,
    updated_at
  )
  VALUES (p_bucket_key, v_now, 1, v_now)
  ON CONFLICT (bucket_key) DO UPDATE
  SET
    window_started_at = CASE
      WHEN request_rate_limits.window_started_at
        + make_interval(secs => p_window_seconds) <= v_now
      THEN v_now
      ELSE request_rate_limits.window_started_at
    END,
    request_count = CASE
      WHEN request_rate_limits.window_started_at
        + make_interval(secs => p_window_seconds) <= v_now
      THEN 1
      ELSE request_rate_limits.request_count + 1
    END,
    updated_at = v_now
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_max_requests;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_auth_token(
  p_token_hash TEXT,
  p_kind TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  UPDATE public.auth_tokens
  SET used_at = now()
  WHERE id = (
    SELECT id
    FROM public.auth_tokens
    WHERE token_hash = p_token_hash
      AND kind = p_kind
      AND used_at IS NULL
      AND expires_at > now()
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING company_id INTO v_company_id;

  RETURN v_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_auth_token(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_auth_token(TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.increment_company_usage(UUID, DATE, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_company_usage(UUID, DATE, TEXT, INTEGER) TO service_role;

ALTER TABLE IF EXISTS public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.boss_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.business_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.request_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.companies FROM anon, authenticated;
REVOKE ALL ON TABLE public.conversations FROM anon, authenticated;
REVOKE ALL ON TABLE public.conversation_messages FROM anon, authenticated;
REVOKE ALL ON TABLE public.bookings FROM anon, authenticated;
REVOKE ALL ON TABLE public.boss_inbox FROM anon, authenticated;
REVOKE ALL ON TABLE public.business_config FROM anon, authenticated;
REVOKE ALL ON TABLE public.usage_counters FROM anon, authenticated;
REVOKE ALL ON TABLE public.auth_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.auth_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.ai_failures FROM anon, authenticated;
REVOKE ALL ON TABLE public.request_rate_limits FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.request_rate_limits TO service_role;
