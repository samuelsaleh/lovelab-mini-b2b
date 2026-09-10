-- Who recorded each half of a movement.
--
-- Until IGI have logins, LoveLab records both sides themselves — which is what
-- happens physically anyway, since LoveLab carries the bracelets across the
-- road. Once IGI start entering their own production, a quantity LoveLab typed
-- on their behalf and one IGI typed themselves are different kinds of evidence,
-- and the history should be able to say which.

ALTER TABLE public.igi_visits
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.igi_visits
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.igi_visits.issued_by IS
  'Who recorded what IGI actually produced. May be LoveLab acting on IGI''s behalf.';

COMMENT ON COLUMN public.igi_visits.received_by IS
  'Who confirmed the certificates came back. Always LoveLab.';
