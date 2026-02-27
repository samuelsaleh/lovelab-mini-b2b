-- =============================================
-- LoveLab B2B - Phase 6 Fix 2: Nuke Old Policies
-- Run this in Supabase SQL Editor
-- =============================================
-- Old "Authenticated users can view ..." policies from phase 3/4 are still
-- active alongside the new role-based ones. In Supabase, SELECT policies
-- combine with OR, so the old open policy lets everyone see everything.
-- This script drops every possible old policy name and leaves only the
-- correct role-based policies (which were already created in phase 6 fix).

-- ─── DOCUMENTS: drop ALL old policy names (every variant ever created) ────
DROP POLICY IF EXISTS "Authenticated users can view documents"       ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can create documents"     ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can update documents"     ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can delete documents"     ON public.documents;
DROP POLICY IF EXISTS "All authenticated users can view documents"   ON public.documents;
DROP POLICY IF EXISTS "All authenticated users can update documents" ON public.documents;
DROP POLICY IF EXISTS "All authenticated users can delete documents" ON public.documents;
DROP POLICY IF EXISTS "Allow anon read documents"                    ON public.documents;
DROP POLICY IF EXISTS "Users can view own documents"                 ON public.documents;
DROP POLICY IF EXISTS "Users can create own documents"               ON public.documents;
DROP POLICY IF EXISTS "Users can update own documents"               ON public.documents;
DROP POLICY IF EXISTS "Users can delete own documents"               ON public.documents;

-- ─── EVENTS: drop ALL old policy names (every variant ever created) ────────
DROP POLICY IF EXISTS "Authenticated users can view events"          ON public.events;
DROP POLICY IF EXISTS "Authenticated users can create events"        ON public.events;
DROP POLICY IF EXISTS "Authenticated users can update events"        ON public.events;
DROP POLICY IF EXISTS "Authenticated users can delete events"        ON public.events;
DROP POLICY IF EXISTS "All authenticated users can view events"      ON public.events;
DROP POLICY IF EXISTS "All authenticated users can update events"    ON public.events;
DROP POLICY IF EXISTS "All authenticated users can delete events"    ON public.events;
DROP POLICY IF EXISTS "Allow anon read events"                       ON public.events;
DROP POLICY IF EXISTS "Users can view own events"                    ON public.events;
DROP POLICY IF EXISTS "Users can create own events"                  ON public.events;
DROP POLICY IF EXISTS "Users can update own events"                  ON public.events;
DROP POLICY IF EXISTS "Users can delete own events"                  ON public.events;

-- ─── PROFILES: drop all old policy names ──────────────────────────────────
DROP POLICY IF EXISTS "Users can view own profile"               ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"             ON public.profiles;

-- ─── Ensure is_admin() function exists ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ─── PROFILES: recreate correct policies ──────────────────────────────────
DROP POLICY IF EXISTS "Profile access" ON public.profiles;
CREATE POLICY "Profile access" ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- ─── DOCUMENTS: recreate correct role-based policies ──────────────────────
DROP POLICY IF EXISTS "Role-based document access" ON public.documents;
CREATE POLICY "Role-based document access" ON public.documents FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL AND (
      created_by = auth.uid()
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "Role-based document insert" ON public.documents;
CREATE POLICY "Role-based document insert" ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Role-based document update" ON public.documents;
CREATE POLICY "Role-based document update" ON public.documents FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Role-based document delete" ON public.documents;
CREATE POLICY "Role-based document delete" ON public.documents FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

-- ─── EVENTS: recreate correct role-based policies ─────────────────────────
DROP POLICY IF EXISTS "Role-based event access" ON public.events;
CREATE POLICY "Role-based event access" ON public.events FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Role-based event insert" ON public.events;
CREATE POLICY "Role-based event insert" ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Role-based event update" ON public.events;
CREATE POLICY "Role-based event update" ON public.events FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Role-based event delete" ON public.events;
CREATE POLICY "Role-based event delete" ON public.events FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

-- ─── Verification ─────────────────────────────────────────────────────────
-- Run this after to confirm only role-based policies remain:
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE tablename IN ('documents', 'events', 'profiles')
-- ORDER BY tablename, cmd;
