-- A reserved serial can be produced.
--
-- Sam, 16 Sept 2026, on IGI's September file: the fifteen serials IGI had
-- numbered in advance (LGAJ6588–6602) now carry 500 each — IGI have printed
-- them. Until now the guard knew one state change only, awaiting a serial →
-- in use, because a reserved serial was defined as one never produced. That
-- definition was true for three months and is not any more.
--
-- The rule becomes: a model goes into use either by being numbered (it was
-- waiting for a serial) or by being produced (it was reserved). Everything
-- else the guard says stays as it was: a serial, once set, is permanent, and
-- no other state change exists.

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

  -- Two ways into use, and no other state change: numbered (it was waiting
  -- for a serial) or produced (IGI had reserved the serial in advance).
  IF NEW.state IS DISTINCT FROM OLD.state
     AND NOT (OLD.state IN ('awaiting_serial', 'reserved') AND NEW.state = 'in_use') THEN
    RAISE EXCEPTION 'A model only goes into use, from awaiting a serial or from reserved (was %, asked for %)', OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;

  -- Numbering stamps when it happened, whoever forgot to.
  IF OLD.state = 'awaiting_serial' AND NEW.state = 'in_use' THEN
    NEW.numbered_at := coalesce(NEW.numbered_at, now());
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;
