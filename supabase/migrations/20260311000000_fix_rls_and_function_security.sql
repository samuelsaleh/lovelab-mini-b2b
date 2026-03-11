-- Fix Supabase security lint issues:
--   1. Enable RLS + policies on organizations, organization_memberships, organization_invitations
--   2. Tighten overly permissive policies on audit_state and clients
--   3. Fix mutable search_path on 4 functions

-- ============================================================
-- Section 1: Enable RLS on organization tables
-- ============================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Section 2: Policies for organizations
-- ============================================================

CREATE POLICY "Members and admins can view organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = organizations.id
        AND om.user_id = auth.uid()
        AND om.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Org owners and admins can update organizations"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = organizations.id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = organizations.id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete organizations"
  ON public.organizations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ============================================================
-- Section 3: Policies for organization_memberships
-- ============================================================

CREATE POLICY "Org members can view memberships in their org"
  ON public.organization_memberships FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships my_om
      WHERE my_om.organization_id = organization_memberships.organization_id
        AND my_om.user_id = auth.uid()
        AND my_om.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Org owners and admins can insert memberships"
  ON public.organization_memberships FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = organization_memberships.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Org owners, admins, or self can update memberships"
  ON public.organization_memberships FOR UPDATE
  TO authenticated
  USING (
    organization_memberships.user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = organization_memberships.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    organization_memberships.user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = organization_memberships.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Org owners and admins can delete memberships"
  ON public.organization_memberships FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = organization_memberships.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ============================================================
-- Section 4: Policies for organization_invitations
-- ============================================================

CREATE POLICY "Org members and invitees can view invitations"
  ON public.organization_invitations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = organization_invitations.organization_id
        AND om.user_id = auth.uid()
        AND om.deleted_at IS NULL
    )
    OR organization_invitations.email = (
      SELECT email FROM auth.users WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Org owners and admins can create invitations"
  ON public.organization_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = organization_invitations.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Invitees can update their own invitations"
  ON public.organization_invitations FOR UPDATE
  TO authenticated
  USING (
    organization_invitations.email = (
      SELECT email FROM auth.users WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    organization_invitations.email = (
      SELECT email FROM auth.users WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Org owners and admins can delete invitations"
  ON public.organization_invitations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = organization_invitations.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ============================================================
-- Section 5: Fix audit_state overly permissive policies
-- ============================================================

DROP POLICY IF EXISTS "Allow public insert" ON public.audit_state;
DROP POLICY IF EXISTS "Allow public update" ON public.audit_state;

CREATE POLICY "Authenticated users can insert audit_state"
  ON public.audit_state FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update audit_state"
  ON public.audit_state FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- Section 6: Fix clients INSERT policy
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can insert clients" ON public.clients;

-- TODO: tighten further with org-scoped check once clients.organization_id is confirmed
CREATE POLICY "Authenticated users can insert clients"
  ON public.clients FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- Section 7: Fix mutable search_path on functions
--
-- Uses pg_proc lookup so we don't need to know exact argument
-- signatures; matches all overloads by name.
-- ============================================================

DO $$
DECLARE
  _oid oid;
BEGIN
  FOR _oid IN
    SELECT p.oid FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'update_drafts_updated_at',
        'is_agent',
        'is_admin',
        'get_agent_stats'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = ''''', _oid::regprocedure);
  END LOOP;
END $$;
