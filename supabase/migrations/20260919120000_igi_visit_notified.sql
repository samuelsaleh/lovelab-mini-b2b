-- IGI are emailed when LoveLab ask for certificates (Sam, 18 Sept 2026:
-- "michael@igi.org receives an email when we send an order, and I receive an
-- error if the email failed").
--
-- Until now a request only appeared on IGI's To do; nobody was told. From now
-- on the request goes out as an email the moment it is made, and the movement
-- remembers whether that worked. A failed send is not a failed request — the
-- movement is saved either way — but it is shown on the movement page with a
-- "Send the email again" button, and LoveLab's admins get a notice.

ALTER TABLE public.igi_visits
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

ALTER TABLE public.igi_visits
  ADD COLUMN IF NOT EXISTS notify_error text;

COMMENT ON COLUMN public.igi_visits.notified_at IS
  'When IGI were emailed about this request. Null until the email went out.';

COMMENT ON COLUMN public.igi_visits.notify_error IS
  'Why the last attempt to email IGI about this request failed. Null once one succeeds.';
