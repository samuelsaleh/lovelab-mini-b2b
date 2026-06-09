-- Phase 21: Seed "PACK 6-RB-SYN"
-- ────────────────────────────────────────────────────────────────────────────
-- Adds one more global seed pack on top of Phase 20. Built from two client
-- order sheets (White + Yellow) merged into a single pack. Mirrors PACK6_ROWS
-- in app/components/BuilderPage.jsx so the DB and the hardcoded fallback stay
-- in sync.
--
-- Conventions:
--   - All CUTY / CUBIX items are non-braided ("closure":"nonBraided").
--   - Royal Blue cord throughout; IGI certified.
--   - Quantities are taken verbatim from the order sheets.
--   - fixed_total = 1500 (≥ the 970 € CHECK constraint from Phase 20).
--
-- Idempotent: re-running is safe via the WHERE NOT EXISTS label guard.
-- Requires: supabase-phase20-custom-packs.sql to have been run first.

INSERT INTO public.packs (label, description, budget_label, fixed_total, form_rows, scope, created_by, is_seed)
SELECT 'PACK 6-RB-SYN',
       ARRAY[
         'CUTY — 0.05 & 0.10 ct, White & Yellow, size M, non-braided',
         'CUBIX — 0.05 & 0.10 ct, White & Yellow, size S/M, non-braided',
         'MULTI THREE — 0.15 & 0.30 ct, WWW / YWP / YYY housing',
         'Royal Blue cord throughout · IGI certified'
       ],
       '€30 – €95/bracelet',
       1500,
       '[
         {"collection":"CUTY","carat":"0.05","bpColor":"White","setting":"","size":"M","colorCord":"Royal Blue","quantity":"3","unitPrice":"30","shape":"","cert":"IGI","closure":"nonBraided"},
         {"collection":"CUTY","carat":"0.10","bpColor":"White","setting":"","size":"M","colorCord":"Royal Blue","quantity":"3","unitPrice":"40","shape":"","cert":"IGI","closure":"nonBraided"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"White","setting":"","size":"S/M","colorCord":"Royal Blue","quantity":"3","unitPrice":"30","shape":"","cert":"IGI","closure":"nonBraided"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"White","setting":"","size":"S/M","colorCord":"Royal Blue","quantity":"3","unitPrice":"40","shape":"","cert":"IGI","closure":"nonBraided"},
         {"collection":"MULTI THREE","carat":"0.30","bpColor":"WWW","setting":"F","size":"M","colorCord":"Royal Blue","quantity":"1","unitPrice":"95","shape":"","cert":"IGI"},
         {"collection":"MULTI THREE","carat":"0.15","bpColor":"WWW","setting":"F","size":"M","colorCord":"Royal Blue","quantity":"1","unitPrice":"65","shape":"","cert":"IGI"},
         {"collection":"CUTY","carat":"0.05","bpColor":"Yellow","setting":"","size":"M","colorCord":"Royal Blue","quantity":"2","unitPrice":"30","shape":"","cert":"IGI","closure":"nonBraided"},
         {"collection":"CUTY","carat":"0.10","bpColor":"Yellow","setting":"","size":"M","colorCord":"Royal Blue","quantity":"2","unitPrice":"40","shape":"","cert":"IGI","closure":"nonBraided"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"Yellow","setting":"","size":"S/M","colorCord":"Royal Blue","quantity":"2","unitPrice":"30","shape":"","cert":"IGI","closure":"nonBraided"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"Yellow","setting":"","size":"S/M","colorCord":"Royal Blue","quantity":"2","unitPrice":"40","shape":"","cert":"IGI","closure":"nonBraided"},
         {"collection":"MULTI THREE","carat":"0.15","bpColor":"YWP","setting":"LO","size":"M","colorCord":"Royal Blue","quantity":"3","unitPrice":"65","shape":"","cert":"IGI"},
         {"collection":"MULTI THREE","carat":"0.30","bpColor":"YWP","setting":"LO","size":"M","colorCord":"Royal Blue","quantity":"3","unitPrice":"95","shape":"","cert":"IGI"},
         {"collection":"MULTI THREE","carat":"0.15","bpColor":"YYY","setting":"F","size":"M","colorCord":"Royal Blue","quantity":"1","unitPrice":"65","shape":"","cert":"IGI"},
         {"collection":"MULTI THREE","carat":"0.30","bpColor":"YYY","setting":"F","size":"M","colorCord":"Royal Blue","quantity":"1","unitPrice":"95","shape":"","cert":"IGI"}
       ]'::jsonb,
       'global',
       NULL,
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.packs WHERE is_seed = true AND label = 'PACK 6-RB-SYN'
);
