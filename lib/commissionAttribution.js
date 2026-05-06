/**
 * Commission attribution helpers.
 *
 * Single source of truth for "which agent owns this document's commission?".
 * Used by:
 *   - app/api/documents/route.js POST  (commission auto-create on save)
 *   - app/api/documents/[id]/route.js PUT  (commission recalc on edit)
 *
 * Resolution order — this MUST match between POST and PUT or commissions
 * disappear when an order is edited:
 *   1. The document's creator is themselves an active agent → use them.
 *   2. The document is linked to an event whose organization_id has an
 *      active agent → use that agent (covers folder-shared workflows).
 *   3. The event was itself created by a different active agent → use them.
 *   4. No match → return null.
 */

import { calculateCommission } from '@/lib/commission';

const PROFILE_COLS =
  'id, is_agent, commission_rate, agent_status, agent_commission_config, organization_id';

/**
 * Resolve the agent who should own the commission for a document.
 *
 * @param {object} adminSupabase Service-role Supabase client.
 * @param {{ id: string, created_by: string|null, event_id: string|null }} document
 * @returns {Promise<{ agentId: string, profile: object, via: string } | null>}
 */
export async function resolveCommissionAgent(adminSupabase, document) {
  if (!document) return null;

  // Tier 1 — creator is themselves an agent.
  if (document.created_by) {
    const { data: creator } = await adminSupabase
      .from('profiles')
      .select(PROFILE_COLS)
      .eq('id', document.created_by)
      .maybeSingle();
    if (creator?.is_agent && creator.agent_status === 'active') {
      return { agentId: creator.id, profile: creator, via: 'creator' };
    }
  }

  // Tier 2 / 3 — go through the linked event.
  if (document.event_id) {
    const { data: evt } = await adminSupabase
      .from('events')
      .select('created_by, organization_id, type')
      .eq('id', document.event_id)
      .maybeSingle();
    if (!evt) return null;

    // Tier 2 — agent in event's organization.
    if (evt.organization_id) {
      const { data: orgAgent } = await adminSupabase
        .from('profiles')
        .select(PROFILE_COLS)
        .eq('organization_id', evt.organization_id)
        .eq('is_agent', true)
        .eq('agent_status', 'active')
        .limit(1)
        .maybeSingle();
      if (orgAgent) {
        return { agentId: orgAgent.id, profile: orgAgent, via: 'event_organization' };
      }
    }

    // Tier 3 — event creator (skip if same as doc creator, already checked).
    if (evt.created_by && evt.created_by !== document.created_by) {
      const { data: eventCreator } = await adminSupabase
        .from('profiles')
        .select(PROFILE_COLS)
        .eq('id', evt.created_by)
        .eq('is_agent', true)
        .eq('agent_status', 'active')
        .maybeSingle();
      if (eventCreator) {
        return { agentId: eventCreator.id, profile: eventCreator, via: 'event_creator' };
      }
    }
  }

  return null;
}

/**
 * Upsert an agent_commissions row for the given document + agent profile.
 * Picks the effective rate from agent → org → 0, then runs the shared
 * calculateCommission() helper. Throws on DB error so the caller's catch
 * can `recordHealthEvent`.
 *
 * @returns {Promise<{ upserted: true, amount: number, rate: number }
 *          | { skipped: true, reason: string }>}
 */
export async function upsertCommissionForDocument(
  adminSupabase,
  { document, profile, agentId },
) {
  if (!document || !document.id) {
    return { skipped: true, reason: 'no_document' };
  }
  if (!agentId || !profile) {
    return { skipped: true, reason: 'no_agent' };
  }
  const total = Number(document.total_amount);
  if (!total || total <= 0) {
    return { skipped: true, reason: 'zero_amount' };
  }

  // Commission base = order total minus shipping. Tax and any custom line
  // remain inside the base (per product decision). Read order:
  //   1. metadata.shipping_amount  (canonical, set by OrderForm.jsx)
  //   2. metadata.formState.deliveryCost  (back-compat — older docs)
  //   3. 0 (oldest docs without either field — same behaviour as before)
  // Negative or non-finite values are clamped to 0 so a junk metadata blob
  // can never inflate commissions above the order total.
  const rawShipping = Number(
    document?.metadata?.shipping_amount ??
      document?.metadata?.formState?.deliveryCost ??
      0,
  );
  const shipping = Number.isFinite(rawShipping) && rawShipping > 0 ? rawShipping : 0;
  const commissionableBase = Math.max(0, total - shipping);

  if (commissionableBase <= 0) {
    return { skipped: true, reason: 'zero_after_shipping' };
  }

  let effectiveRate = profile.commission_rate || 0;
  if (!effectiveRate && profile.organization_id) {
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('commission_rate')
      .eq('id', profile.organization_id)
      .maybeSingle();
    effectiveRate = org?.commission_rate || 0;
  }

  const { amount, rate } = calculateCommission(
    commissionableBase,
    profile.agent_commission_config || null,
    effectiveRate,
  );

  if (!amount || amount <= 0) {
    return { skipped: true, reason: 'computed_zero' };
  }

  // Persist the post-shipping base as order_total so the agent dashboard's
  // "revenue" column shows the figure the commission was actually paid on.
  // The document's own total_amount is unchanged.
  const { error } = await adminSupabase
    .from('agent_commissions')
    .upsert(
      {
        agent_id: agentId,
        document_id: document.id,
        type: 'order',
        order_total: commissionableBase,
        commission_rate: rate,
        commission_amount: amount,
        status: 'pending',
      },
      { onConflict: 'agent_id,document_id' },
    );

  if (error) {
    const enriched = new Error(error.message || 'Commission upsert failed');
    enriched.code = error.code || null;
    enriched.details = error.details || null;
    throw enriched;
  }

  return { upserted: true, amount, rate };
}
