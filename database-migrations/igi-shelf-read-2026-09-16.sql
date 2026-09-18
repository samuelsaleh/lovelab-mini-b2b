-- ═══════════════════════════════════════════════════════════════════════
--  LoveLab × IGI — the shelf read of 16 Sept 2026, done by hand
-- ═══════════════════════════════════════════════════════════════════════
--
--  The nightly read (app/api/cron/igi-stock) has never run on the live
--  site: the certificate branch is not deployed. The last figure the app
--  had was 28 August. This file is exactly what that job does, for one
--  day, from the stock software's answer of 16 Sept 2026 (129 lines):
--    · a description never seen before is recorded, classified only by
--      whether it says IGI (certificate) or not (ignore), never linked by
--      guess;
--    · one snapshot row per description for the day;
--    · last_seen_at stamped.
--
--  Then seven IGI lines that appeared since 28 August are linked to the
--  model they plainly are — stones × carat and shape match one model each:
--    IGI FLOWER MQ 4*0.10             → LGAJ6569  Flower Marquise 4 × 0.40
--    IGI LINEA PRINCESS  3*0.10       → LGAJ6571  Linea Three 3 × 0.30 Princess
--    IGI LINEA PRINCESS 5*0.10        → LGAJ6572  Linea Five 5 × 0.50 Princess
--    IGI MARQUISE 0.50                → LGAJ6557  Shapy Shine Marquise 0.50
--    IGI ZAHA  MQ 0.30                → LGAJ6568  Zaha 0.30 Marquise
--    IGI ML MULTI 0.05*0.10*.0.05     → LGAJ6566  Multi Moonlight 3 × 0.20
--    IGI ML MULTI 0.10*0.20*0.10      → LGAJ6567  Multi Moonlight 3 × 0.40
--  Two lines are left alone because they do not say IGI and may be
--  in-house: "RIVIERA 8*0.05" and "RIVIERA 8*0.10". Sam decides.
--
--  Safe to run twice.

BEGIN;

CREATE TEMP TABLE shelf_read (description text, total_pcs integer, kind text) ON COMMIT DROP;
INSERT INTO shelf_read (description, total_pcs, kind) VALUES
('BUTTER PAPER- LL NOTES FRENCH', 1468, 'ignore'),
('BUTTER PAPER-LL NOTES ENGLISH', 4147, 'ignore'),
('BUTTER PAPER-LL NOTES ITALIAN', 497, 'ignore'),
('CATALOGUE FR NEW', 3990, 'ignore'),
('CATALOGUE GERM', 45, 'ignore'),
('CATALOGUES', 912, 'ignore'),
('CATALOGUES ENG', 226, 'ignore'),
('DHL BOXES NR 2', 40, 'ignore'),
('DHL BOXES NR 4', 27, 'ignore'),
('DHL BOXES NR 5', 44, 'ignore'),
('DHL ENVELOPPES', 200, 'ignore'),
('ENVELOP PINK IGI', 2715, 'certificate'),
('ENVELOPE BLACK IGI', 917, 'certificate'),
('ENVELOPPE BLACK', 622, 'ignore'),
('ENVELOPPE PINK', 75, 'ignore'),
('IGI 0.05 CERTIFICATE', 755, 'certificate'),
('IGI 0.05*3 CERTIFICATE', 457, 'certificate'),
('IGI 0.10 CERTIFICATE', 1180, 'certificate'),
('IGI 0.10*3 CERTIFICATE', 285, 'certificate'),
('IGI 0.20*3 CERTIFICATE', 77, 'certificate'),
('IGI 0.30*3 CERTIFICATE', 21, 'certificate'),
('IGI CUTY 0.20', 160, 'certificate'),
('IGI CUTY 0.30', 157, 'certificate'),
('IGI EMERALD 0.10', 84, 'certificate'),
('IGI EMERALD 0.50', 97, 'certificate'),
('IGI FLOWER MQ 4*0.10', 1, 'certificate'),
('IGI HEART 0.10', 145, 'certificate'),
('IGI LINEA PRINCESS  3*0.10', 8, 'certificate'),
('IGI LINEA PRINCESS 5*0.10', 3, 'certificate'),
('IGI MARQUISE 0.10', 156, 'certificate'),
('IGI MARQUISE 0.30', 41, 'certificate'),
('IGI MARQUISE 0.50', 1, 'certificate'),
('IGI MATCHY FANCY HEART 0.60', 4, 'certificate'),
('IGI ML MULTI 0.05*0.10*.0.05', 15, 'certificate'),
('IGI ML MULTI 0.10*0.20*0.10', 15, 'certificate'),
('IGI MULTI FOUR 0.20', 71, 'certificate'),
('IGI MULTI FOUR 0.40', 178, 'certificate'),
('IGI MULTIFIVE 0.50', 52, 'certificate'),
('IGI MULTIFIVE0.25', 164, 'certificate'),
('IGI OVAL 0.10', 154, 'certificate'),
('IGI OVAL 0.50', 6, 'certificate'),
('IGI PEAR 0.10', 81, 'certificate'),
('IGI PEAR 0.30', 21, 'certificate'),
('IGI PEAR 0.50', 7, 'certificate'),
('IGI SHAPYSHINE 0.30 OVAL', 53, 'certificate'),
('IGI SHAPYSHINE EMERALD 0.30', 10, 'certificate'),
('IGI ZAHA  MQ 0.30', 17, 'certificate'),
('INHOUSE CERTIFICATE  4X 0.05 WHITE', 209, 'ignore'),
('INHOUSE CERTIFICATE  CUTY 0,05 WHITE', 1796, 'ignore'),
('INHOUSE CERTIFICATE  CUTY 0,10 WHITE', 3207, 'ignore'),
('INHOUSE CERTIFICATE  CUTY 0,20 WHITE', 484, 'ignore'),
('INHOUSE CERTIFICATE  CUTY 0,30 WHITE', 1238, 'ignore'),
('INHOUSE CERTIFICATE 4 X 0.10 WHITE', 472, 'ignore'),
('INHOUSE CERTIFICATE 5 X 0.05 WHITE', 230, 'ignore'),
('INHOUSE CERTIFICATE 5 X 0.10 WHITE', 243, 'ignore'),
('INHOUSE CERTIFICATE EMERALD 0,10', 360, 'ignore'),
('INHOUSE CERTIFICATE EMPTY GREY', 91, 'ignore'),
('INHOUSE CERTIFICATE HEART 0,10', 255, 'ignore'),
('INHOUSE CERTIFICATE MARQUISE 0,10', 411, 'ignore'),
('INHOUSE CERTIFICATE OVAL 0,10', 413, 'ignore'),
('INHOUSE CERTIFICATE PEAR 0,10', 404, 'ignore'),
('INHOUSE CERTIFICATE TRIPLY 0,15 WHITE', 1087, 'ignore'),
('INHOUSE CERTIFICATE TRIPLY 0,30 WHITE', 998, 'ignore'),
('INHOUSE CERTIFICATE TRIPLY 0,60 WHITE', 753, 'ignore'),
('INHOUSE CERTIFICATE TRIPLY 0,90 WHITE', 1066, 'ignore'),
('INVOICE ENVELOPPES BLACK', 444, 'ignore'),
('INVOICE ENVELOPPES WHITE', 374, 'ignore'),
('J &J PINK IGI', 1525, 'certificate'),
('JOE & JUICE BLACK', 653, 'ignore'),
('JOE & JUICE PINK', 1490, 'ignore'),
('LOVE LAB BLACK FOLDER ENGLISH', 1174, 'ignore'),
('LOVE LAB BLACK FOLDER GERMAN', 1200, 'ignore'),
('LOVE LAB BLACK FOLDER ITALIAN', 750, 'ignore'),
('LOVE LAB BLACK FOLDERS FRENCH', 1200, 'ignore'),
('LOVE LAB FOLDER ENGLISH', 1070, 'ignore'),
('LOVE LAB PINK FOLDER FRANCE', 1063, 'ignore'),
('LOVE LAB PINK FOLDER GERMAN', 1125, 'ignore'),
('LOVELAB VITRINE', 40, 'ignore'),
('MAGNETIC BOX  5 ROWS PINK', 2, 'ignore'),
('MAGNETIC BOX 2 ROWS PINK', 4, 'ignore'),
('MAGNETIC BOX SMALL BLACK', 62, 'ignore'),
('MAGNETIC BOX SMALL PINK', 417, 'ignore'),
('MOTHERS DAY CARDS', 1193, 'ignore'),
('NEW BLACK ENVELOPPES', 8697, 'ignore'),
('NEW PINK ENVELOPPES', 4255, 'ignore'),
('NEW VITRINE HERMES', 3, 'ignore'),
('PILLOW  PINK BIG', 32, 'ignore'),
('PILLOW BLACK BIG', 92, 'ignore'),
('PILLOW BLACK SMALL', 117, 'ignore'),
('PILLOW GREY SMALL', 212, 'ignore'),
('PILLOW PINK SMALL', 35, 'ignore'),
('PILLOW WHITE BIG', 287, 'ignore'),
('PILLOW WHITE SMALL', 301, 'ignore'),
('PRESENTATION BLACK BOOK', 95, 'ignore'),
('PRESENTATION BOXES LOVELAB', 7, 'ignore'),
('RIVIERA 8*0.05', 2, 'ignore'),
('RIVIERA 8*0.10', 1, 'ignore'),
('SHOEBOX 2 ROWS BLACK', 53, 'ignore'),
('SHOEBOX 2 ROWS PINK', 93, 'ignore'),
('SHOEBOX 3 ROWS BLACK', 53, 'ignore'),
('SHOEBOX 3 ROWS PINK', 33, 'ignore'),
('SHOEBOX 5 ROWS PINK', 16, 'ignore'),
('Shopping bag BIG BLACK', 226, 'ignore'),
('Shopping Bag BIG PINK', 88, 'ignore'),
('Shopping Bag SMALL BLACK', 739, 'ignore'),
('Shopping Bag SMALL PINK', 641, 'ignore'),
('STICKERS LOVELAB', 10196, 'ignore'),
('THANK YOU CARD BIG BLACK', 1195, 'ignore'),
('THANK YOU CARD BIG BLACK ENGLISH 90X85', 2696, 'ignore'),
('THANK YOU CARD BIG PINK', 1195, 'ignore'),
('THANK YOU CARD BIG PINK ENGLISH 90X85', 1690, 'ignore'),
('THANK YOU CARD FRENCH PINK 90 X 85', 17, 'ignore'),
('THANK YOU CARDS BLACK FRENCG 85X85', 334, 'ignore'),
('THANK YOU CARDS BLACKFRENCH  90X85', 1919, 'ignore'),
('THANK YOU CARDS ENGLISH BLACK', 2032, 'ignore'),
('THANK YOU CARDS ENGLISH BLACK 85X85', 1325, 'ignore'),
('THANK YOU CARDS ENGLISH PINK', 2065, 'ignore'),
('THANK YOU CARDS ENGLISH PINK 85X85', 3280, 'ignore'),
('THANK YOU CARDS FRENCH PINK85X85', 2192, 'ignore'),
('THANK YOU CARDS ITALIAN BLACK', 1133, 'ignore'),
('THANK YOU CARDS ITALIAN BLACK 85X85', 781, 'ignore'),
('THANK YOU CARDS ITALIAN PINK', 904, 'ignore'),
('THANK YOU CARDS ITALIAN PINK 85X85', 584, 'ignore'),
('TOTEBAGS 2026', 507, 'ignore'),
('UNIVERSAL SOCKET', 2, 'ignore'),
('VALENTINE BUTTER PAPER', 973, 'ignore'),
('VALENTINE JOE JUICE', 1275, 'ignore'),
('VALENTINE TY CARDS', 993, 'ignore'),
('VALETINE INHOUSE CERT 0,10', 975, 'ignore');

-- New descriptions, never linked by guess. (Kinds already settled by a
-- human — packaging, in_house — are untouched: this only inserts.)
INSERT INTO public.igi_descriptions (description, model_id, kind, first_seen_at, last_seen_at)
SELECT r.description, NULL, r.kind, now(), now()
FROM shelf_read r
WHERE NOT EXISTS (SELECT 1 FROM public.igi_descriptions d WHERE d.description = r.description);

-- The seven plain matches.
UPDATE public.igi_descriptions d SET model_id = m.id, kind = 'certificate'
FROM (VALUES
  ('IGI FLOWER MQ 4*0.10', 'LGAJ6569'),
  ('IGI LINEA PRINCESS  3*0.10', 'LGAJ6571'),
  ('IGI LINEA PRINCESS 5*0.10', 'LGAJ6572'),
  ('IGI MARQUISE 0.50', 'LGAJ6557'),
  ('IGI ZAHA  MQ 0.30', 'LGAJ6568'),
  ('IGI ML MULTI 0.05*0.10*.0.05', 'LGAJ6566'),
  ('IGI ML MULTI 0.10*0.20*0.10', 'LGAJ6567')
) AS x(description, serial)
JOIN public.igi_models m ON m.serial = x.serial
WHERE d.description = x.description AND d.model_id IS NULL;

-- The day's snapshot, following the mapping as it now stands.
INSERT INTO public.igi_shelf_snapshots (snapshot_date, description, total_pcs, model_id)
SELECT '2026-09-16', r.description, r.total_pcs, d.model_id
FROM shelf_read r LEFT JOIN public.igi_descriptions d ON d.description = r.description
ON CONFLICT (snapshot_date, description) DO UPDATE SET total_pcs = EXCLUDED.total_pcs, model_id = EXCLUDED.model_id;

UPDATE public.igi_descriptions SET last_seen_at = now()
WHERE description IN (SELECT description FROM shelf_read);

DO $check$
DECLARE linked integer; snap integer; unlinked_igi integer;
BEGIN
  SELECT count(*) INTO linked FROM public.igi_descriptions WHERE model_id IS NOT NULL;
  SELECT count(*) INTO snap FROM public.igi_shelf_snapshots WHERE snapshot_date = '2026-09-16';
  SELECT count(*) INTO unlinked_igi FROM public.igi_descriptions WHERE kind = 'certificate' AND model_id IS NULL;
  IF linked <> 33 OR snap <> 129 OR unlinked_igi <> 0 THEN
    RAISE EXCEPTION 'Shelf read did not land: linked %, snapshot rows %, unlinked IGI lines % (expected 33, 129, 0)', linked, snap, unlinked_igi;
  END IF;
END $check$;

COMMIT;
