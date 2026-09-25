-- The scheduled certificate emails remember that they went out (24 Sept 2026).
--
-- Sam settled three mails on a clock: Liuba's "go collect" every morning at
-- 07:00, IGI's "what LoveLab need from you" every Friday at 14:00, and
-- Alberto's "order at IGI" every second Friday. The server's crontab calls
-- one route every hour and the route reads the Antwerp clock; this table is
-- what keeps a double tick, a redeploy in the same hour, or a manual re-run
-- from sending the same mail twice. One row per mail per day: the runner
-- inserts first, and a duplicate key means "already sent today".

CREATE TABLE IF NOT EXISTS public.igi_digest_sends (
  kind        text        NOT NULL CHECK (kind IN ('morning', 'igi_weekly', 'order')),
  sent_on     date        NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  recipients  text[]      NOT NULL DEFAULT '{}',
  subject     text,
  PRIMARY KEY (kind, sent_on)
);

COMMENT ON TABLE public.igi_digest_sends IS
  'One row per scheduled certificate email per day (morning to LoveLab, Friday to IGI, every second Friday the order list). Inserted before sending; the primary key is what stops a second send the same day.';

ALTER TABLE public.igi_digest_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on igi_digest_sends" ON public.igi_digest_sends;
CREATE POLICY "Admin full access on igi_digest_sends" ON public.igi_digest_sends
  USING (public.is_admin()) WITH CHECK (public.is_admin());
