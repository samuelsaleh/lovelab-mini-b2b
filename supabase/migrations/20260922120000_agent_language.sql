-- Agent language (Sam, 22 Sep 2026).
--
-- Price list announcements go to every agent in their own language. No agent
-- had a language until now: the portal language lives in the browser and the
-- client-email language is picked per send. This column is the stored choice;
-- NULL means "derive from agent_country, else English" (lib/agents/language.js).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agent_language text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_agent_language_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_agent_language_check
      CHECK (agent_language IS NULL OR agent_language IN ('en', 'fr', 'de', 'it', 'nl', 'pl', 'el'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.agent_language IS
  'Language LoveLab writes to this agent in (en/fr/de/it/nl/pl/el). NULL = derive from agent_country, else English.';
