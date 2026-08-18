-- Decouple "who brought the order" from "where it happened" (Aug 2026).
--
-- Until now a document's selling agent was only INFERRED (from created_by plus
-- agent_commissions rows / the linked agent-folder event). That made two things
-- impossible: attributing an order to an agent when an admin typed it, and
-- seeing an agent's sales AT a fair (event_id could only be the fair OR the
-- agent folder, never both).
--
-- documents.agent_id is the explicit "sold by" agent. event_id keeps meaning
-- "where/what context" (fairs, partners, other, or the agent's own folder).
-- Both are independent, so one order is still one row -- counted once -- but can
-- be sliced by agent AND by fair.
--
-- Backfilled by scripts/backfill-document-agent-id.mjs using the SAME
-- resolveCommissionAgent logic the app already uses, so per-agent revenue is
-- identical before and after.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS documents_agent_id_idx
  ON public.documents (agent_id);

COMMENT ON COLUMN public.documents.agent_id IS
  'Selling agent (who brought the order), independent of created_by (who typed it) and event_id (the fair/context). Nullable: direct/office orders may have no agent.';
