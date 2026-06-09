-- Phase 26: Per-pack agent visibility ("restricted" packs)
-- ────────────────────────────────────────────────────────────────────────────
-- Extends the Phase 20 packs model with a third visibility scope so admins can
-- pick, per pack, which agents may see it.
--
-- Visibility rules (enforced by the RLS SELECT policy below):
--   - scope = 'global'     → readable by everyone (unchanged).
--   - scope = 'private'    → readable ONLY by the owner. Admins still CANNOT
--                            see other users' private packs (locked rule kept).
--   - scope = 'restricted' → readable by the assigned agents (rows in
--                            pack_visibility) AND by any admin.
--
-- Writing:
--   - Agents can still only create/update their own 'private' packs.
--   - Admins can create/update/delete 'global' and 'restricted' packs.
--
-- Idempotent / safe to re-run. Requires supabase-phase20-custom-packs.sql.

-- ────────────────────────────────────────────────────────────
-- 1. Allow the new scope value
-- ────────────────────────────────────────────────────────────
-- The Phase 20 CHECK is an inline column constraint; Postgres auto-names it
-- packs_scope_check. Drop whatever scope CHECK exists and re-add the wider one.

DO $$
DECLARE
  conname_var text;
BEGIN
  SELECT con.conname INTO conname_var
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'packs'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%scope%'
  LIMIT 1;

  IF conname_var IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.packs DROP CONSTRAINT %I', conname_var);
  END IF;
END $$;

-- Belt-and-suspenders: also drop by the conventional auto-name so re-running
-- this migration (or running it after a partial apply) never trips an
-- "already exists" error on the ADD below.
ALTER TABLE public.packs DROP CONSTRAINT IF EXISTS packs_scope_check;

ALTER TABLE public.packs
  ADD CONSTRAINT packs_scope_check
  CHECK (scope IN ('global', 'private', 'restricted'));

-- ────────────────────────────────────────────────────────────
-- 2. pack_visibility join table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pack_visibility (
  pack_id  uuid NOT NULL REFERENCES public.packs(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (pack_id, agent_id)
);

CREATE INDEX IF NOT EXISTS pack_visibility_agent_idx ON public.pack_visibility(agent_id);

-- ────────────────────────────────────────────────────────────
-- 3. RLS: packs SELECT policy (replace Phase 20 version)
-- ────────────────────────────────────────────────────────────
-- A row is visible if it is global, owned by the caller, OR (for admins) any
-- non-private pack, OR a restricted pack the caller is assigned to.

DROP POLICY IF EXISTS packs_select ON public.packs;
CREATE POLICY packs_select ON public.packs
  FOR SELECT
  USING (
    scope = 'global'
    OR created_by = auth.uid()
    OR (public.is_admin() AND scope <> 'private')
    OR (
      scope = 'restricted'
      AND EXISTS (
        SELECT 1 FROM public.pack_visibility pv
        WHERE pv.pack_id = packs.id
          AND pv.agent_id = auth.uid()
      )
    )
  );

-- ────────────────────────────────────────────────────────────
-- 4. RLS: packs INSERT / UPDATE / DELETE allow 'restricted' for admins
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS packs_insert ON public.packs;
CREATE POLICY packs_insert ON public.packs
  FOR INSERT
  WITH CHECK (
    (scope = 'private' AND created_by = auth.uid())
    OR (scope IN ('global', 'restricted') AND public.is_admin())
  );

DROP POLICY IF EXISTS packs_update ON public.packs;
CREATE POLICY packs_update ON public.packs
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR (scope IN ('global', 'restricted') AND public.is_admin())
  )
  WITH CHECK (
    created_by = auth.uid()
    OR (scope IN ('global', 'restricted') AND public.is_admin())
  );

DROP POLICY IF EXISTS packs_delete ON public.packs;
CREATE POLICY packs_delete ON public.packs
  FOR DELETE
  USING (
    is_seed = false
    AND (
      created_by = auth.uid()
      OR (scope IN ('global', 'restricted') AND public.is_admin())
    )
  );

-- ────────────────────────────────────────────────────────────
-- 5. RLS on pack_visibility
-- ────────────────────────────────────────────────────────────
-- Agents may read their own assignment rows (so they can be filtered in the
-- SELECT subquery); admins manage everything. Writes are admin-only.

ALTER TABLE public.pack_visibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pack_visibility_select ON public.pack_visibility;
CREATE POLICY pack_visibility_select ON public.pack_visibility
  FOR SELECT
  USING (
    agent_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS pack_visibility_insert ON public.pack_visibility;
CREATE POLICY pack_visibility_insert ON public.pack_visibility
  FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS pack_visibility_delete ON public.pack_visibility;
CREATE POLICY pack_visibility_delete ON public.pack_visibility
  FOR DELETE
  USING (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- 6. Initial data: restrict PACK 5-SYN-ADD-RB and PACK 6-RB-SYN to Emile + rsmus
-- ────────────────────────────────────────────────────────────
-- Matches agents by email OR full_name containing 'emile' / 'rsmus'
-- (case-insensitive). Idempotent: re-running just re-asserts the same rows.
-- If no agents match, the packs are still flipped to 'restricted' (admins keep
-- access) and you can assign agents later via the admin UI.

DO $$
DECLARE
  target_labels text[] := ARRAY['PACK 5-SYN-ADD-RB', 'PACK 6-RB-SYN'];
  pack_count int;
  agent_count int;
  assign_count int;
BEGIN
  UPDATE public.packs
  SET scope = 'restricted'
  WHERE label = ANY(target_labels);
  GET DIAGNOSTICS pack_count = ROW_COUNT;

  SELECT count(*) INTO agent_count
  FROM public.profiles
  WHERE (is_agent = true OR agent_status IN ('invited', 'active', 'inactive'))
    AND (
      lower(coalesce(email, '')) LIKE '%emile%'
      OR lower(coalesce(full_name, '')) LIKE '%emile%'
      OR lower(coalesce(email, '')) LIKE '%rsmus%'
      OR lower(coalesce(full_name, '')) LIKE '%rsmus%'
    );

  INSERT INTO public.pack_visibility (pack_id, agent_id)
  SELECT p.id, a.id
  FROM public.packs p
  CROSS JOIN public.profiles a
  WHERE p.label = ANY(target_labels)
    AND (a.is_agent = true OR a.agent_status IN ('invited', 'active', 'inactive'))
    AND (
      lower(coalesce(a.email, '')) LIKE '%emile%'
      OR lower(coalesce(a.full_name, '')) LIKE '%emile%'
      OR lower(coalesce(a.email, '')) LIKE '%rsmus%'
      OR lower(coalesce(a.full_name, '')) LIKE '%rsmus%'
    )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS assign_count = ROW_COUNT;

  RAISE NOTICE 'Phase 26: % pack(s) set to restricted, % matching agent(s), % new assignment row(s).',
    pack_count, agent_count, assign_count;
END $$;
