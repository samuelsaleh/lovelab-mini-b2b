-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Offre (admin parking bucket)
-- Date: 2026-07-28
-- Purpose: An "Offre" is a parked order that behaves exactly like a draft (no
--          commission, no bonus, no notification email, no LoveLab sync, no
--          folder, excluded from revenue/analytics) but lives on its own
--          admin-only page instead of the shared Draft page.
--
--          It is deliberately NOT a new `status` value: `status = 'draft'` is
--          what ~25 call sites already check to keep parked orders out of
--          revenue, commissions and team stats. Offres reuse that status and
--          carry `draft_kind = 'offre'` purely as a UI discriminant, so all of
--          those protections are inherited instead of re-implemented.
--
--          NULL = ordinary Draft. Purely additive and back-compatible.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the column (safe to run multiple times). Nullable — NULL means the
--    document belongs to the ordinary Draft bucket (or is a sent document).
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS draft_kind text;

-- 2. Constrain to the known buckets. No-op if it already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_draft_kind_check'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_draft_kind_check
      CHECK (draft_kind IS NULL OR draft_kind IN ('offre'));
  END IF;
END $$;

-- 3. Partial index for the "Offre folder" lookup (few rows, not trashed).
CREATE INDEX IF NOT EXISTS idx_documents_draft_kind
  ON public.documents(draft_kind)
  WHERE deleted_at IS NULL AND draft_kind IS NOT NULL;
