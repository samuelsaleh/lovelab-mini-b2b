-- =============================================
-- LoveLab B2B - Phase 6 Fix: RLS Recursion
-- Run this in Supabase SQL Editor IMMEDIATELY
-- =============================================
-- The profiles RLS policy in phase 6 caused infinite recursion:
-- documents/events check profiles to find admin → profiles RLS checks profiles to find admin → loop.
-- Fix: create a SECURITY DEFINER function that queries profiles WITHOUT going through RLS.

-- ─── 1. Create is_admin() helper (bypasses RLS, no recursion) ──────────────
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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ─── 2. Fix PROFILES policy (was recursive) ────────────────────────────────
DROP POLICY IF EXISTS "Profile access" ON public.profiles;
CREATE POLICY "Profile access" ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin()
  );

-- ─── 3. Fix DOCUMENTS policies to use is_admin() ──────────────────────────
DROP POLICY IF EXISTS "Role-based document access" ON public.documents;
CREATE POLICY "Role-based document access" ON public.documents FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL AND (
      created_by = auth.uid()
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "Role-based document update" ON public.documents;
CREATE POLICY "Role-based document update" ON public.documents FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Role-based document delete" ON public.documents;
CREATE POLICY "Role-based document delete" ON public.documents FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

-- ─── 4. Fix EVENTS policies to use is_admin() ─────────────────────────────
DROP POLICY IF EXISTS "Role-based event access" ON public.events;
CREATE POLICY "Role-based event access" ON public.events FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Role-based event update" ON public.events;
CREATE POLICY "Role-based event update" ON public.events FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Role-based event delete" ON public.events;
CREATE POLICY "Role-based event delete" ON public.events FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

-- ─── Verification (optional) ──────────────────────────────────────────────
-- SELECT public.is_admin(); -- should return true if you are admin, false otherwise
