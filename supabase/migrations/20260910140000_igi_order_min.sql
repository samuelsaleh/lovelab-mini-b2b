-- LoveLab's own level on IGI's stock, and the alert that goes with it
-- (Sam, 10 Sept 2026).
--
-- Two alert rules existed, one owner each: shelf_min is LoveLab's level on
-- their own shelf ("go collect"), pool_min is IGI's level on their own stock
-- ("produce more"). Sam wants a third: LoveLab's level on IGI's stock, so
-- that when IGI hold fewer than LoveLab are comfortable with, LoveLab hear
-- about it and can order production themselves — whether or not IGI react.
--
-- IGI never see order_min. It is LoveLab's judgement of IGI's stock, and the
-- portal's loader does not select it (lib/igi/portalShapes.js forbids it).

ALTER TABLE public.igi_models
  ADD COLUMN IF NOT EXISTS order_min integer CHECK (order_min IS NULL OR order_min >= 0),
  -- When the model last crossed below a level and an email went out. Cleared
  -- when it comes back above, so each crossing is announced exactly once.
  ADD COLUMN IF NOT EXISTS shelf_alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS order_alerted_at timestamptz;

COMMENT ON COLUMN public.igi_models.order_min IS
  'LoveLab''s alert level on IGI''s stock: below it, LoveLab order production. Never shown to IGI.';
COMMENT ON COLUMN public.igi_models.shelf_alerted_at IS
  'Set when the shelf fell below shelf_min and LoveLab were emailed; cleared once it is back above.';
COMMENT ON COLUMN public.igi_models.order_alerted_at IS
  'Set when IGI''s stock fell below order_min and LoveLab were emailed; cleared once it is back above.';
