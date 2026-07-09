-- Phase 30: Atomic report payment settlement
-- ────────────────────────────────────────────────────────────────────────────
-- Phase 29 moved commission settlement to "Record Payment", but the route did
-- two independent writes: mark commissions paid, then insert the ledger row.
-- This migration makes the report-linked payment path transactional and
-- enforces one payout row per commission report.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.agent_payments
    WHERE report_id IS NOT NULL
    GROUP BY report_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate agent_payments.report_id rows exist; resolve them before applying Phase 30.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS agent_payments_report_id_unique
  ON public.agent_payments (report_id)
  WHERE report_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_agent_report_payment(
  p_agent_id uuid,
  p_amount numeric,
  p_notes text DEFAULT NULL,
  p_payment_date timestamptz DEFAULT now(),
  p_report_id uuid DEFAULT NULL,
  p_invoice_number text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_report public.commission_reports%ROWTYPE;
  v_payment public.agent_payments%ROWTYPE;
  v_invoice text := NULLIF(left(btrim(coalesce(p_invoice_number, '')), 100), '');
  v_commission_ids uuid[] := ARRAY[]::uuid[];
  v_updated_ids uuid[] := ARRAY[]::uuid[];
  v_doc_ids uuid[] := ARRAY[]::uuid[];
  v_paid_at timestamptz := now();
  v_uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'report_id is required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be a positive number';
  END IF;

  SELECT *
  INTO v_report
  FROM public.commission_reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commission report not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_report.agent_id <> p_agent_id THEN
    RAISE EXCEPTION 'Report does not belong to this agent';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.agent_payments
    WHERE report_id = p_report_id
  ) THEN
    RAISE EXCEPTION 'Commission report already has a recorded payment'
      USING ERRCODE = '23505';
  END IF;

  -- Reliable path for Phase 29+ reports: rows were linked when the report was sent.
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO v_commission_ids
  FROM (
    SELECT id
    FROM public.agent_commissions
    WHERE report_id = p_report_id
      AND status IN ('pending', 'approved')
    FOR UPDATE
  ) linked;

  -- Legacy fallback 1: older snapshots may store direct commission ids.
  IF cardinality(v_commission_ids) = 0 THEN
    WITH raw_ids AS (
      SELECT value AS raw_id
      FROM jsonb_array_elements_text(coalesce(v_report.snapshot_data->'includedCommissionIds', '[]'::jsonb))
      UNION
      SELECT row_data->>'commission_id' AS raw_id
      FROM (
        SELECT jsonb_array_elements(coalesce(v_report.snapshot_data->'orders', '[]'::jsonb)) AS row_data
        UNION ALL
        SELECT jsonb_array_elements(coalesce(v_report.snapshot_data->'looseSales', '[]'::jsonb)) AS row_data
        UNION ALL
        SELECT jsonb_array_elements(coalesce(v_report.snapshot_data->'bonuses', '[]'::jsonb)) AS row_data
      ) snapshot_rows
    )
    SELECT coalesce(array_agg(DISTINCT raw_id::uuid), ARRAY[]::uuid[])
    INTO v_commission_ids
    FROM raw_ids
    WHERE raw_id ~* v_uuid_pattern;
  END IF;

  -- Legacy fallback 2: oldest snapshots only reference document ids.
  IF cardinality(v_commission_ids) = 0 THEN
    WITH raw_docs AS (
      SELECT row_data->>'document_id' AS raw_id
      FROM (
        SELECT jsonb_array_elements(coalesce(v_report.snapshot_data->'orders', '[]'::jsonb)) AS row_data
        UNION ALL
        SELECT jsonb_array_elements(coalesce(v_report.snapshot_data->'looseSales', '[]'::jsonb)) AS row_data
        UNION ALL
        SELECT jsonb_array_elements(coalesce(v_report.snapshot_data->'bonuses', '[]'::jsonb)) AS row_data
      ) snapshot_rows
    )
    SELECT coalesce(array_agg(DISTINCT raw_id::uuid), ARRAY[]::uuid[])
    INTO v_doc_ids
    FROM raw_docs
    WHERE raw_id ~* v_uuid_pattern;

    IF cardinality(v_doc_ids) > 0 THEN
      SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
      INTO v_commission_ids
      FROM (
        SELECT id
        FROM public.agent_commissions
        WHERE agent_id = p_agent_id
          AND document_id = ANY(v_doc_ids)
          AND status IN ('pending', 'approved')
        FOR UPDATE
      ) by_document;
    END IF;
  END IF;

  INSERT INTO public.agent_payments (
    agent_id,
    amount,
    notes,
    payment_date,
    report_id,
    invoice_number,
    created_by
  )
  VALUES (
    p_agent_id,
    p_amount,
    NULLIF(btrim(coalesce(p_notes, '')), ''),
    coalesce(p_payment_date, now()),
    p_report_id,
    v_invoice,
    p_created_by
  )
  RETURNING * INTO v_payment;

  IF cardinality(v_commission_ids) > 0 THEN
    WITH updated AS (
      UPDATE public.agent_commissions
      SET
        status = 'paid',
        paid_at = v_paid_at,
        invoice_number = CASE
          WHEN v_invoice IS NULL THEN invoice_number
          ELSE v_invoice
        END
      WHERE id = ANY(v_commission_ids)
        AND status IN ('pending', 'approved')
      RETURNING id
    )
    SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
    INTO v_updated_ids
    FROM updated;
  END IF;

  RETURN jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'settled', jsonb_build_object(
      'marked', cardinality(v_updated_ids),
      'ids', coalesce(to_jsonb(v_updated_ids), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_agent_report_payment(
  uuid,
  numeric,
  text,
  timestamptz,
  uuid,
  text,
  uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_agent_report_payment(
  uuid,
  numeric,
  text,
  timestamptz,
  uuid,
  text,
  uuid
) TO service_role;

-- Verification (optional):
-- SELECT public.record_agent_report_payment('<agent>', 100, NULL, now(), '<report>', 'INV-1', '<admin>');
