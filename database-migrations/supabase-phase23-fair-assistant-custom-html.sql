-- Lets Alberto bypass the templated headline/paragraphs and paste Claude-
-- generated HTML directly. When non-empty, the rendered email shows the
-- custom HTML between the gold subtitle and the action buttons; the brand
-- shell (logo, subtitle, buttons, product grid, contact card, footer) stays
-- intact so the result is still on-brand.
-- Idempotent: safe to re-run.

ALTER TABLE public.fair_batches
  ADD COLUMN IF NOT EXISTS custom_html text;
