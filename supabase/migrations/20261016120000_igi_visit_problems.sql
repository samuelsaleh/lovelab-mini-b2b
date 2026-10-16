-- IGI can report a problem with a request (Sam and Mika, 16 Oct 2026).
--
-- V-041 asked for 96 × LGAJ6538. Sixty of those bracelets were the 4-stone
-- model; the other thirty-six were 8-stone Riviera and needed LGAJ6575, which
-- was not on the request. IGI saw it at the bench and had nowhere to say so but
-- WhatsApp: they can only type what they made against the lines LoveLab asked
-- for, and adding a line themselves would mean IGI deciding what LoveLab buys
-- (and bills at €1,20 a card).
--
-- So IGI flag it instead. The request goes on hold with what IGI think is
-- wrong — a note, and the quantities they believe it should carry — and
-- LoveLab decide: accept IGI's correction, edit it themselves, or keep it as it
-- was. Only then does it come back to IGI's To do. LoveLab stay the only ones
-- who change what was asked for; IGI's proposal is kept beside it.
--
--   requested ──IGI report──▶ on_hold ──LoveLab answer──▶ requested ──▶ issued ──▶ closed

-- ─── 1. A fourth status ─────────────────────────────────────────────────────

ALTER TABLE public.igi_visits DROP CONSTRAINT IF EXISTS igi_visits_status_check;
ALTER TABLE public.igi_visits ADD CONSTRAINT igi_visits_status_check
  CHECK (status IN ('requested', 'on_hold', 'issued', 'closed'));

-- ─── 2. What IGI reported, and what LoveLab answered ────────────────────────

CREATE TABLE IF NOT EXISTS public.igi_visit_problems (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id     uuid        NOT NULL REFERENCES public.igi_visits(id) ON DELETE CASCADE,
  note         text        NOT NULL CHECK (length(note) BETWEEN 1 AND 1000),
  -- What IGI think the request should carry, model by model:
  -- [{ "model_id": "…", "qty": 60 }]. A model already on the request at a new
  -- quantity, a model to add, or 0 to take one off. Lines not named stay.
  proposal     jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(proposal) = 'array'),
  reported_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reported_at  timestamptz NOT NULL DEFAULT now(),
  -- LoveLab's answer. Null while the request is on hold.
  resolution   text        CHECK (resolution IN ('accepted', 'edited', 'kept')),
  reply        text        CHECK (reply IS NULL OR length(reply) <= 1000),
  resolved_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at  timestamptz,
  CONSTRAINT igi_visit_problems_resolved_together
    CHECK ((resolution IS NULL) = (resolved_at IS NULL))
);

-- One open problem per request at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_igi_visit_problems_open
  ON public.igi_visit_problems (visit_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_igi_visit_problems_visit
  ON public.igi_visit_problems (visit_id);

COMMENT ON TABLE public.igi_visit_problems IS
  'IGI reporting that a request looks wrong, with the quantities they propose, and LoveLab''s answer (accepted / edited / kept). The request is on hold while one is open.';

ALTER TABLE public.igi_visit_problems ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on igi_visit_problems" ON public.igi_visit_problems;
CREATE POLICY "Admin full access on igi_visit_problems" ON public.igi_visit_problems
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- IGI read every problem (theirs, and LoveLab's answers) and add new ones in
-- their own name. They never edit or delete one; answering is LoveLab's.
DROP POLICY IF EXISTS "IGI can read igi_visit_problems" ON public.igi_visit_problems;
CREATE POLICY "IGI can read igi_visit_problems" ON public.igi_visit_problems
  FOR SELECT TO authenticated USING (public.is_igi());

DROP POLICY IF EXISTS "IGI can report a problem" ON public.igi_visit_problems;
CREATE POLICY "IGI can report a problem" ON public.igi_visit_problems
  FOR INSERT TO authenticated
  WITH CHECK (public.is_igi() AND reported_by = auth.uid() AND resolved_at IS NULL);

-- ─── 3. The one new transition IGI may perform ──────────────────────────────
-- Beside "requested → issued" (recording what they made), IGI may now put a
-- request waiting on them on hold. Taking it off hold is LoveLab's.

DROP POLICY IF EXISTS "IGI can put a request on hold" ON public.igi_visits;
CREATE POLICY "IGI can put a request on hold" ON public.igi_visits
  FOR UPDATE TO authenticated
  USING (public.is_igi() AND status = 'requested')
  WITH CHECK (public.is_igi() AND status = 'on_hold');

-- ─── 4. Reporting is one step ───────────────────────────────────────────────
-- Putting the request on hold and recording why happen together or not at
-- all, so a request is never on hold without a reason, nor a reason left
-- beside a request still on IGI's To do. SECURITY INVOKER: every policy above
-- still applies to whoever calls it.

CREATE OR REPLACE FUNCTION public.igi_report_problem(
  p_visit_id uuid, p_user uuid, p_note text, p_proposal jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id   uuid;
  v_rows integer;
BEGIN
  UPDATE public.igi_visits SET status = 'on_hold'
   WHERE id = p_visit_id AND status = 'requested';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'igi_visit_not_waiting' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.igi_visit_problems (visit_id, note, proposal, reported_by)
  VALUES (p_visit_id, p_note, coalesce(p_proposal, '[]'::jsonb), p_user)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.igi_report_problem(uuid, uuid, text, jsonb) TO authenticated;
