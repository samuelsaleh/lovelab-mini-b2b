-- =============================================
-- LoveLab B2B - Phase 15: Salesforce client source tagging
-- =============================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_comment text,
  ADD COLUMN IF NOT EXISTS source_imported_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clients_source_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_source_check
      CHECK (source IN ('manual', 'salesforce'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_lookup_norm
  ON public.clients (
    lower(coalesce(company, '')),
    lower(coalesce(country, '')),
    lower(coalesce(city, ''))
  );
