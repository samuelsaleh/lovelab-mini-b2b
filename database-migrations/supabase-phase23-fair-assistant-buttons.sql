-- Per-batch button labels + URLs for the two CTA pills in the rendered email
-- ("Visit Our Website" / "B2B Login" by default). Lets each fair tweak the
-- buttons — e.g. swap B2B Login for a Calendly link on partnership-heavy
-- fairs, or send shop leads to a specific collection page.
-- Idempotent: safe to re-run.

ALTER TABLE public.fair_batches
  ADD COLUMN IF NOT EXISTS button1_label text,
  ADD COLUMN IF NOT EXISTS button1_url   text,
  ADD COLUMN IF NOT EXISTS button2_label text,
  ADD COLUMN IF NOT EXISTS button2_url   text;

-- Backfill defaults so existing batches keep the current behaviour.
UPDATE public.fair_batches
SET button1_label = COALESCE(button1_label, 'Visit Our Website'),
    button1_url   = COALESCE(button1_url,   'https://lovelab.be/'),
    button2_label = COALESCE(button2_label, 'B2B Login'),
    button2_url   = COALESCE(button2_url,   'https://lovelab.be/b2b-signup');
