-- ─────────────────────────────────────────────────────────────────────────
-- Phase 22 (2026-05-13) — Per-agent Google Drive folder cache.
--
-- Stores the resolved Drive folder id for each agent so we don't have to
-- walk the Drive tree on every commission report. Lazy-created on first
-- use (either when the agent is created via POST /api/agents, or the
-- first time a report is generated for them).
--
-- Why a column on `profiles` rather than a separate table:
--   - 1:1 with agents — no relational gain from a join table.
--   - Keeps the agent-creation hook a single UPDATE, no FK dance.
--
-- Resilience:
--   - Idempotent: ADD COLUMN IF NOT EXISTS so re-running the migration
--     is harmless.
--   - Nullable: existing agents stay NULL until their first report or
--     the backfill script runs (`scripts/backfill-agent-drive-folders.mjs`).
--   - No trigger / not RLS-protected at column level — the column is
--     read/written only by service-role API code, never directly by the
--     agent's own session.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS drive_folder_id text;

COMMENT ON COLUMN public.profiles.drive_folder_id IS
  'Phase 22: Cached Google Drive folder id for the agent''s commission ' ||
  'reports. Populated lazily by ensureAgentDriveFolder() in ' ||
  'lib/agentDriveFolder.js. Survives Drive API restarts; null on agents ' ||
  'created before the migration until their first report or the backfill ' ||
  'script (scripts/backfill-agent-drive-folders.mjs) runs.';
