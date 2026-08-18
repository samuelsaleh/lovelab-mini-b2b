-- Codify the legacy production event_access.user_email column.
--
-- Production has always required this denormalized email, while the checked-in
-- Phase 14 migration only documented user_id. Application writes now populate
-- both: user_id remains authoritative and user_email keeps compatibility.

ALTER TABLE public.event_access
  ADD COLUMN IF NOT EXISTS user_email text;

UPDATE public.event_access ea
SET user_email = lower(trim(p.email))
FROM public.profiles p
WHERE p.id = ea.user_id
  AND ea.user_email IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.event_access
    WHERE user_email IS NULL
  ) THEN
    ALTER TABLE public.event_access
      ALTER COLUMN user_email SET NOT NULL;
  END IF;
END
$$;

COMMENT ON COLUMN public.event_access.user_email IS
  'Legacy denormalized invitee email; user_id remains the authoritative identity.';
