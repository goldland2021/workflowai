-- WorkflowAI SaaS foundation: plans, usage, revocable sessions, and widget security.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS allowed_widget_origins TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS widget_token_version INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_plan_check'
  ) THEN
    ALTER TABLE companies ADD CONSTRAINT companies_plan_check
      CHECK (plan IN ('trial', 'starter', 'growth'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_subscription_status_check'
  ) THEN
    ALTER TABLE companies ADD CONSTRAINT companies_subscription_status_check
      CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'cancelled'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS usage_counters (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  ai_messages INTEGER NOT NULL DEFAULT 0,
  conversations INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  quote_suggestions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, period_start)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('password_reset', 'email_verification')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_company_period
  ON usage_counters(company_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_company
  ON auth_sessions(company_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_lookup
  ON auth_tokens(token_hash, kind, expires_at);

CREATE OR REPLACE FUNCTION increment_company_usage(
  p_company_id UUID,
  p_period_start DATE,
  p_metric TEXT,
  p_amount INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_metric NOT IN ('ai_messages', 'conversations', 'leads', 'quote_suggestions') THEN
    RAISE EXCEPTION 'Unsupported usage metric';
  END IF;

  INSERT INTO usage_counters (company_id, period_start)
  VALUES (p_company_id, p_period_start)
  ON CONFLICT (company_id, period_start) DO NOTHING;

  UPDATE usage_counters
  SET
    ai_messages = ai_messages + CASE WHEN p_metric = 'ai_messages' THEN p_amount ELSE 0 END,
    conversations = conversations + CASE WHEN p_metric = 'conversations' THEN p_amount ELSE 0 END,
    leads = leads + CASE WHEN p_metric = 'leads' THEN p_amount ELSE 0 END,
    quote_suggestions = quote_suggestions + CASE WHEN p_metric = 'quote_suggestions' THEN p_amount ELSE 0 END,
    updated_at = now()
  WHERE company_id = p_company_id AND period_start = p_period_start;
END;
$$;
