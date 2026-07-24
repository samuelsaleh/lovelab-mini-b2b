/**
 * Recalculate unpaid, unreported commission amounts when a rate changes.
 *
 * Scope (Sam July 2026 — org settlement €0 with awaiting/ready counts):
 *   - Only rows with report_id IS NULL (already-sent reports stay historically stable)
 *   - status not in ('paid', 'cancelled')
 *   - type === 'order' (bonuses keep their stored amount)
 *
 * Amount = calculateCommission(order_total, null, newRate) — same rounding as
 * attribution. Uses the stored order_total (already commissionable base).
 *
 * Relative imports so node:test / jest can load without Next path aliases.
 */

import { calculateCommission } from './commission.js';

const SKIP_STATUSES = new Set(['paid', 'cancelled']);

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase
 * @param {string} agentId
 * @param {number|null|undefined} newRate - percent 0–100
 * @returns {Promise<{ updated: number }>}
 */
export async function recalcUnpaidCommissionsForAgent(adminSupabase, agentId, newRate) {
  if (!agentId) return { updated: 0 };
  const rate = Number(newRate);
  if (!Number.isFinite(rate) || rate < 0) return { updated: 0 };

  const { data: rows, error } = await adminSupabase
    .from('agent_commissions')
    .select('id, order_total, status, report_id, type')
    .eq('agent_id', agentId)
    .is('report_id', null)
    .eq('type', 'order');

  if (error) {
    console.error('[commissionRecalc] agent fetch failed:', error.message);
    return { updated: 0 };
  }

  let updated = 0;
  for (const row of rows || []) {
    if (SKIP_STATUSES.has(row.status)) continue;
    if (row.type && row.type !== 'order') continue;
    const { amount, rate: appliedRate } = calculateCommission(row.order_total, null, rate);
    const { error: upErr } = await adminSupabase
      .from('agent_commissions')
      .update({
        commission_rate: appliedRate,
        commission_amount: amount,
      })
      .eq('id', row.id);
    if (upErr) {
      console.error('[commissionRecalc] row update failed:', upErr.message, row.id);
      continue;
    }
    updated += 1;
  }
  return { updated };
}

/**
 * When an organization rate changes, recalc members who have no personal rate
 * (null/0) — they fall back to the org rate in commissionAttribution.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase
 * @param {string} organizationId
 * @param {number|null|undefined} newOrgRate
 * @returns {Promise<{ updated: number, agents: number }>}
 */
export async function recalcUnpaidCommissionsForOrganization(
  adminSupabase,
  organizationId,
  newOrgRate,
) {
  if (!organizationId) return { updated: 0, agents: 0 };
  const rate = newOrgRate == null ? 0 : Number(newOrgRate);
  if (!Number.isFinite(rate) || rate < 0) return { updated: 0, agents: 0 };

  const { data: memberships, error: memErr } = await adminSupabase
    .from('organization_memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (memErr) {
    console.error('[commissionRecalc] memberships fetch failed:', memErr.message);
    return { updated: 0, agents: 0 };
  }

  const userIds = [...new Set((memberships || []).map((m) => m.user_id).filter(Boolean))];
  if (userIds.length === 0) return { updated: 0, agents: 0 };

  const { data: profiles, error: profErr } = await adminSupabase
    .from('profiles')
    .select('id, commission_rate')
    .in('id', userIds);

  if (profErr) {
    console.error('[commissionRecalc] profiles fetch failed:', profErr.message);
    return { updated: 0, agents: 0 };
  }

  // Only members without a personal rate inherit the org rate.
  const fallbackAgents = (profiles || []).filter((p) => !Number(p.commission_rate));

  let updated = 0;
  for (const p of fallbackAgents) {
    const result = await recalcUnpaidCommissionsForAgent(adminSupabase, p.id, rate);
    updated += result.updated;
  }
  return { updated, agents: fallbackAgents.length };
}
