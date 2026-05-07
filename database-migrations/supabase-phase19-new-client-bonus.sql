-- =====================================================================
-- Phase 19 — Per-agent "New Client Bonus" feature
-- =====================================================================
-- Adds two columns to profiles so an admin can grant an agent a flat
-- cash bonus every time they bring in a new client. Detection logic
-- and the retroactive backfill live in lib/newClientBonus.js.
--
-- The bonus itself is recorded as a row in agent_commissions with
-- type='new_client_bonus', so it flows through the same pending →
-- paid lifecycle as ordinary order commissions and shows up in the
-- existing Commission History table on the agent details page.
--
-- SAFE TO RE-RUN: every statement uses IF NOT EXISTS.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS new_client_bonus_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS new_client_bonus_amount numeric(10,2);

-- Sanity check: bonus amount cannot be negative.
-- We allow NULL (feature disabled or amount not yet configured) and 0
-- (toggle on but no payout — same as disabled, but keeps audit trail).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_new_client_bonus_amount_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_new_client_bonus_amount_check
        CHECK (new_client_bonus_amount IS NULL OR new_client_bonus_amount >= 0);
  END IF;
END$$;

-- Performance index for the per-agent / per-type / per-document lookups
-- the bonus detection logic does on every order save.
-- Partial: ignores cancelled rows (which never block bonuses).
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent_type_doc
  ON public.agent_commissions (agent_id, type, document_id)
  WHERE status != 'cancelled';

COMMENT ON COLUMN public.profiles.new_client_bonus_enabled IS
  'Phase 19. When true, every order this agent saves for a brand-new '
  'client triggers a new_client_bonus commission row of '
  'new_client_bonus_amount EUR.';

COMMENT ON COLUMN public.profiles.new_client_bonus_amount IS
  'Phase 19. EUR amount paid to this agent each time they bring in a '
  'new client. NULL or 0 effectively disables the feature.';

COMMENT ON INDEX public.idx_agent_commissions_agent_type_doc IS
  'Phase 19. Speeds up "first order for this customer for this agent" '
  'detection in lib/newClientBonus.js. Excludes cancelled rows so a '
  'cancelled prior order does not block a future bonus.';

-- ─── Verification (optional, run after) ──────────────────────────────
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='profiles'
--   AND column_name LIKE 'new_client_bonus%';
--
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname='public' AND indexname='idx_agent_commissions_agent_type_doc';
