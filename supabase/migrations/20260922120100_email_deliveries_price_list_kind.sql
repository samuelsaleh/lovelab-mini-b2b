-- Price list announcements are tracked like every other outbound email
-- (Sam, 22 Sep 2026). A new `kind` so the delivery history can be filtered
-- per announcement and bounce alerts say what the email was.

ALTER TABLE public.email_deliveries
  DROP CONSTRAINT IF EXISTS email_deliveries_kind_check;

ALTER TABLE public.email_deliveries
  ADD CONSTRAINT email_deliveries_kind_check
  CHECK (kind IN ('order_confirmation', 'fair_outreach', 'internal_notice', 'price_list_announcement', 'other'));
