-- What IGI actually billed.
--
-- At month end IGI count what they processed and multiply by €1,20. LoveLab
-- receive an invoice — one real reference is ATW/26/SC/02896 — and until now
-- had no way to check it, because the detail behind it lived in IGI's file and
-- the movements lived in LoveLab's.
--
-- Only IGI's side is stored here. LoveLab's own figure is derived from the
-- movements every time it is shown, so it cannot drift away from them. That is
-- the whole reason the two columns are worth putting side by side: one is the
-- movements, the other is what arrived in the post.

CREATE TABLE IF NOT EXISTS public.igi_invoices (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Always the first of the month. One invoice per period.
  period_month  date        NOT NULL UNIQUE,
  igi_reference text,
  igi_total_eur numeric(12,2) CHECK (igi_total_eur IS NULL OR igi_total_eur >= 0),
  -- Which quantity IGI billed on. Michael said "tout ce que j'ai reçu" —
  -- everything he received — but that has not been settled, and the three
  -- quantities differ:
  --   requested — what LoveLab carried over, so what IGI received
  --   issued    — what IGI actually made
  --   received  — what came back to LoveLab
  -- Kept per month rather than as one setting, so agreeing the answer later
  -- does not silently reinterpret a month that was already checked.
  basis         text        NOT NULL DEFAULT 'received'
                            CHECK (basis IN ('received', 'issued', 'requested')),
  note          text,
  recorded_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_igi_invoices_period
  ON public.igi_invoices (period_month DESC);

-- LoveLab only. What they were billed, and whether they agree with it, is not
-- IGI's to read — so there is deliberately no policy for them here at all.
ALTER TABLE public.igi_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on igi_invoices" ON public.igi_invoices;
CREATE POLICY "Admin full access on igi_invoices" ON public.igi_invoices
  USING (public.is_admin()) WITH CHECK (public.is_admin());
