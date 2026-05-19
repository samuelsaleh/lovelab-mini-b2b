#!/usr/bin/env node
/**
 * Backfill missing agent_commissions rows.
 *
 * Walks every active order document and runs the SAME resolution +
 * upsert logic that lib/commissionAttribution.js uses on POST/PUT, so
 * backfilled rows match live rows byte-for-byte (same base, same rate,
 * same conflict key).
 *
 * Logic is inlined here (not imported) because the production module
 * uses Next.js path aliases (@/lib/commission) that Node CLI doesn't
 * resolve. Any logic change in commissionAttribution.js needs to be
 * mirrored here.
 *
 * Why we need it: when an order is saved while its creator's
 * agent_status is anything other than 'active', resolveCommissionAgent
 * returns null and no commission row is written. Activating the agent
 * later does NOT retroactively create those rows.
 *
 * Usage:
 *   node scripts/backfill-missing-commissions.mjs                 # dry-run
 *   node scripts/backfill-missing-commissions.mjs --apply         # write rows
 *   node scripts/backfill-missing-commissions.mjs --agent <email> # restrict to one agent
 *   node scripts/backfill-missing-commissions.mjs --doc <docId>   # restrict to one doc
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env');

function loadEnvFile(path) {
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

loadEnvFile(ENV_PATH);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(2);
}

const apply = process.argv.includes('--apply');
const agentArgIdx = process.argv.indexOf('--agent');
const agentArg = agentArgIdx >= 0 ? process.argv[agentArgIdx + 1] : null;
const docArgIdx = process.argv.indexOf('--doc');
const docArg = docArgIdx >= 0 ? process.argv[docArgIdx + 1] : null;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ─── Inlined production logic (mirrors lib/commissionAttribution.js) ────
const PROFILE_COLS =
  'id, is_agent, commission_rate, agent_status, agent_commission_config, organization_id, new_client_bonus_enabled, new_client_bonus_amount';

async function resolveCommissionAgent(client, document) {
  if (!document) return null;
  if (document.created_by) {
    const { data: creator } = await client
      .from('profiles').select(PROFILE_COLS)
      .eq('id', document.created_by).maybeSingle();
    if (creator?.is_agent && creator.agent_status === 'active') {
      return { agentId: creator.id, profile: creator, via: 'creator' };
    }
  }
  if (document.event_id) {
    const { data: evt } = await client
      .from('events').select('created_by, organization_id, type')
      .eq('id', document.event_id).maybeSingle();
    if (!evt) return null;
    if (evt.organization_id) {
      const { data: orgAgent } = await client
        .from('profiles').select(PROFILE_COLS)
        .eq('organization_id', evt.organization_id)
        .eq('is_agent', true).eq('agent_status', 'active')
        .limit(1).maybeSingle();
      if (orgAgent) return { agentId: orgAgent.id, profile: orgAgent, via: 'event_organization' };
    }
    if (evt.created_by && evt.created_by !== document.created_by) {
      const { data: ec } = await client
        .from('profiles').select(PROFILE_COLS)
        .eq('id', evt.created_by)
        .eq('is_agent', true).eq('agent_status', 'active')
        .maybeSingle();
      if (ec) return { agentId: ec.id, profile: ec, via: 'event_creator' };
    }
  }
  return null;
}

function calcAmount(base, profile) {
  // Mirrors the simple flat-rate branch of lib/commission.js. Tiered/category
  // contracts go through the live API on the next save; backfill just lays
  // down the flat-rate floor.
  let rate = Number(profile?.commission_rate) || 0;
  if (!rate && profile?.organization_id) {
    // Org rate fetched in the caller for efficiency
    rate = Number(profile.__orgRate) || 0;
  }
  const amount = Math.round(base * rate / 100 * 100) / 100;
  return { amount, rate };
}

async function upsertCommissionForDocument(client, { document, profile, agentId }) {
  if (!document?.id) return { skipped: true, reason: 'no_document' };
  if (!agentId || !profile) return { skipped: true, reason: 'no_agent' };
  const total = Number(document.total_amount);
  if (!total || total <= 0) return { skipped: true, reason: 'zero_amount' };

  const rawTaxPct = Number(
    document?.metadata?.tax_percent ??
      document?.metadata?.formState?.taxPercent ??
      0,
  );
  const taxPct =
    Number.isFinite(rawTaxPct) && rawTaxPct > 0 && rawTaxPct < 100 ? rawTaxPct : 0;
  const preTaxTotal = taxPct > 0 ? total / (1 + taxPct / 100) : total;

  const rawShipping = Number(
    document?.metadata?.shipping_amount ??
      document?.metadata?.formState?.deliveryCost ??
      0,
  );
  const shipping = Number.isFinite(rawShipping) && rawShipping > 0 ? rawShipping : 0;

  const commissionableBase = Math.max(0, Math.round((preTaxTotal - shipping) * 100) / 100);
  if (commissionableBase <= 0) return { skipped: true, reason: 'zero_after_shipping' };

  // Resolve org rate fallback
  if (!profile.commission_rate && profile.organization_id) {
    const { data: org } = await client
      .from('organizations').select('commission_rate')
      .eq('id', profile.organization_id).maybeSingle();
    profile.__orgRate = org?.commission_rate || 0;
  }

  const { amount, rate } = calcAmount(commissionableBase, profile);
  if (!amount || amount <= 0) return { skipped: true, reason: 'computed_zero' };

  const row = {
    agent_id: agentId,
    document_id: document.id,
    type: 'order',
    order_total: commissionableBase,
    commission_rate: rate,
    commission_amount: amount,
    status: 'pending',
  };

  const { error: upsertErr } = await client
    .from('agent_commissions')
    .upsert(row, { onConflict: 'agent_id,document_id,type' });
  if (!upsertErr) return { upserted: true, amount, rate };

  const isMissingConstraint =
    upsertErr.code === '42P10' ||
    /no unique or exclusion constraint matching the ON CONFLICT/i.test(upsertErr.message || '');
  if (!isMissingConstraint) throw new Error(upsertErr.message);

  // Fallback: manual lookup + insert/update (mirrors lib/commissionAttribution.js).
  const { data: existingRow } = await client
    .from('agent_commissions')
    .select('id')
    .eq('agent_id', agentId).eq('document_id', document.id).eq('type', 'order')
    .maybeSingle();
  if (existingRow) {
    const { error: updErr } = await client
      .from('agent_commissions')
      .update({ order_total: commissionableBase, commission_rate: rate, commission_amount: amount })
      .eq('id', existingRow.id);
    if (updErr) throw new Error(updErr.message);
  } else {
    const { error: insErr } = await client.from('agent_commissions').insert(row);
    if (insErr) throw new Error(insErr.message);
  }
  return { upserted: true, amount, rate };
}

// ─── Main ───────────────────────────────────────────────────────────────
console.log(`Backfill missing commissions${apply ? '' : ' (DRY RUN)'}\n`);

let creatorIds = null;
if (agentArg) {
  const { data: profiles } = await supabase
    .from('profiles').select('id, email').ilike('email', agentArg);
  if (!profiles || profiles.length === 0) {
    console.error(`No profile found for "${agentArg}"`);
    process.exit(1);
  }
  creatorIds = profiles.map((p) => p.id);
  console.log(`Filtering to ${profiles.length} profile(s) for ${agentArg}: ${creatorIds.join(', ')}\n`);
}

let q = supabase
  .from('documents')
  .select('id, created_by, event_id, total_amount, document_type, deleted_at, metadata')
  .eq('document_type', 'order')
  .is('deleted_at', null)
  .gt('total_amount', 0)
  .order('created_at', { ascending: true });
if (docArg) q = q.eq('id', docArg);
if (creatorIds && creatorIds.length === 1) q = q.eq('created_by', creatorIds[0]);
else if (creatorIds) q = q.in('created_by', creatorIds);

const { data: docs, error: docsErr } = await q;
if (docsErr) {
  console.error('Failed to fetch documents:', docsErr.message);
  process.exit(1);
}
console.log(`Inspecting ${docs.length} active order document(s)\n`);

const { data: existing } = await supabase
  .from('agent_commissions').select('agent_id, document_id, type, commission_amount');
const existingByDoc = new Map();
for (const c of existing || []) {
  if (!existingByDoc.has(c.document_id)) existingByDoc.set(c.document_id, []);
  existingByDoc.get(c.document_id).push(c);
}

let created = 0, alreadyOk = 0, noAgent = 0, skipped = 0, failed = 0;

for (const doc of docs) {
  const orderRow = (existingByDoc.get(doc.id) || []).find((c) => c.type === 'order');
  const resolved = await resolveCommissionAgent(supabase, doc);

  if (!resolved) {
    if (orderRow) { alreadyOk++; }
    else {
      noAgent++;
      console.log(`  ⚠ doc=${doc.id.slice(0, 8)}…  no active agent  total=€${doc.total_amount}`);
    }
    continue;
  }
  if (orderRow && orderRow.agent_id === resolved.agentId) { alreadyOk++; continue; }

  if (!apply) {
    console.log(`  [DRY] doc=${doc.id.slice(0, 8)}…  → ${resolved.via}=${resolved.agentId.slice(0, 8)}…  total=€${doc.total_amount}`);
    created++;
    continue;
  }

  try {
    const result = await upsertCommissionForDocument(supabase, {
      document: doc, profile: resolved.profile, agentId: resolved.agentId,
    });
    if (result.upserted) {
      console.log(`  ✓ doc=${doc.id.slice(0, 8)}…  → agent=${resolved.agentId.slice(0, 8)}…  €${result.amount} @ ${result.rate}%`);
      created++;
    } else {
      console.log(`  · doc=${doc.id.slice(0, 8)}…  skipped (${result.reason})`);
      skipped++;
    }
  } catch (err) {
    console.error(`  ✗ doc=${doc.id.slice(0, 8)}…  ${err.message}`);
    failed++;
  }
}

console.log(`\nDone:`);
console.log(`  Created/updated: ${created}`);
console.log(`  Already correct: ${alreadyOk}`);
console.log(`  No active agent: ${noAgent}`);
console.log(`  Skipped:         ${skipped}`);
console.log(`  Failed:          ${failed}`);
if (!apply) console.log(`\nRe-run with --apply to write rows.`);
