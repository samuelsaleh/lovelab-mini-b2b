-- Phase 13: Bug fixes
-- Run this migration in the Supabase SQL editor.

-- Ensure has_password_set column exists (from Phase 10, included here for safety).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_password_set boolean DEFAULT false;

-- #2: Create function to revoke all sessions for a user by ID.
-- The Supabase admin JS client's signOut() requires a JWT, not a UUID.
-- This function deletes refresh-token sessions directly from auth.sessions.
-- Note: existing access tokens (JWTs) remain valid until they expire — this is
-- a Supabase/JWT limitation. But the refresh tokens are invalidated immediately
-- so the user cannot obtain new access tokens.
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(uid uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  DELETE FROM auth.sessions WHERE user_id = uid;
$$;

-- Only the service_role should be able to call this.
REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;

-- #3: Fix existing agents being forced to re-set passwords.
-- Set has_password_set = true for agents who already have auth credentials.
UPDATE profiles
SET has_password_set = true
WHERE is_agent = true
  AND has_password_set = false
  AND id IN (
    SELECT id FROM auth.users
    WHERE encrypted_password IS NOT NULL
      AND encrypted_password != ''
  );
