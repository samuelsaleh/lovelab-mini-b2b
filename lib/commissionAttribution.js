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
  'id, is_agent, commission_rate, agent_status, agent_commission_config, organization_id, new_client_bonus_enabled, new_client_bonus_amount';

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
    // Invited agents can already sign in and create orders. Treat their own
    // orders as attributable too; otherwise their ledger remains a synthetic
    // read-only fallback until an admin happens to run Repair.
    if (creator?.is_agent && ['active', 'invited'].includes(creator.agent_status)) {
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

  // ─── Commission base ───────────────────────────────────────────────────
  // Agents are paid on NET revenue: the pre-VAT amount minus shipping.
  // `total_amount` is the post-VAT grand total, so we have to back the VAT
  // out first or the agent earns commission on the customer's tax money.
  //
  // Read order:
  //   1. metadata.tax_percent          (canonical when set explicitly)
  //   2. metadata.formState.taxPercent (saved by OrderForm.jsx today)
  //   3. 0  (older docs without either — preserves pre-fix behaviour)
  //
  // Shipping is excluded from the base too (unchanged):
  //   1. metadata.shipping_amount
  //   2. metadata.formState.deliveryCost
  //   3. 0
  //
  // All values are clamped — negative / non-finite / out-of-range tax
  // percentages cannot inflate or invert the commission base.
  const rawTaxPct = Number(
    document?.metadata?.tax_percent ??
      document?.metadata?.formState?.taxPercent ??
      0,
  );
  const taxPct =
    Number.isFinite(rawTaxPct) && rawTaxPct > 0 && rawTaxPct < 100
      ? rawTaxPct
      : 0;
  const preTaxTotal = taxPct > 0 ? total / (1 + taxPct / 100) : total;

  const rawShipping = Number(
    document?.metadata?.shipping_amount ??
      document?.metadata?.formState?.deliveryCost ??
      0,
  );
  const shipping = Number.isFinite(rawShipping) && rawShipping > 0 ? rawShipping : 0;

  // Round to 2 decimals so the persisted `order_total` matches the cent the
  // customer was actually invoiced for (avoids 1320.0413223... noise).
  const commissionableBase = Math.max(
    0,
    Math.round((preTaxTotal - shipping) * 100) / 100,
  );

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

  // Persist a real ledger row even when the configured rate is currently 0.
  // It keeps invoice/customer-paid workflow editable and will recalculate when
  // the administrator later assigns a rate.

  // Persist the post-shipping base as order_total so the agent dashboard's
  // "revenue" column shows the figure the commission was actually paid on.
  // The document's own total_amount is unchanged.
  const row = {
    agent_id: agentId,
    document_id: document.id,
    type: 'order',
    order_total: commissionableBase,
    commission_rate: rate,
    commission_amount: amount,
    status: 'pending',
  };

  // Fast path: relies on the (agent_id, document_id, type) unique index added
  // by supabase-phase19d-bonus-unique-fix.sql. If that migration hasn't been
  // run on a given environment, Postgres returns 42P10 ("no unique or
  // exclusion constraint matching the ON CONFLICT specification") and we fall
  // back to a manual select-then-insert/update. This keeps commissions flowing
  // even on stale schemas — the migration is still the right long-term fix
  // (race protection, bonus support) but a missing one no longer silently
  // drops every agent's commission.
  const { error: upsertErr } = await adminSupabase
    .from('agent_commissions')
    .upsert(row, { onConflict: 'agent_id,document_id,type' });

  if (!upsertErr) {
    return { upserted: true, amount, rate };
  }

  const isMissingConstraint =
    upsertErr.code === '42P10' ||
    /no unique or exclusion constraint matching the ON CONFLICT/i.test(upsertErr.message || '');

  if (!isMissingConstraint) {
    const enriched = new Error(upsertErr.message || 'Commission upsert failed');
    enriched.code = upsertErr.code || null;
    enriched.details = upsertErr.details || null;
    throw enriched;
  }

  // Manual fallback: emulate the upsert via a lookup + insert/update.
  const { data: existing, error: lookupErr } = await adminSupabase
    .from('agent_commissions')
    .select('id, status')
    .eq('agent_id', agentId)
    .eq('document_id', document.id)
    .eq('type', 'order')
    .maybeSingle();
  if (lookupErr) {
    const enriched = new Error(lookupErr.message || 'Commission lookup failed');
    enriched.code = lookupErr.code || null;
    throw enriched;
  }

  if (existing) {
    // Preserve any user-set status (paid/cancelled) — only refresh the numbers.
    const { error: updErr } = await adminSupabase
      .from('agent_commissions')
      .update({
        order_total: commissionableBase,
        commission_rate: rate,
        commission_amount: amount,
      })
      .eq('id', existing.id);
    if (updErr) {
      const enriched = new Error(updErr.message || 'Commission update failed');
      enriched.code = updErr.code || null;
      throw enriched;
    }
    return { upserted: true, amount, rate };
  }

  const { error: insErr } = await adminSupabase
    .from('agent_commissions')
    .insert(row);
  if (insErr) {
    const enriched = new Error(insErr.message || 'Commission insert failed');
    enriched.code = insErr.code || null;
    throw enriched;
  }
  return { upserted: true, amount, rate };
}
