-- PDF translation jobs (Rafi, 19 Oct 2026).
--
-- An admin asks for a document in another language from the Resources card.
-- The translation runs in the background and the finished PDF is too big to
-- send back in one response (the catalogue is ~9 MB, Vercel allows 4.5 MB), so
-- it is stored here and the browser fetches it with a short-lived signed link.
--
--   queued ──▶ running ──▶ done
--                     └──▶ failed
--
-- Only the server touches these (service role): RLS is on with no policies.

CREATE TABLE IF NOT EXISTS public.translation_jobs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_path  text        NOT NULL,
  language     text        NOT NULL,
  status       text        NOT NULL DEFAULT 'queued'
                           CHECK (status IN ('queued', 'running', 'done', 'failed')),
  result_path  text,
  flags        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  pages        integer,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS translation_jobs_created_by_idx
  ON public.translation_jobs (created_by, created_at DESC);

ALTER TABLE public.translation_jobs ENABLE ROW LEVEL SECURITY;

-- Private bucket for the translated PDFs (signed links only).
INSERT INTO storage.buckets (id, name, public)
VALUES ('translated-documents', 'translated-documents', false)
ON CONFLICT (id) DO NOTHING;
