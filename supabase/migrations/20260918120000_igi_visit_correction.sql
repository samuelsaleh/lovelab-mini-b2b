-- A movement can be a correction, and says so (Sam, 18 Sept 2026: "what is
-- V-030?").
--
-- V-030 is not a walk across the road. On 16 Sept Michael told Sam that IGI
-- hold none of Cuty-Cubix 0.30 and none of Multi Three 0.60, while IGI's own
-- file still said 82 and 28 — because 3 245 certificates had been issued in
-- June and July with no model written down, and those 110 were among them.
-- The fix attributed 110 of the 3 245 through a movement dated 28 July, so
-- every monthly total stayed as it was. Correct, traceable, and unlabelled:
-- on the History screen it read like any other movement, with the newest
-- number and a July date.
--
-- From now on a movement carries a flag, and the screens show a
-- "Correction" chip on both sides of the road.

ALTER TABLE public.igi_visits
  ADD COLUMN IF NOT EXISTS correction boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.igi_visits.correction IS
  'True for a movement that corrects the record rather than moving certificates: an attribution of the June–July gap, or the like. Shown as a chip on every history screen.';

-- The one correction made so far. Matched on what it is, not just its
-- number, so a database where V-030 is a real movement is left alone.
UPDATE public.igi_visits v
SET correction = true,
    note = coalesce(note, 'Correction, 16 Sept 2026: 110 of the 3 245 certificates issued in June–July with no model attributed to Cuty-Cubix 0.30 (82) and Multi Three 0.60 (28), on Michael''s word that IGI hold none. Every monthly total is unchanged.')
WHERE v.visit_no = 30
  AND v.visit_date = '2026-07-28'
  AND v.created_by IS NULL
  AND (SELECT coalesce(sum(qty_issued), 0) FROM public.igi_visit_lines l WHERE l.visit_id = v.id) = 110;
