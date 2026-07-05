-- ============================================================
-- Phase 30 — Team (sub-organization) shared visibility
-- ============================================================
-- Every ACTIVE member of an organization can view the same team data:
-- teammates' documents and the org's events. Management (invite / pause /
-- remove / rates) stays owner/admin-only and is enforced in the API layer.
--
-- The API routes use the service-role client, so these policies are
-- defense-in-depth: they make direct PostgREST access match the same
-- visibility model the API enforces.
--
-- Run this in the Supabase SQL editor BEFORE deploying the Team feature.
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ── 1. Helper: do two users share an active organization? ──────────────
-- SECURITY DEFINER so the check bypasses the self-referential RLS on
-- organization_memberships (same pattern as public.is_admin()).
CREATE OR REPLACE FUNCTION public.shares_active_org_with(target_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships me
    JOIN public.organization_memberships them
      ON them.organization_id = me.organization_id
    WHERE me.user_id = auth.uid()
      AND them.user_id = target_user
      AND me.deleted_at IS NULL
      AND them.deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.shares_active_org_with(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.shares_active_org_with(uuid) TO authenticated;

-- ── 2. Helper: is the current user an active member of this org? ───────
CREATE OR REPLACE FUNCTION public.is_active_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships m
    WHERE m.organization_id = org_id
      AND m.user_id = auth.uid()
      AND m.deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_org_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_active_org_member(uuid) TO authenticated;

-- ── 3. Documents: team members can SELECT teammates' documents ─────────
DROP POLICY IF EXISTS "Org members can view team documents" ON public.documents;
CREATE POLICY "Org members can view team documents"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.shares_active_org_with(created_by)
      OR (
        event_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.events e
          WHERE e.id = documents.event_id
            AND e.organization_id IS NOT NULL
            AND public.is_active_org_member(e.organization_id)
        )
      )
    )
  );

-- ── 4. Events: team members can SELECT org events + teammates' events ──
DROP POLICY IF EXISTS "Org members can view team events" ON public.events;
CREATE POLICY "Org members can view team events"
  ON public.events FOR SELECT
  TO authenticated
  USING (
    (organization_id IS NOT NULL AND public.is_active_org_member(organization_id))
    OR public.shares_active_org_with(created_by)
  );

-- ── 5. Sanity indexes for the team-scope lookups ───────────────────────
CREATE INDEX IF NOT EXISTS idx_org_memberships_org_user_active
  ON public.organization_memberships (organization_id, user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_org_memberships_user_active
  ON public.organization_memberships (user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_organization_id
  ON public.profiles (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_organization_id
  ON public.events (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_created_by
  ON public.documents (created_by);

-- ── 6. Verification ────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Phase 30 team visibility applied: helper functions, document/event team policies, indexes.';
END $$;
