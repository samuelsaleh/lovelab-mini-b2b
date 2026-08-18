-- Commercial assistants (Aug 2026).
-- A commercial assistant is an internal helper invited by an admin with
-- access to a hand-picked set of fairs (via the existing event_access table).
-- They are NOT agents: no commission, no organization, no agent folder.
--
-- Fair access reuses public.event_access (supabase-phase14-event-sharing.sql),
-- so the only schema change is the profile flag.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_assistant boolean DEFAULT false;

COMMENT ON COLUMN public.profiles.is_assistant IS
  'Commercial assistant: invited by an admin, sees only the fairs granted in event_access. Not an agent (no commission).';
