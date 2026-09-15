-- Email opens and clicks (Sam, 15 Sep 2026).
--
-- Resend already tells us when a recipient opens or clicks a fair follow-up.
-- Until now those events were flattened into "delivered", so the Fair
-- Assistant could not say who opened. These columns keep the first open and
-- click, and how many times, per email; the fair draft mirrors them so the
-- batch follow-up screen shows them without a join.

ALTER TABLE public.email_deliveries
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF to_regclass('public.fair_email_drafts') IS NOT NULL THEN
    ALTER TABLE public.fair_email_drafts
      ADD COLUMN IF NOT EXISTS opened_at timestamptz,
      ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
  END IF;
END $$;

COMMENT ON COLUMN public.email_deliveries.opened_at IS 'First time Resend reported the email opened (webhook or GET /emails/:id).';
COMMENT ON COLUMN public.email_deliveries.clicked_at IS 'First time Resend reported a link clicked.';
