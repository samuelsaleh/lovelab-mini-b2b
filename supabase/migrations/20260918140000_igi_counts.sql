-- IGI can correct their own stock count (Sam, 18 Sept 2026).
--
-- IGI's stock in the app is arithmetic: every batch they recorded as
-- produced, minus every certificate they issued. Nothing on their side is
-- connected to it, so when the arithmetic drifts from the shelf — the 3 245
-- certificates issued in June–July with no model are the proof — nobody at
-- IGI could put it right. It took a phone call to Sam and a hand-made
-- movement (V-030).
--
-- A count is IGI saying "we actually hold this many". It is kept as a row
-- of its own — what the app said, what they counted, the difference, who,
-- when — never an overwrite. From now on:
--
--   stock = batches made − certificates issued + Σ delta of counts
--
-- Nothing is deleted or edited; a wrong count is corrected by another.

CREATE TABLE IF NOT EXISTS public.igi_counts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id    uuid        NOT NULL REFERENCES public.igi_models(id) ON DELETE CASCADE,
  was         integer     NOT NULL CHECK (was >= 0),      -- what the app said
  counted     integer     NOT NULL CHECK (counted >= 0),  -- what IGI say they hold
  delta       integer     NOT NULL,                       -- counted − was, never 0
  note        text,
  counted_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT igi_counts_delta_nonzero CHECK (delta <> 0),
  CONSTRAINT igi_counts_delta_matches CHECK (delta = counted - was)
);

CREATE INDEX IF NOT EXISTS idx_igi_counts_model ON public.igi_counts (model_id);

COMMENT ON TABLE public.igi_counts IS
  'IGI correcting their own stock count: what the app said, what they hold, the difference. Stock = batches - issued + sum(delta). Never edited or deleted; a wrong count is corrected by another.';

ALTER TABLE public.igi_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on igi_counts" ON public.igi_counts;
CREATE POLICY "Admin full access on igi_counts" ON public.igi_counts
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- IGI read their own counts and add new ones. No update, no delete — same
-- rule as their production batches.
DROP POLICY IF EXISTS "IGI can read igi_counts" ON public.igi_counts;
CREATE POLICY "IGI can read igi_counts" ON public.igi_counts
  FOR SELECT TO authenticated USING (public.is_igi());

DROP POLICY IF EXISTS "IGI can add igi_counts" ON public.igi_counts;
CREATE POLICY "IGI can add igi_counts" ON public.igi_counts
  FOR INSERT TO authenticated WITH CHECK (public.is_igi());
