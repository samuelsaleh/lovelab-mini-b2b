/**
 * Mark agent commissions as paid out after a report is generated.
 * Kept in a standalone module so CLI backfill scripts can import it
 * without pulling in email/Drive dependencies.
 */

import {
  commissionIdsFromReportSnapshot,
  documentIdsFromReportSnapshot,
} from './commissionReport.js';

export async function markCommissionsPaidOut(supabase, commissionIds, { paidAt } = {}) {
  const ids = [...new Set((commissionIds || []).filter(Boolean))];
  if (ids.length === 0) return { marked: 0, ids: [] };

  const timestamp = paidAt || new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('agent_commissions')
    .update({ status: 'paid', paid_at: timestamp })
    .in('id', ids)
    .in('status', ['pending', 'approved'])
    .select('id');

  if (error) {
    throw new Error(`Failed to mark commissions paid out: ${error.message}`);
  }

  return { marked: updated?.length || 0, ids: (updated || []).map((r) => r.id) };
}

/**
 * Phase 29 — link commissions to the report that included them WITHOUT marking
 * them paid. Called by "Send report now" so the rows move to the "Reported"
 * state (status stays pending, report_id set). Re-sending a report then skips
 * them, and recording the payment later flips them to paid.
 */
export async function linkCommissionsToReport(supabase, reportId, commissionIds) {
  const ids = [...new Set((commissionIds || []).filter(Boolean))];
  if (!reportId || ids.length === 0) return { linked: 0, ids: [] };

  const { data: updated, error } = await supabase
    .from('agent_commissions')
    .update({ report_id: reportId })
    .in('id', ids)
    .in('status', ['pending', 'approved'])
    .select('id');

  if (error) {
    throw new Error(`Failed to link commissions to report: ${error.message}`);
  }

  return { linked: updated?.length || 0, ids: (updated || []).map((r) => r.id) };
}

/**
 * Phase 29 — settle a report: mark every still-pending commission that belongs
 * to `report` as paid, stamping `paid_at` and (optionally) the matched
 * `invoice_number`. Called when the admin records the actual payout.
 *
 * Resolution order:
 *   1. The `report_id` link column (Phase 29 — the reliable path for new reports)
 *   2. The stored report snapshot (legacy reports created before the link column)
 *
 * Already-paid / cancelled rows are left untouched by the status guard.
 */
export async function settleReportPayment(supabase, { report, invoiceNumber = null, paidAt } = {}) {
  if (!report?.id) throw new Error('report is required');

  let ids = [];
  const { data: linked, error: linkErr } = await supabase
    .from('agent_commissions')
    .select('id')
    .eq('report_id', report.id)
    .in('status', ['pending', 'approved']);
  if (linkErr) {
    throw new Error(`Failed to resolve report commissions: ${linkErr.message}`);
  }
  ids = (linked || []).map((r) => r.id);

  // Legacy fallback: reports generated before the report_id column existed.
  if (ids.length === 0) {
    ids = await resolveCommissionIdsForReport(supabase, report);
  }

  const cleanIds = [...new Set((ids || []).filter(Boolean))];
  if (cleanIds.length === 0) return { marked: 0, ids: [] };

  const timestamp = paidAt || new Date().toISOString();
  const update = { status: 'paid', paid_at: timestamp };
  const inv = invoiceNumber == null ? '' : String(invoiceNumber).trim().slice(0, 100);
  // Only stamp the invoice when one was supplied — never wipe an existing note.
  if (inv) update.invoice_number = inv;

  const { data: updated, error } = await supabase
    .from('agent_commissions')
    .update(update)
    .in('id', cleanIds)
    .in('status', ['pending', 'approved'])
    .select('id');

  if (error) {
    throw new Error(`Failed to settle report payment: ${error.message}`);
  }

  return { marked: updated?.length || 0, ids: (updated || []).map((r) => r.id) };
}

export async function resolveCommissionIdsForReport(supabase, report) {
  const snapshot = report?.snapshot_data;
  const directIds = commissionIdsFromReportSnapshot(snapshot);
  if (directIds.length > 0) return directIds;

  const docIds = documentIdsFromReportSnapshot(snapshot);
  if (docIds.length === 0 || !report?.agent_id) return [];

  const { data: rows, error } = await supabase
    .from('agent_commissions')
    .select('id')
    .eq('agent_id', report.agent_id)
    .in('document_id', docIds)
    .in('status', ['pending', 'approved']);

  if (error) {
    throw new Error(`Failed to resolve commissions for report ${report.id}: ${error.message}`);
  }

  return (rows || []).map((r) => r.id);
}
