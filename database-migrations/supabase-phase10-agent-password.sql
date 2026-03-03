-- Phase 10: Track whether an agent has set their own password
-- Run this migration in the Supabase SQL editor.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_password_set boolean DEFAULT false;

-- Agents who already signed in via email+password are considered to have a password set.
-- New invited agents will have has_password_set = false until they complete the set-password flow.
