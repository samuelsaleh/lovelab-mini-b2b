-- Agent language: no CHECK constraint (Sam, 22 Sep 2026).
--
-- Adding a language must be a code change (lib/agents/language.js), not a
-- migration. The application validates the code on every write; the column
-- stays plain text.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_agent_language_check;

COMMENT ON COLUMN public.profiles.agent_language IS
  'Language LoveLab writes to this agent in; codes listed in lib/agents/language.js. NULL = derive from agent_country, else English.';
