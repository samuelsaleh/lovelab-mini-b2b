-- Lets Alberto pick from the B2B downloadable PDFs (catalogues, packs, price
-- lists, EAN sheets) and attach them to every outgoing fair follow-up email.
-- Stored as an array of file paths relative to /public — same shape used by
-- ResourcesCard on the home page.
-- Idempotent: safe to re-run.

ALTER TABLE public.fair_batches
  ADD COLUMN IF NOT EXISTS attached_files jsonb NOT NULL DEFAULT '[]'::jsonb;
