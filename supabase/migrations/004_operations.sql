-- Third-stage operations visibility for AI failures.
-- Run after 003_saas_foundation.sql in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.ai_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  stage text NOT NULL,
  message text NOT NULL,
  provider text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_failures_company_created_idx
  ON public.ai_failures(company_id, created_at DESC);
