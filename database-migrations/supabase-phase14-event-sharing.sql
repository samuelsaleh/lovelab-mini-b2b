-- =============================================
-- LoveLab B2B - Phase 14: Event folder sharing
-- =============================================

-- Re-assert strict role-based policies for documents/events to avoid legacy OR leaks.
DROP POLICY IF EXISTS "Authenticated users can view documents"       ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can create documents"     ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can update documents"     ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can delete documents"     ON public.documents;
DROP POLICY IF EXISTS "All authenticated users can view documents"   ON public.documents;
DROP POLICY IF EXISTS "All authenticated users can update documents" ON public.documents;
DROP POLICY IF EXISTS "All authenticated users can delete documents" ON public.documents;
DROP POLICY IF EXISTS "Users can view own documents"                 ON public.documents;
DROP POLICY IF EXISTS "Users can create own documents"               ON public.documents;
DROP POLICY IF EXISTS "Users can update own documents"               ON public.documents;
DROP POLICY IF EXISTS "Users can delete own documents"               ON public.documents;

DROP POLICY IF EXISTS "Authenticated users can view events"       ON public.events;
DROP POLICY IF EXISTS "Authenticated users can create events"     ON public.events;
DROP POLICY IF EXISTS "Authenticated users can update events"     ON public.events;
DROP POLICY IF EXISTS "Authenticated users can delete events"     ON public.events;
DROP POLICY IF EXISTS "All authenticated users can view events"   ON public.events;
DROP POLICY IF EXISTS "All authenticated users can update events" ON public.events;
DROP POLICY IF EXISTS "All authenticated users can delete events" ON public.events;
DROP POLICY IF EXISTS "Users can view own events"                 ON public.events;
DROP POLICY IF EXISTS "Users can create own events"               ON public.events;
DROP POLICY IF EXISTS "Users can update own events"               ON public.events;
DROP POLICY IF EXISTS "Users can delete own events"               ON public.events;

DROP POLICY IF EXISTS "Role-based document access" ON public.documents;
CREATE POLICY "Role-based document access" ON public.documents FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL AND (created_by = auth.uid() OR public.is_admin()));

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

-- Shared access table for event folders.
CREATE TABLE IF NOT EXISTS public.event_access (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  permission text NOT NULL CHECK (permission IN ('read', 'edit', 'manage')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_access_user_id ON public.event_access(user_id);
CREATE INDEX IF NOT EXISTS idx_event_access_event_id ON public.event_access(event_id);

ALTER TABLE public.event_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Event access select" ON public.event_access;
CREATE POLICY "Event access select" ON public.event_access FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_access.event_id
        AND e.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Event access insert" ON public.event_access;
CREATE POLICY "Event access insert" ON public.event_access FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_access.event_id
        AND e.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.event_access ea
      WHERE ea.event_id = event_access.event_id
        AND ea.user_id = auth.uid()
        AND ea.permission = 'manage'
    )
  );

DROP POLICY IF EXISTS "Event access update" ON public.event_access;
CREATE POLICY "Event access update" ON public.event_access FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_access.event_id
        AND e.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.event_access ea
      WHERE ea.event_id = event_access.event_id
        AND ea.user_id = auth.uid()
        AND ea.permission = 'manage'
    )
  );

DROP POLICY IF EXISTS "Event access delete" ON public.event_access;
CREATE POLICY "Event access delete" ON public.event_access FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_access.event_id
        AND e.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.event_access ea
      WHERE ea.event_id = event_access.event_id
        AND ea.user_id = auth.uid()
        AND ea.permission = 'manage'
    )
  );

-- Verification query (run manually after migration):
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename IN ('documents', 'events', 'event_access')
-- ORDER BY tablename, cmd, policyname;
