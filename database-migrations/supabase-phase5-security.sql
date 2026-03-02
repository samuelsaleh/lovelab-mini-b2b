-- =============================================
-- LoveLab B2B - Phase 5: Security Hardening
-- Run this in Supabase SQL Editor AFTER phase 4
-- =============================================
-- This migration tightens RLS policies from "any authenticated user"
-- to "owner only" for clients, documents, and events.

-- ─── 1. Fix CLIENTS RLS policies (owner-scoped) ───

DROP POLICY IF EXISTS "Authenticated users can view clients" ON public.clients;
CREATE POLICY "Users can view own clients"
  ON public.clients FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can create clients" ON public.clients;
CREATE POLICY "Users can create own clients"
  ON public.clients FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can update clients" ON public.clients;
CREATE POLICY "Users can update own clients"
  ON public.clients FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

-- Add DELETE policy for clients (was missing)
CREATE POLICY "Users can delete own clients"
  ON public.clients FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- ─── 2. Fix DOCUMENTS RLS policies (owner-scoped) ───

DROP POLICY IF EXISTS "Authenticated users can view documents" ON public.documents;
CREATE POLICY "Users can view own documents"
  ON public.documents FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Authenticated users can create documents" ON public.documents;
CREATE POLICY "Users can create own documents"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can update documents" ON public.documents;
CREATE POLICY "Users can update own documents"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can delete documents" ON public.documents;
CREATE POLICY "Users can delete own documents"
  ON public.documents FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- ─── 3. Fix EVENTS RLS policies (owner-scoped) ───

DROP POLICY IF EXISTS "Authenticated users can view events" ON public.events;
CREATE POLICY "Users can view own events"
  ON public.events FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can create events" ON public.events;
CREATE POLICY "Users can create own events"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can update events" ON public.events;
CREATE POLICY "Users can update own events"
  ON public.events FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can delete events" ON public.events;
CREATE POLICY "Users can delete own events"
  ON public.events FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- ─── 4. Storage policies for documents bucket ───
-- Ensure storage files are also scoped to the uploading user.
-- Files are stored under paths like: {user_id}/filename.pdf
-- Uncomment and adapt if you haven't set storage policies yet:
--
-- CREATE POLICY "Users can upload own documents"
--   ON storage.objects FOR INSERT
--   TO authenticated
--   WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
--
-- CREATE POLICY "Users can view own documents"
--   ON storage.objects FOR SELECT
--   TO authenticated
--   USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
--
-- CREATE POLICY "Users can delete own documents"
--   ON storage.objects FOR DELETE
--   TO authenticated
--   USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
