-- =============================================
-- Codify-existing-schema migration
-- =============================================
-- Some columns / tables were created directly in production via the Supabase
-- dashboard and never tracked in a migration file in this repo. That meant a
-- fresh deployment (e.g. new staging project) would not match production.
--
-- This migration documents that existing reality so a from-scratch deploy
-- now reproduces production exactly. Idempotent — safe to run on the live
-- database too; it will be a no-op there.
--
-- Detected by: scripts/check-schema-drift.mjs + scripts/inspect-undocumented.mjs
-- on 2026-05-06.

-- ─── 1. events.type ─────────────────────────────────────────────────────────
-- Used by app/api/events/route.js to distinguish folder kinds.
-- Live values: 'agent', 'fair', 'other', 'partner'.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'other';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_type_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_type_check
      CHECK (type IN ('agent', 'fair', 'other', 'partner'));
  END IF;
END $$;

-- ─── 2. profiles.agent_deleted_at ──────────────────────────────────────────
-- Timestamp set when an agent is soft-deleted via app/api/agents/[id]/route.js.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agent_deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_agent_deleted_at
  ON public.profiles (agent_deleted_at)
  WHERE agent_deleted_at IS NOT NULL;

-- ─── 3. profiles.agent_contract_url ─────────────────────────────────────────
-- Storage URL of the uploaded agent contract PDF.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agent_contract_url text;

-- ─── 4. audit_state singleton table ────────────────────────────────────────
-- Singleton row keyed by id='mapig-audit'. Holds a JSON blob of audit-run
-- state used by scheduled audit jobs. RLS policies for it are in
-- supabase/migrations/20260311000000_fix_rls_and_function_security.sql.

CREATE TABLE IF NOT EXISTS public.audit_state (
  id          text        PRIMARY KEY DEFAULT 'mapig-audit',
  data        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_state ENABLE ROW LEVEL SECURITY;

-- ─── Verification ──────────────────────────────────────────────────────────
-- After running, this should match the output of scripts/inspect-undocumented.mjs.
--
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND ((table_name = 'events' AND column_name = 'type')
--    OR (table_name = 'profiles' AND column_name IN ('agent_deleted_at','agent_contract_url'))
--    OR table_name = 'audit_state')
-- ORDER BY table_name, column_name;
