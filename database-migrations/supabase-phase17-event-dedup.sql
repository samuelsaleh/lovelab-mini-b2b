-- =====================================================================
-- Phase 17 — Event de-duplication index for agent-type events
-- =====================================================================
-- Adds a partial unique index that prevents two agent-type events from
-- having the same (case-insensitive, trimmed) name within the same
-- organisation. This is the database-level guard backing the application
-- dedup logic in app/api/events/route.js POST.
--
-- Pre-flight:
--   * Run database-migrations/diagnose-event-duplicates.sql FIRST and
--     resolve every duplicate group it returns. The CREATE INDEX
--     statement below will fail if any duplicates remain.
--
-- Why a partial index:
--   * Only agent-type events have an inherent "one per org" semantic.
--     Fairs, partner events, and "other" events can legitimately share
--     names across edition years or locations, so we don't constrain
--     them. App-level dedup handles agent events; nothing else.
--
-- Why COALESCE on organization_id:
--   * The events.organization_id column is nullable (only mandatory for
--     agent events post-phase14, but historically agent events could be
--     created without an org). NULLs aren't compared by the unique index
--     by default, so we coerce them to a sentinel UUID so two unscoped
--     duplicates still collide.
-- =====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS events_agent_name_org_unique
  ON public.events (
    LOWER(TRIM(name)),
    COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE type = 'agent';

COMMENT ON INDEX public.events_agent_name_org_unique IS
  'Phase 17 (event dedup). Prevents duplicate agent-type events with the '
  'same case-insensitive name in the same organisation. Application layer '
  'enforces the same rule and returns the existing event idempotently.';
