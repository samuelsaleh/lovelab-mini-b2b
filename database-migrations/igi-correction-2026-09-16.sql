-- ═══════════════════════════════════════════════════════════════════════
--  LoveLab × IGI — two models IGI say are empty (Sam, 16 Sept 2026)
-- ═══════════════════════════════════════════════════════════════════════
--
--  Michael told Sam on 16 Sept that IGI hold none of Cuty-Cubix 0.30 Round
--  (LGAJ6532) and none of Multi Three 0.60 Round (LGAJ6535). IGI's own file
--  of 15 Sept still showed 82 and 28, because between 16 June and 28 July
--  IGI issued 3 245 certificates without writing down which model — and
--  those 110 were among them.
--
--  So this is not a new movement and not a new figure: it is 110 of the
--  3 245 finally attributed. The last unattributed day (V-017, 28 July,
--  266) gives up 110 to a correction movement dated the same day, so every
--  monthly total and every invoice stays exactly as it was.
--
--  Not done here: Multi Three 0.90 (LGAJ6536), which Michael says is "very
--  few" — no number given, and 250 are on order.
--
--  Safe to run twice.

BEGIN;

INSERT INTO public.igi_visits (visit_no, visit_date, status, date_suspect, unattributed_total, closed_at)
SELECT 30, '2026-07-28', 'closed', false, NULL, '2026-07-28'::date + time '12:00'
WHERE NOT EXISTS (SELECT 1 FROM public.igi_visits WHERE visit_no = 30);

INSERT INTO public.igi_visit_lines (visit_id, model_id, qty_requested, qty_issued, qty_received)
SELECT v.id, m.id, x.qty, x.qty, x.qty
FROM (VALUES ('LGAJ6532', 82), ('LGAJ6535', 28)) AS x(serial, qty)
JOIN public.igi_models m ON m.serial = x.serial
JOIN public.igi_visits v ON v.visit_no = 30
WHERE NOT EXISTS (
  SELECT 1 FROM public.igi_visit_lines l WHERE l.visit_id = v.id AND l.model_id = m.id
);

UPDATE public.igi_visits SET unattributed_total = 156
WHERE visit_no = 17 AND unattributed_total = 266;

-- ── Check ────────────────────────────────────────────────────────────────
DO $check$
DECLARE
  pool_6532 integer; pool_6535 integer; unattributed integer;
BEGIN
  SELECT coalesce(sum(b.qty),0) - coalesce((SELECT sum(qty_issued) FROM public.igi_visit_lines l JOIN public.igi_models mm ON mm.id = l.model_id WHERE mm.serial = 'LGAJ6532'),0)
    INTO pool_6532 FROM public.igi_batches b JOIN public.igi_models m ON m.id = b.model_id WHERE m.serial = 'LGAJ6532';
  SELECT coalesce(sum(b.qty),0) - coalesce((SELECT sum(qty_issued) FROM public.igi_visit_lines l JOIN public.igi_models mm ON mm.id = l.model_id WHERE mm.serial = 'LGAJ6535'),0)
    INTO pool_6535 FROM public.igi_batches b JOIN public.igi_models m ON m.id = b.model_id WHERE m.serial = 'LGAJ6535';
  SELECT coalesce(sum(unattributed_total),0) INTO unattributed FROM public.igi_visits;
  IF pool_6532 <> 0 OR pool_6535 <> 0 OR unattributed <> 3135 THEN
    RAISE EXCEPTION 'Correction did not land: LGAJ6532 pool %, LGAJ6535 pool %, unattributed % (expected 0, 0, 3135)', pool_6532, pool_6535, unattributed;
  END IF;
END $check$;

COMMIT;
