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
