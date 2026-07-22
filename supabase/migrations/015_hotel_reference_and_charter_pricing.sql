-- Reference data for hotel positioning and the standard private-charter price book.
-- Nightly rates are intentionally owner-maintained; the table must not invent market prices.

CREATE TABLE IF NOT EXISTS public.hotel_reference_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  hotel_name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  city TEXT,
  region TEXT,
  star_rating NUMERIC(2,1) CHECK (star_rating IS NULL OR (star_rating >= 0 AND star_rating <= 5)),
  nightly_rate_yen INTEGER CHECK (nightly_rate_yen IS NULL OR nightly_rate_yen >= 0),
  currency TEXT NOT NULL DEFAULT 'JPY',
  rate_basis TEXT NOT NULL DEFAULT 'manual'
    CHECK (rate_basis IN ('manual', 'observed', 'average')),
  source_url TEXT,
  observed_at TIMESTAMPTZ,
  charter_adjustment_yen INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, hotel_name)
);

CREATE INDEX IF NOT EXISTS idx_hotel_reference_company_active
  ON public.hotel_reference_catalog(company_id, active);

CREATE INDEX IF NOT EXISTS idx_hotel_reference_city
  ON public.hotel_reference_catalog(company_id, city);

ALTER TABLE public.hotel_reference_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hotel_reference_catalog FROM anon, authenticated;

UPDATE public.business_config
SET config = jsonb_set(
  jsonb_set(
    config,
    '{pricingPolicy,charter}',
    $charter$
    {
      "standardHours": 10,
      "standardDistanceKm": 300,
      "alphardBaseYen": 60000,
      "hiaceBaseYen": 66000,
      "fujiAlphardBaseYen": 70000,
      "fujiHiaceBaseYen": 75000,
      "fujiKeywords": ["fuji", "mount fuji", "kawaguchiko", "gotemba", "yamanakako"]
    }
    $charter$::jsonb,
    true
  ),
  '{vehicles}',
  COALESCE(
    (
      SELECT jsonb_agg(
        CASE
          WHEN vehicle->>'id' = 'vehicle_alphard'
            THEN jsonb_set(vehicle, '{capacity,luggage}', to_jsonb(6), true)
          ELSE vehicle
        END
      )
      FROM jsonb_array_elements(COALESCE(config->'vehicles', '[]'::jsonb)) AS item(vehicle)
    ),
    config->'vehicles'
  ),
  true
)
WHERE company_id = '40757cc5-5d3e-4997-be2b-767820c326c6';
