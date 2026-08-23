-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 34: Pack fair folders + per-user pack hiding
-- Date: 2026-08-23
-- Purpose:
--   1. pack_fairs — a shared, many-to-many link between packs and trade fairs
--      (events with type = 'fair'). A pack can live in several fairs at once.
--      The Builder pack strip becomes a folder browser: pick a fair, see only
--      the packs filed under it. Any signed-in user can file/unfile a pack —
--      the assignment is shared, everyone sees the same folder contents.
--   2. pack_hidden — a PER-USER hide list. Hiding a pack only removes it from
--      that person's own strip; nobody else is affected and it is reversible.
--      This is what finally gets the Synalia packs out of the admins' way
--      without taking them away from the agents they belong to (Phase 26/27).
--   3. pack_pinned — a PER-USER pin list, the mirror image of pack_hidden.
--      A pinned pack is shown first and stays visible inside every folder, so
--      the everyday packs (Pack 1 and friends) are always one click away
--      instead of being buried in whichever fair they happen to be filed in.
--   4. Seed two new fairs: "Les Journées d'Achats Paris" and "Ambiente
--      Frankfurt".
--   5. Seed pack_hidden rows so every admin starts with the two Synalia packs
--      hidden. Any admin can unhide from the UI.
--
-- Idempotent / safe to re-run. Requires supabase-phase20-custom-packs.sql,
-- supabase-phase26-pack-visibility.sql and supabase-setup.sql (events).
-- ─────────────────────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- 1. pack_fairs join table
-- ────────────────────────────────────────────────────────────
-- sort_order lets a fair folder carry its own pack order later without
-- disturbing the global packs.sort_order strip. Default 0 = "unordered",
-- which falls back to the global order in the API.

CREATE TABLE IF NOT EXISTS public.pack_fairs (
  pack_id    uuid NOT NULL REFERENCES public.packs(id)  ON DELETE CASCADE,
  event_id   uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  added_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pack_id, event_id)
);

-- Listing "every pack in this fair" is the hot path for the folder chips.
CREATE INDEX IF NOT EXISTS pack_fairs_event_idx ON public.pack_fairs(event_id);

-- ────────────────────────────────────────────────────────────
-- 2. pack_hidden — personal hide list
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pack_hidden (
  pack_id    uuid NOT NULL REFERENCES public.packs(id)    ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pack_id, user_id)
);

CREATE INDEX IF NOT EXISTS pack_hidden_user_idx ON public.pack_hidden(user_id);

-- ────────────────────────────────────────────────────────────
-- 2b. pack_pinned — personal pin list
-- ────────────────────────────────────────────────────────────
-- Same shape and same privacy rules as pack_hidden, and deliberately a separate
-- table rather than a column on packs: pinning is per-user, and packs rows are
-- shared. Nothing stops a pack being pinned by one person and hidden by
-- another — the two lists are independent, and hiding wins in the UI.

CREATE TABLE IF NOT EXISTS public.pack_pinned (
  pack_id    uuid NOT NULL REFERENCES public.packs(id)    ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pack_id, user_id)
);

CREATE INDEX IF NOT EXISTS pack_pinned_user_idx ON public.pack_pinned(user_id);

-- ────────────────────────────────────────────────────────────
-- 3. RLS on pack_fairs — shared setup, anyone signed in may edit
-- ────────────────────────────────────────────────────────────
-- Deliberately open to every authenticated user (Sam, Aug 2026): filing a pack
-- into a fair is an organising action, not a permission grant. It never changes
-- who can SEE a pack — packs.scope + pack_visibility still decide that. The
-- worst case is a mis-filed pack, which anyone can drag back out.
--
-- UPDATE is allowed too so per-folder sort_order can be rewritten in place.

ALTER TABLE public.pack_fairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pack_fairs_select ON public.pack_fairs;
CREATE POLICY pack_fairs_select ON public.pack_fairs
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS pack_fairs_insert ON public.pack_fairs;
CREATE POLICY pack_fairs_insert ON public.pack_fairs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS pack_fairs_update ON public.pack_fairs;
CREATE POLICY pack_fairs_update ON public.pack_fairs
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS pack_fairs_delete ON public.pack_fairs;
CREATE POLICY pack_fairs_delete ON public.pack_fairs
  FOR DELETE
  TO authenticated
  USING (true);

-- ────────────────────────────────────────────────────────────
-- 4. RLS on pack_hidden — strictly private to each user
-- ────────────────────────────────────────────────────────────
-- Every operation is gated on user_id = auth.uid(). Nobody — not even an
-- admin — can read or change somebody else's hidden list.

ALTER TABLE public.pack_hidden ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pack_hidden_select ON public.pack_hidden;
CREATE POLICY pack_hidden_select ON public.pack_hidden
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS pack_hidden_insert ON public.pack_hidden;
CREATE POLICY pack_hidden_insert ON public.pack_hidden
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS pack_hidden_delete ON public.pack_hidden;
CREATE POLICY pack_hidden_delete ON public.pack_hidden
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- 4b. RLS on pack_pinned — strictly private to each user
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.pack_pinned ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pack_pinned_select ON public.pack_pinned;
CREATE POLICY pack_pinned_select ON public.pack_pinned
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS pack_pinned_insert ON public.pack_pinned;
CREATE POLICY pack_pinned_insert ON public.pack_pinned
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS pack_pinned_delete ON public.pack_pinned;
CREATE POLICY pack_pinned_delete ON public.pack_pinned
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- 5. Seed the two new fairs
-- ────────────────────────────────────────────────────────────
-- events has no unique index on (name) for type='fair' (only agent folders are
-- deduped, see supabase-phase17-event-dedup.sql), so guard with NOT EXISTS to
-- stay idempotent. created_by is set to an admin profile so the fair shows up
-- for admins in /api/events; agents reach the pack folders through
-- /api/pack-fairs, which is not scoped by event_access.

DO $$
DECLARE
  admin_id uuid;
  fair_names text[] := ARRAY['Les Journées d''Achats Paris', 'Ambiente Frankfurt'];
  fair_name text;
  created_count int := 0;
BEGIN
  SELECT id INTO admin_id
  FROM public.profiles
  WHERE role = 'admin'
  ORDER BY created_at ASC NULLS LAST, id ASC
  LIMIT 1;

  FOREACH fair_name IN ARRAY fair_names LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.events
      WHERE type = 'fair' AND lower(trim(name)) = lower(trim(fair_name))
    ) THEN
      INSERT INTO public.events (name, type, created_by)
      VALUES (fair_name, 'fair', admin_id);
      created_count := created_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Phase 34: % new fair(s) created.', created_count;
END $$;

-- ────────────────────────────────────────────────────────────
-- 6. Hide the Synalia packs for every admin
-- ────────────────────────────────────────────────────────────
-- Point 7a of the change list: "masquer les packs Synalia" — they stay
-- restricted-visible to their assigned agents (Phase 26) but disappear from
-- our own strip. Any admin can unhide with the eye toggle in the Builder.

DO $$
DECLARE
  target_labels text[] := ARRAY['PACK 5-SYN-ADD-RB', 'PACK 6-RB-SYN'];
  hidden_count int;
BEGIN
  INSERT INTO public.pack_hidden (pack_id, user_id)
  SELECT p.id, a.id
  FROM public.packs p
  CROSS JOIN public.profiles a
  WHERE p.label = ANY(target_labels)
    AND a.role = 'admin'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS hidden_count = ROW_COUNT;

  RAISE NOTICE 'Phase 34: % Synalia pack/admin hide row(s) created.', hidden_count;
END $$;
