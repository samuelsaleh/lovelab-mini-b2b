-- =============================================
-- Phase 0 drift repair — applies the 5 missing items
-- detected by `npm run check:schema` on 2026-05-06.
-- =============================================
-- Idempotent. Safe to re-run.
--
-- Sources:
--   - database-migrations/supabase-phase4-fixes.sql   (updated_at columns + trigger function)
--   - supabase/migrations/20260306_org_management_fields.sql (organizations.commission_rate / conditions)
--
-- Run this ONCE in the Supabase SQL editor, then re-run `npm run check:schema`.

-- 1. updated_at columns on profiles / events / documents
ALTER TABLE public.profiles  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.events    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. handle_updated_at() trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Triggers that use the function (drop-then-create for idempotency)
DROP TRIGGER IF EXISTS set_profiles_updated_at  ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_events_updated_at    ON public.events;
CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_documents_updated_at ON public.documents;
CREATE TRIGGER set_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 4. organizations.commission_rate and conditions
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS commission_rate numeric(5,2) DEFAULT NULL
    CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100));

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS conditions text DEFAULT NULL;

-- ─── Verification (run after) ───
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE table_schema='public'
--   AND ((table_name IN ('profiles','events','documents') AND column_name='updated_at')
--        OR (table_name='organizations' AND column_name IN ('commission_rate','conditions')))
-- ORDER BY table_name, column_name;
