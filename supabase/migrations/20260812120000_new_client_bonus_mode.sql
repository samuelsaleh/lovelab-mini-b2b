-- =====================================================================
-- New-client bonus: three modes instead of one on/off switch
-- =====================================================================
-- Phase 19 gave every agent a boolean `new_client_bonus_enabled`. On
-- meant "create a €X bonus automatically the first time this agent
-- brings in a customer". In practice most new clients should NOT earn
-- a bonus, so the admin now wants to decide case by case.
--
--   'off'    — no new-client bonus for this agent, no button, nothing.
--   'manual' — no automatic bonus; the admin adds one per order from
--              the commission table when they decide it is warranted.
--   'auto'   — the Phase 19 behaviour: created automatically on save.
--
-- `new_client_bonus_enabled` is kept as a mirror (true for manual and
-- auto) so older code paths and reports keep working unchanged.
--
-- SAFE TO RE-RUN: the seed only runs the first time the column is
-- created, so re-running never resets an agent that was since moved
-- to 'manual'.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'new_client_bonus_mode'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN new_client_bonus_mode text NOT NULL DEFAULT 'off';

    -- Seed from the old boolean so nobody's behaviour changes on deploy.
    UPDATE public.profiles
      SET new_client_bonus_mode = 'auto'
      WHERE new_client_bonus_enabled IS TRUE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_new_client_bonus_mode_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_new_client_bonus_mode_check
        CHECK (new_client_bonus_mode IN ('off', 'manual', 'auto'));
  END IF;
END$$;

COMMENT ON COLUMN public.profiles.new_client_bonus_mode IS
  'off = never, manual = admin decides per order from the commission '
  'table, auto = created automatically on the first order for a new '
  'customer (the original Phase 19 behaviour). new_client_bonus_enabled '
  'mirrors this as (mode <> ''off'').';

-- ─── Verification (optional, run after) ──────────────────────────────
-- SELECT new_client_bonus_mode, new_client_bonus_enabled, count(*)
-- FROM public.profiles GROUP BY 1, 2 ORDER BY 1;
