-- New models, each company entering its own half (Sam, 10 Sept 2026).
--
-- Until now a new model was "agreed with IGI directly, not created here": the
-- app could hold a model waiting for a serial but nobody could create one, and
-- IGI had nowhere to give it its number. Now:
--
--   1. LoveLab add the model — name and what it is (stones, carat, shape).
--      It is born awaiting_serial and cannot be requested.
--   2. It appears on IGI's To do. They type the serial and confirm. From then
--      on it is in_use: requestable, countable, invoiceable.
--
-- The serial is set once and never changed, by anyone. Everything in the
-- history hangs on it.

-- ─── 1. Who asked, who numbered ─────────────────────────────────────────────
ALTER TABLE public.igi_models
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS numbered_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS numbered_at  timestamptz;

COMMENT ON COLUMN public.igi_models.requested_by IS 'LoveLab user who added the model (awaiting_serial).';
COMMENT ON COLUMN public.igi_models.numbered_by  IS 'Who gave it its serial — an IGI user, or a LoveLab admin driving the preview.';

-- ─── 2. The rules no policy can express ─────────────────────────────────────
-- Row level security decides which rows a role may update and column grants
-- decide which columns; neither can say "this value may be written once".
-- A trigger can, and it binds every caller — the service role included.
CREATE OR REPLACE FUNCTION public.igi_models_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A serial, once set, is permanent.
  IF OLD.serial IS NOT NULL AND NEW.serial IS DISTINCT FROM OLD.serial THEN
    RAISE EXCEPTION 'The serial % is set once and cannot be changed', OLD.serial
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.serial_full IS NOT NULL AND NEW.serial_full IS DISTINCT FROM OLD.serial_full THEN
    RAISE EXCEPTION 'The full serial % is set once and cannot be changed', OLD.serial_full
      USING ERRCODE = 'check_violation';
  END IF;

  -- The only state change a model ever makes: waiting for a serial → in use.
  IF NEW.state IS DISTINCT FROM OLD.state
     AND NOT (OLD.state = 'awaiting_serial' AND NEW.state = 'in_use') THEN
    RAISE EXCEPTION 'A model only moves from awaiting a serial to in use (was %, asked for %)', OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;

  -- Numbering stamps when it happened, whoever forgot to.
  IF OLD.state = 'awaiting_serial' AND NEW.state = 'in_use' THEN
    NEW.numbered_at := coalesce(NEW.numbered_at, now());
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS igi_models_guard ON public.igi_models;
CREATE TRIGGER igi_models_guard
  BEFORE UPDATE ON public.igi_models
  FOR EACH ROW EXECUTE FUNCTION public.igi_models_guard();

-- ─── 3. What IGI may see and do with a new model ───────────────────────────
-- They need to see the models waiting on them (still never the reserved ones).
DROP POLICY IF EXISTS "IGI can read igi_models" ON public.igi_models;
CREATE POLICY "IGI can read igi_models" ON public.igi_models
  FOR SELECT TO authenticated
  USING (public.is_igi() AND state IN ('in_use', 'awaiting_serial'));

-- Their alert level, as before — but now explicitly on a model that stays in use.
DROP POLICY IF EXISTS "IGI can set their own alert level" ON public.igi_models;
CREATE POLICY "IGI can set their own alert level" ON public.igi_models
  FOR UPDATE TO authenticated
  USING (public.is_igi() AND state = 'in_use')
  WITH CHECK (public.is_igi() AND state = 'in_use');

-- Numbering: a model waiting for a serial becomes one in use, with a serial.
DROP POLICY IF EXISTS "IGI can number a new model" ON public.igi_models;
CREATE POLICY "IGI can number a new model" ON public.igi_models
  FOR UPDATE TO authenticated
  USING (public.is_igi() AND state = 'awaiting_serial')
  WITH CHECK (public.is_igi() AND state = 'in_use' AND serial IS NOT NULL);

-- The columns those two policies may touch, and no others. The trigger above
-- is what stops the alert-level policy from being used to rewrite a serial.
REVOKE UPDATE ON public.igi_models FROM authenticated;
GRANT UPDATE (pool_min, serial, serial_full, state, numbered_by, numbered_at)
  ON public.igi_models TO authenticated;
