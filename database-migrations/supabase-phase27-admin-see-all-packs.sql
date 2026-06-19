-- Phase 27: Admins can see ALL packs (including private ones)
-- ────────────────────────────────────────────────────────────────────────────
-- Reverses the Phase 20/26 "locked rule" that hid other users' PRIVATE packs
-- from admins. Sam's 2026-06 decision: the admins (Sam + his father) need to
-- see, apply and review every agent's pack — including private ones — and each
-- other's private packs (e.g. the "AR BLD PE26" pack Sam built that only he
-- could see).
--
-- New visibility rules (enforced by the RLS SELECT policy below):
--   - scope = 'global'     → readable by everyone (unchanged).
--   - scope = 'private'    → readable by the owner AND by any admin (CHANGED).
--   - scope = 'restricted' → readable by the assigned agents AND any admin
--                            (unchanged).
--
-- Writing is UNCHANGED (see Phase 26): agents still own only their own private
-- packs; admins can still only create/update/delete global + restricted packs.
-- So an admin can SEE and APPLY another user's private pack, but cannot edit or
-- delete it — only the owner can. The app UI mirrors this (no edit/delete
-- controls on packs the caller doesn't own).
--
-- Idempotent / safe to re-run. Requires supabase-phase20-custom-packs.sql and
-- supabase-phase26-pack-visibility.sql.

DROP POLICY IF EXISTS packs_select ON public.packs;
CREATE POLICY packs_select ON public.packs
  FOR SELECT
  USING (
    scope = 'global'
    OR created_by = auth.uid()
    -- Admins now see every pack, private ones included.
    OR public.is_admin()
    OR (
      scope = 'restricted'
      AND EXISTS (
        SELECT 1 FROM public.pack_visibility pv
        WHERE pv.pack_id = packs.id
          AND pv.agent_id = auth.uid()
      )
    )
  );
