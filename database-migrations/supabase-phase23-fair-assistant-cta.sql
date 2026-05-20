-- Adds an editable CTA line + free-form override slots to fair_batches.
-- Run in Supabase SQL editor. Idempotent: safe to re-run.

ALTER TABLE public.fair_batches
  ADD COLUMN IF NOT EXISTS cta_line text;

-- Default value: same wording the app currently hardcodes in preview/route.js
UPDATE public.fair_batches
SET cta_line = 'In the meantime, feel free to explore our collections at lovelab.be or contact us anytime.'
WHERE cta_line IS NULL;
