-- =============================================
-- LoveLab B2B - Phase 6: Role-Based Access
-- Run this in Supabase SQL Editor AFTER phase 5
-- =============================================
-- 6 admin users can see ALL documents, events, and analytics.
-- All other users (members) can only see their own documents and events.

-- ─── 1. DOCUMENTS: role-based SELECT, UPDATE, DELETE ───────────────────────

DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
CREATE POLICY "Role-based document access" ON public.documents FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL AND (
      created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
CREATE POLICY "Role-based document update" ON public.documents FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
CREATE POLICY "Role-based document delete" ON public.documents FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── 2. EVENTS: role-based SELECT, UPDATE, DELETE ──────────────────────────

DROP POLICY IF EXISTS "Users can view own events" ON public.events;
CREATE POLICY "Role-based event access" ON public.events FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Users can update own events" ON public.events;
CREATE POLICY "Role-based event update" ON public.events FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Users can delete own events" ON public.events;
CREATE POLICY "Role-based event delete" ON public.events FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── 3. PROFILES: admins can read all profiles ─────────────────────────────
-- Needed so DocumentsPanel can show "Created by" name for documents from
-- other users when an admin views them.

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Profile access" ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ─── 4. Set the 6 admin users ──────────────────────────────────────────────
-- These users will have full access to all documents and events.
-- All other users remain 'member' (default) and see only their own data.

UPDATE public.profiles
SET role = 'admin'
WHERE email IN (
  'albertosaleh@gmail.com',
  'didabergman8@gmail.com',
  'dionnesaleh@gmail.com',
  'elieschonfeld1@gmail.com',
  'koladiyahardik@gmail.com',
  'pratikdevani1326@gmail.com'
);

-- ─── Verification query (optional — run after to confirm) ──────────────────
-- SELECT email, role FROM public.profiles ORDER BY role, email;
