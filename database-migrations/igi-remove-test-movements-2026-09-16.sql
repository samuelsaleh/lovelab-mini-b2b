-- ═══════════════════════════════════════════════════════════════════════
--  LoveLab × IGI — remove Sam's test movements (16 September 2026)
-- ═══════════════════════════════════════════════════════════════════════
--
--  The module was switched on against live data on 28 August, and the first
--  thing anyone does with a new tool is push a request through it to see what
--  happens. Sam did, three times, and made a model called "Sam test":
--
--    V-024  2026-08-28  closed   LGAJ6529 5, LGAJ6530 5, LGAJ6531 10      (20)
--    V-025  2026-09-10  issued   LGAJ6529 5, LGAJ6530 10, LGAJ6531 20, LGAJ6532 30  (65)
--    V-026  2026-09-11  issued   LGAJ6529 1                                (1)
--
--  None of these is in IGI's own file. They are removed before IGI's figures
--  for September go in, because IGI's days take numbers 24 to 29.
--
--  Nothing here can reach the imported history: every statement is locked to
--  Sam's id and to these three numbers, and imported movements carry no
--  created_by at all. Lines go with their movement (ON DELETE CASCADE); no
--  stock figure is stored, so the 86 certificates come back to IGI's pool by
--  arithmetic. Run once. Written by hand, on purpose: this is not a seed delta.

BEGIN;

DELETE FROM public.igi_visits
 WHERE created_by = '258b7e0d-a753-4112-9689-2aa699c246dc'   -- Sam Saleh
   AND visit_no IN (24, 25, 26)
   AND visit_date IN ('2026-08-28', '2026-09-10', '2026-09-11');

DELETE FROM public.igi_models
 WHERE id = '98d047e1-5d64-4925-88e7-5b3e6af538d3'
   AND name = 'Sam test'
   AND state = 'awaiting_serial'
   AND serial IS NULL;

DO $$
DECLARE leftover int; test_model int;
BEGIN
  SELECT count(*) INTO leftover FROM public.igi_visits WHERE created_by IS NOT NULL;
  SELECT count(*) INTO test_model FROM public.igi_models WHERE name = 'Sam test';
  IF leftover <> 0 THEN RAISE EXCEPTION '% movement(s) recorded by the app still present — expected none before the September update', leftover; END IF;
  IF test_model <> 0 THEN RAISE EXCEPTION '"Sam test" is still there'; END IF;
  RAISE NOTICE 'Test movements removed; only the 23 imported movements remain.';
END $$;

COMMIT;
