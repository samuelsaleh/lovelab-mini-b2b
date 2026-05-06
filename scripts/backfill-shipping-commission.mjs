/**
 * Backfill: recompute every existing agent_commissions row of type='order'
 * onto the post-shipping rule (commission base = total_amount − shipping).
 *
 * Why: Phase 19c made the new rule forward-only. Existing rows were inserted
 * with the old "commission = total × rate" math. This script realigns them
 * so each agent's "Total Earned" matches the formula the company actually
 * applies going forward.
 *
 * Usage:
 *   node scripts/backfill-shipping-commission.mjs           # DRY RUN — no writes
 *   node scripts/backfill-shipping-commission.mjs --apply   # actually update
 *   node scripts/backfill-shipping-commission.mjs --agent <agent_id>  # one agent
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars.
 * Idempotent: running twice produces zero changes the second time.
 *
 * Scope:
 *   - Only rows with type='order'. Bonuses (type='bonus') have no
 *     document_id and aren't tied to shipping.
 *   - Skips status='cancelled' (already excluded from agent totals by the
 *     /api/agents and /api/commissions aggregators since Phase 18).
 *   - Recomputes status='pending' and status='paid' alike. Sam's call:
 *     the ledger should match the policy, payouts can be reconciled via
 *     the new agent_payments edit/delete flow if needed.
 */

import { createClient } from '@supabase/supabase-js';
import { calculateCommission } from '../lib/commission.js';

// Auto-load .env.local then .env so the script "just works" from the repo
// root without the operator having to `export` the keys first. Node 20+
// ships process.loadEnvFile.
for (const f of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file missing — ignore */
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const agentArgIdx = process.argv.indexOf('--agent');
const ONLY_AGENT = agentArgIdx >= 0 ? process.argv[agentArgIdx + 1] : null;

const supabase = createClient(supabaseUrl, serviceKey);

// Same shipping-resolution order as lib/commissionAttribution.js.
function resolveShipping(doc) {
  const raw = Number(
    doc?.metadata?.shipping_amount ??
      doc?.metadata?.formState?.deliveryCost ??
      0,
  );
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function fmtEur(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function round(n, decimals = 2) {
  return Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

async function main() {
  console.log('━'.repeat(72));
  console.log(`Shipping-commission backfill — ${APPLY ? 'APPLY MODE' : 'DRY RUN'}`);
  if (ONLY_AGENT) console.log(`Scoped to agent: ${ONLY_AGENT}`);
  console.log('━'.repeat(72));

  // 1. Pull every commission row of type='order' that's not cancelled.
  let q = supabase
    .from('agent_commissions')
    .select('id, agent_id, document_id, order_total, commission_rate, commission_amount, status, type')
    .eq('type', 'order')
    .neq('status', 'cancelled');
  if (ONLY_AGENT) q = q.eq('agent_id', ONLY_AGENT);

  const { data: commissions, error: cErr } = await q;
  if (cErr) {
    console.error('Failed to fetch agent_commissions:', cErr.message);
    process.exit(1);
  }
  console.log(`Loaded ${commissions.length} order commission rows.`);

  if (commissions.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // 2. Bulk-fetch all referenced documents (need total_amount + metadata).
  const docIds = [...new Set(commissions.map((c) => c.document_id).filter(Boolean))];
  const { data: docs, error: dErr } = await supabase
    .from('documents')
    .select('id, total_amount, metadata, deleted_at')
    .in('id', docIds);
  if (dErr) {
    console.error('Failed to fetch documents:', dErr.message);
    process.exit(1);
  }
  const docById = new Map(docs.map((d) => [d.id, d]));

  // 3. Bulk-fetch every agent profile we'll need (rate + config + org).
  const agentIds = [...new Set(commissions.map((c) => c.agent_id))];
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, commission_rate, agent_commission_config, organization_id')
    .in('id', agentIds);
  if (pErr) {
    console.error('Failed to fetch profiles:', pErr.message);
    process.exit(1);
  }
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  // 4. For any agent whose profile.commission_rate is 0/null, look up the
  //    org's commission_rate (mirrors the upsertCommissionForDocument fallback).
  const orgIds = [
    ...new Set(profiles.filter((p) => !p.commission_rate && p.organization_id).map((p) => p.organization_id)),
  ];
  const orgRateById = new Map();
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, commission_rate')
      .in('id', orgIds);
    (orgs || []).forEach((o) => orgRateById.set(o.id, Number(o.commission_rate) || 0));
  }

  // 5. Walk each commission row, compute new figures, queue diffs.
  const updates = [];
  const perAgent = new Map();
  let skippedNoDoc = 0;
  let skippedSoftDeleted = 0;
  let skippedNoChange = 0;

  for (const c of commissions) {
    const doc = docById.get(c.document_id);
    if (!doc) {
      skippedNoDoc++;
      continue;
    }
    if (doc.deleted_at) {
      // Soft-deleted docs should already have a cancelled commission via the
      // cascade. If not, the Phase 18 fix masks them from totals anyway.
      skippedSoftDeleted++;
      continue;
    }

    const profile = profileById.get(c.agent_id);
    if (!profile) {
      skippedNoDoc++;
      continue;
    }

    const total = Number(doc.total_amount) || 0;
    const shipping = resolveShipping(doc);
    const newBase = Math.max(0, total - shipping);

    let effectiveRate = Number(profile.commission_rate) || 0;
    if (!effectiveRate && profile.organization_id) {
      effectiveRate = orgRateById.get(profile.organization_id) || 0;
    }

    const calc = calculateCommission(newBase, profile.agent_commission_config || null, effectiveRate);
    const newAmount = round(calc.amount);
    const newRate = round(calc.rate, 4);

    const oldAmount = Number(c.commission_amount) || 0;
    const oldTotal = Number(c.order_total) || 0;

    // No-op if the row is already aligned (within 0.01 €).
    const sameAmount = Math.abs(newAmount - oldAmount) < 0.005;
    const sameTotal = Math.abs(newBase - oldTotal) < 0.005;
    if (sameAmount && sameTotal) {
      skippedNoChange++;
      continue;
    }

    updates.push({
      id: c.id,
      agent_id: c.agent_id,
      old_total: oldTotal,
      new_total: newBase,
      old_amount: oldAmount,
      new_amount: newAmount,
      new_rate: newRate,
      shipping,
    });

    const bucket = perAgent.get(c.agent_id) || {
      name: profile.full_name || profile.email || c.agent_id,
      rows: 0,
      old_sum: 0,
      new_sum: 0,
      shipping_sum: 0,
    };
    bucket.rows++;
    bucket.old_sum += oldAmount;
    bucket.new_sum += newAmount;
    bucket.shipping_sum += shipping;
    perAgent.set(c.agent_id, bucket);
  }

  // 6. Print per-agent before/after.
  console.log('');
  console.log('Per-agent impact:');
  console.log('─'.repeat(72));
  const sorted = [...perAgent.values()].sort((a, b) => b.old_sum - a.old_sum);
  let grandOld = 0;
  let grandNew = 0;
  for (const a of sorted) {
    grandOld += a.old_sum;
    grandNew += a.new_sum;
    const delta = a.new_sum - a.old_sum;
    const arrow = delta < 0 ? '↓' : '↑';
    console.log(
      `  ${a.name.padEnd(28)}  ${a.rows.toString().padStart(3)} rows   ` +
        `${fmtEur(a.old_sum).padStart(11)} → ${fmtEur(a.new_sum).padStart(11)}   ` +
        `${arrow} ${fmtEur(Math.abs(delta))}`,
    );
  }
  console.log('─'.repeat(72));
  console.log(
    `  TOTALS                       ${updates.length.toString().padStart(3)} rows   ` +
      `${fmtEur(grandOld).padStart(11)} → ${fmtEur(grandNew).padStart(11)}   ` +
      `delta ${fmtEur(grandNew - grandOld)}`,
  );
  console.log(
    `  Skipped: ${skippedNoChange} already correct, ${skippedSoftDeleted} soft-deleted, ${skippedNoDoc} missing doc/profile`,
  );

  if (updates.length === 0) {
    console.log('\nNo changes needed. Done.');
    return;
  }

  // 7. Apply (or stop here in dry-run).
  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to commit these changes.');
    return;
  }

  console.log(`\nApplying ${updates.length} updates...`);
  let ok = 0;
  let fail = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from('agent_commissions')
      .update({
        order_total: u.new_total,
        commission_amount: u.new_amount,
        commission_rate: u.new_rate,
      })
      .eq('id', u.id);
    if (error) {
      fail++;
      console.error(`  [FAIL] ${u.id}: ${error.message}`);
    } else {
      ok++;
    }
  }
  console.log(`Done. ${ok} updated, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Backfill crashed:', err);
  process.exit(1);
});
