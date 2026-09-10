-- LoveLab x IGI — shared certificate stock and history.
--
-- Every LoveLab piece ships with an IGI certificate. Today the flow is tracked in two
-- Excel files that never talk to each other. These tables hold the movements once and
-- everything else is derived from them (see lib/igi/derive.js).
--
-- The certificate SERIAL is the identity, never the name. Names can change on any day
-- without breaking history. One name is shared by both companies.
--
-- Visibility is deliberately asymmetric: LoveLab sees both sides, IGI sees only their
-- own stock and the requests addressed to them. IGI must never see how fast LoveLab's
-- shelf empties, because that is LoveLab's sales rate.

-- ─── 1. IGI role flag ───────────────────────────────────────────────────────
-- Mirrors the commercial-assistant flag (20260818090000). A flag rather than a new
-- `role` value, because profiles_role_check only allows 'admin' | 'member'.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_igi boolean DEFAULT false;

COMMENT ON COLUMN public.profiles.is_igi IS
  'IGI Antwerp staff: sees only the IGI portal — their own stock, the requests sent to them, their batches and invoices. Never LoveLab''s shelf.';

CREATE OR REPLACE FUNCTION public.is_igi()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_igi = true
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_igi() TO authenticated;

-- ─── 2. igi_models ──────────────────────────────────────────────────────────
-- 61 in use, 15 reserved serials, 3 waiting for a serial.

CREATE TABLE IF NOT EXISTS public.igi_models (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'LGAJ6529' = LG (lab grown) + AJ (IGI series) + 4 model digits.
  -- Null only while IGI has not numbered the model yet.
  serial        text,
  -- 'LGAJ65292505' — the same serial carrying the YYMM production month.
  serial_full   text,
  -- LoveLab decides the name, IGI follows it. Where one certificate serves several
  -- products the names are merged into this one label, so the stock is counted once.
  name          text        NOT NULL,
  -- What IGI's file called it at import time. Kept for the trail, never displayed.
  igi_name      text,
  -- Text, not integer: '6+1' and '3+2' are real values in the source file.
  stones        text,
  carat         numeric(4,2),
  shape         text,
  spec          text,
  -- in_use          — has a serial and a quantity
  -- reserved        — IGI assigned the serial, nothing was ever ordered. Kept on record
  --                   so the numbers are not lost; hidden from operational screens.
  --                   (These carried "v" instead of a quantity in the source file,
  --                   which is what produced 15 #VALUE! errors.)
  -- awaiting_serial — asked for, IGI has not numbered it. Cannot be requested.
  state         text        NOT NULL DEFAULT 'in_use'
                            CHECK (state IN ('in_use', 'reserved', 'awaiting_serial')),
  qty_ordered   integer     CHECK (qty_ordered IS NULL OR qty_ordered >= 0),
  -- Alert levels. One owner each: LoveLab owns shelf_min, IGI owns pool_min.
  -- Plain numbers only — no "weeks of cover", that was tried and removed.
  shelf_min     integer     NOT NULL DEFAULT 25 CHECK (shelf_min >= 0),
  pool_min      integer     CHECK (pool_min IS NULL OR pool_min >= 0),
  sort_order    integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- A model waiting for a serial has none yet, so this cannot be a plain UNIQUE.
  CONSTRAINT igi_models_serial_required_when_numbered
    CHECK (state = 'awaiting_serial' OR serial IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS igi_models_serial_key
  ON public.igi_models (serial) WHERE serial IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_igi_models_state
  ON public.igi_models (state);

-- ─── 3. igi_batches ─────────────────────────────────────────────────────────
-- IGI's stock is the SUM of production batches, never an overwritten quantity cell.
-- Nothing is ever destroyed, so it stays visible what arrived when.

CREATE TABLE IF NOT EXISTS public.igi_batches (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id    uuid        NOT NULL REFERENCES public.igi_models(id) ON DELETE CASCADE,
  qty         integer     NOT NULL CHECK (qty > 0),
  batch_date  date        NOT NULL,
  reference   text,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_igi_batches_model ON public.igi_batches (model_id);

-- ─── 4. igi_visits ──────────────────────────────────────────────────────────
-- One movement: sortie (out) then retour (back, certified). Two movements on the same
-- day are two rows — visit_no is the identity, visit_date is not unique.
--
-- visit_date is `date`, not timestamptz, on purpose: a movement is a day, and timezone
-- conversion would let one drift across midnight into the wrong day.

CREATE TABLE IF NOT EXISTS public.igi_visits (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_no      integer     NOT NULL UNIQUE,
  visit_date    date        NOT NULL,
  -- requested — sent to IGI, on their To do
  -- issued    — IGI typed what they actually made (fewer than asked is normal)
  -- closed    — LoveLab confirmed the return
  status        text        NOT NULL DEFAULT 'requested'
                            CHECK (status IN ('requested', 'issued', 'closed')),
  requested_at  timestamptz,
  issued_at     timestamptz,
  closed_at     timestamptz,
  -- Set ONLY on imported historical movements where IGI recorded a daily total with no
  -- model detail (16 Jun – 28 Jul 2026, 3 245 certificates over 9 movements). Such a
  -- visit has a total and zero lines, so it can never be absorbed into a per-model
  -- figure. When the movements are reconstructed, lines are added and this is cleared.
  unattributed_total integer CHECK (unattributed_total IS NULL OR unattributed_total >= 0),
  -- Four movements in the source file carry the wrong year (2016, 2024, 2014, 2022).
  -- The date is kept exactly as written and flagged; the reporting month is inherited
  -- from the preceding sound visit at read time. See monthOf() in lib/igi/derive.js.
  date_suspect  boolean     NOT NULL DEFAULT false,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_igi_visits_status ON public.igi_visits (status);
CREATE INDEX IF NOT EXISTS idx_igi_visits_date   ON public.igi_visits (visit_date);

-- ─── 5. igi_visit_lines ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.igi_visit_lines (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id      uuid    NOT NULL REFERENCES public.igi_visits(id) ON DELETE CASCADE,
  model_id      uuid    NOT NULL REFERENCES public.igi_models(id) ON DELETE RESTRICT,
  qty_requested integer NOT NULL CHECK (qty_requested >= 0),
  -- Null until IGI confirms. Fewer than requested is normal, not an error.
  qty_issued    integer CHECK (qty_issued IS NULL OR qty_issued >= 0),
  -- Null until LoveLab confirms the return.
  qty_received  integer CHECK (qty_received IS NULL OR qty_received >= 0),
  UNIQUE (visit_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_igi_visit_lines_visit ON public.igi_visit_lines (visit_id);
CREATE INDEX IF NOT EXISTS idx_igi_visit_lines_model ON public.igi_visit_lines (model_id);

-- ─── 6. igi_descriptions ────────────────────────────────────────────────────
-- The mapping table. LoveLab's own software returns free text with no product code,
-- id or SKU — only `description` and `total_pcs`. So each description is linked to a
-- model once, by hand. Many descriptions may point at one model.
--
-- The text is stored exactly as the API returns it, warts included: the live data
-- holds both 'IGI MULTIFIVE0.25' (no space) and 'IGI MULTIFIVE 0.50' (with space).
-- Matching is exact-string only — see lib/igi/syncShelf.js for why.

CREATE TABLE IF NOT EXISTS public.igi_descriptions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  description    text        NOT NULL UNIQUE,
  -- Null means "seen in the feed, still needs a human". Never guessed at.
  model_id       uuid        REFERENCES public.igi_models(id) ON DELETE SET NULL,
  -- certificate — an IGI certificate line, belongs to a model
  -- packaging   — merely has IGI in the name (ENVELOP PINK IGI and such)
  -- in_house    — LoveLab's own certificates, a separate product line, out of scope
  -- ignore      — deliberately parked
  -- Only 'certificate' rows with a null model_id are "needs a human". The other
  -- three are settled answers, so they never pollute the unmatched queue.
  kind           text        NOT NULL DEFAULT 'certificate'
                             CHECK (kind IN ('certificate', 'packaging', 'in_house', 'ignore')),
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz,
  linked_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT igi_descriptions_model_only_for_certificates
    CHECK (model_id IS NULL OR kind = 'certificate')
);

CREATE INDEX IF NOT EXISTS idx_igi_descriptions_model ON public.igi_descriptions (model_id);

-- ─── 7. igi_shelf_snapshots ─────────────────────────────────────────────────
-- A dated snapshot of what LoveLab's software reported, one row per description per
-- run. Yesterday minus today is what got packed — consumption measured with nobody
-- typing anything.
--
-- Keyed on the description rather than the model so the snapshot stays a faithful
-- record of what the ERP actually said, including descriptions not yet mapped.

CREATE TABLE IF NOT EXISTS public.igi_shelf_snapshots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date        NOT NULL,
  description   text        NOT NULL,
  total_pcs     integer     NOT NULL CHECK (total_pcs >= 0),
  model_id      uuid        REFERENCES public.igi_models(id) ON DELETE SET NULL,
  captured_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, description)
);

CREATE INDEX IF NOT EXISTS idx_igi_shelf_snapshots_date
  ON public.igi_shelf_snapshots (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_igi_shelf_snapshots_model
  ON public.igi_shelf_snapshots (model_id, snapshot_date DESC);

-- ─── 8. igi_receipts ────────────────────────────────────────────────────────
-- Our half of the idempotency contract for the write-back endpoint that LoveLab IT
-- has yet to build. Same `reference` sent twice — a retry, a timeout, a double click —
-- must not add the stock twice. Without this you get phantom stock nobody notices
-- for months.

CREATE TABLE IF NOT EXISTS public.igi_receipts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id   uuid        NOT NULL REFERENCES public.igi_visits(id) ON DELETE CASCADE,
  reference  text        NOT NULL UNIQUE,
  status     text        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'applied', 'failed')),
  posted_at  timestamptz,
  response   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_igi_receipts_visit ON public.igi_receipts (visit_id);

-- ─── 9. Row level security ──────────────────────────────────────────────────
-- The API routes use the service-role client and enforce authorization in JS
-- (app/api/_lib/access.js), so these policies are defence-in-depth. They are written
-- to make the asymmetry structural: there is deliberately NO policy granting IGI any
-- access to igi_shelf_snapshots, so a mistake in a route cannot leak LoveLab's shelf.

ALTER TABLE public.igi_models          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.igi_batches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.igi_visits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.igi_visit_lines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.igi_descriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.igi_shelf_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.igi_receipts        ENABLE ROW LEVEL SECURITY;

-- Admin: full access everywhere.
DROP POLICY IF EXISTS "Admin full access on igi_models" ON public.igi_models;
CREATE POLICY "Admin full access on igi_models" ON public.igi_models
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin full access on igi_batches" ON public.igi_batches;
CREATE POLICY "Admin full access on igi_batches" ON public.igi_batches
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin full access on igi_visits" ON public.igi_visits;
CREATE POLICY "Admin full access on igi_visits" ON public.igi_visits
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin full access on igi_visit_lines" ON public.igi_visit_lines;
CREATE POLICY "Admin full access on igi_visit_lines" ON public.igi_visit_lines
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin full access on igi_descriptions" ON public.igi_descriptions;
CREATE POLICY "Admin full access on igi_descriptions" ON public.igi_descriptions
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin full access on igi_shelf_snapshots" ON public.igi_shelf_snapshots;
CREATE POLICY "Admin full access on igi_shelf_snapshots" ON public.igi_shelf_snapshots
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin full access on igi_receipts" ON public.igi_receipts;
CREATE POLICY "Admin full access on igi_receipts" ON public.igi_receipts
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- IGI: reads the models they produce and the movements addressed to them, and adds
-- their own production batches. They never see igi_shelf_snapshots or igi_receipts.
DROP POLICY IF EXISTS "IGI can read igi_models" ON public.igi_models;
CREATE POLICY "IGI can read igi_models" ON public.igi_models
  FOR SELECT TO authenticated USING (public.is_igi() AND state = 'in_use');

DROP POLICY IF EXISTS "IGI can read igi_visits" ON public.igi_visits;
CREATE POLICY "IGI can read igi_visits" ON public.igi_visits
  FOR SELECT TO authenticated USING (public.is_igi());

DROP POLICY IF EXISTS "IGI can read igi_visit_lines" ON public.igi_visit_lines;
CREATE POLICY "IGI can read igi_visit_lines" ON public.igi_visit_lines
  FOR SELECT TO authenticated USING (public.is_igi());

DROP POLICY IF EXISTS "IGI can read igi_batches" ON public.igi_batches;
CREATE POLICY "IGI can read igi_batches" ON public.igi_batches
  FOR SELECT TO authenticated USING (public.is_igi());

DROP POLICY IF EXISTS "IGI can add igi_batches" ON public.igi_batches;
CREATE POLICY "IGI can add igi_batches" ON public.igi_batches
  FOR INSERT TO authenticated WITH CHECK (public.is_igi());

-- ─── 10. Column grants ──────────────────────────────────────────────────────
-- Row level security cannot hide a column, only a row. IGI needs to read
-- igi_models, and shelf_min lives on it — so without this they could read the
-- level at which LoveLab decides their own shelf is low, which is a hint at how
-- fast it empties. Column grants are the only mechanism that closes that.
--
-- pool_min stays readable: it is IGI's own alert level, on their own stock.
--
-- The app itself reads through the service-role client, which bypasses both
-- policies and grants, so the LoveLab screens are unaffected.

REVOKE SELECT ON public.igi_models FROM authenticated;
GRANT SELECT (
  id, serial, serial_full, name, igi_name, stones, carat, shape, spec,
  state, qty_ordered, pool_min, sort_order, created_at, updated_at
) ON public.igi_models TO authenticated;
