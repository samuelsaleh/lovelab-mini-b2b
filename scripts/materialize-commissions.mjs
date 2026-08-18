/**
 * Materialize real agent_commissions rows for every attributable order.
 *
 * WHY: many orders were created before their agent existed / before agent_id,
 * so no real commission row was ever written. The admin UI then shows grey
 * "Estimated / Awaiting" placeholders computed from the profile rate only —
 * which reads 0% for agents whose rate lives on their ORGANIZATION (e.g. Silke).
 *
 * This script walks every revenue order, resolves its agent with the SAME
 * resolveCommissionAgent() the app uses (agent_id first, legacy fallbacks), and
 * upserts a real row with upsertCommissionForDocument() — which itself applies
 * the effective rate (agent rate, else org rate) and the net commissionable
 * base (VAT + shipping backed out). So the numbers are identical to what the
 * app would write on a normal save.
 *
 * SAFE BY DEFAULT: dry-run. Prints the full per-agent plan and writes nothing.
 * Pass --apply to persist. Idempotent: documents that already have an order
 * commission are excluded, and preserveExisting uses ON CONFLICT DO NOTHING as
 * a second guard. Existing pending/reported/paid/cancelled rows are untouched.
 *
 *   node scripts/materialize-commissions.mjs            # dry-run
 *   node scripts/materialize-commissions.mjs --apply    # write commission rows
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCommissionAgent, upsertCommissionForDocument } from '../lib/commissionAttribution.js';
import { calculateCommission } from '../lib/commission.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(path.join(__dirname, '..', f)); } catch {}
}

const APPLY = process.argv.includes('--apply');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const EXCLUDED_CHANNELS = ['internal', 'consignment', 'delete_from_stock', 'sample'];
const eur = (n) => '\u20ac' + (Math.round((n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hr = (c = '\u2500') => c.repeat(80);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Net commissionable base — MUST mirror upsertCommissionForDocument() so the
// dry-run preview equals what --apply actually writes.
function commissionableBase(doc) {
  const total = Number(doc.total_amount) || 0;
  const rawTaxPct = Number(doc?.metadata?.tax_percent ?? doc?.metadata?.formState?.taxPercent ?? 0);
  const taxPct = Number.isFinite(rawTaxPct) && rawTaxPct > 0 && rawTaxPct < 100 ? rawTaxPct : 0;
  const preTax = taxPct > 0 ? total / (1 + taxPct / 100) : total;
  const rawShipping = Number(doc?.metadata?.shipping_amount ?? doc?.metadata?.formState?.deliveryCost ?? 0);
  const shipping = Number.isFinite(rawShipping) && rawShipping > 0 ? rawShipping : 0;
  return Math.max(0, round2(preTax - shipping));
}

// Page through every non-deleted document.
const docs = [];
let from = 0;
const PAGE = 1000;
while (true) {
  const { data: batch, error } = await supabase
    .from('documents')
    .select('id, created_by, event_id, total_amount, metadata, document_type, status, order_channel')
    .is('deleted_at', null)
    .range(from, from + PAGE - 1);
  if (error) { console.error('documents query failed:', error.message); process.exit(1); }
  docs.push(...(batch || []));
  if (!batch || batch.length < PAGE) break;
  from += PAGE;
}

const orders = docs.filter(
  (d) => d.document_type === 'order' && d.status !== 'draft' && !EXCLUDED_CHANNELS.includes(d.order_channel),
);

// Existing rows are historical financial records. Never recalculate or reset
// them here — especially paid/reported/cancelled rows. Materialize only missing
// document-linked order rows.
const { data: existingRows, error: existingErr } = await supabase
  .from('agent_commissions')
  .select('agent_id, document_id, type, status')
  .eq('type', 'order')
  .not('document_id', 'is', null);
if (existingErr) {
  console.error('existing commissions query failed:', existingErr.message);
  process.exit(1);
}
const existingDocIds = new Set((existingRows || []).map((row) => row.document_id));

console.log(hr('\u2550'));
console.log(`MATERIALIZE agent_commissions  (${APPLY ? 'APPLY' : 'DRY-RUN'}) — ${orders.length} revenue orders of ${docs.length} docs`);
console.log(`Existing document-linked order rows preserved: ${existingDocIds.size}`);
console.log(hr());

// Cache org rates so the preview can apply the same profile->org fallback.
const orgRateCache = new Map();
async function orgRate(orgId) {
  if (!orgId) return 0;
  if (orgRateCache.has(orgId)) return orgRateCache.get(orgId);
  const { data } = await supabase.from('organizations').select('commission_rate').eq('id', orgId).maybeSingle();
  const r = Number(data?.commission_rate) || 0;
  orgRateCache.set(orgId, r);
  return r;
}

// Resolve + preview each order.
const plan = []; // { doc, profile, agentId }
const expected = new Map(); // agentId -> { orders, base, commission }
const skipped = { no_agent: 0, zero_base: 0 };
let processed = 0;
for (const d of orders) {
  const res = await resolveCommissionAgent(supabase, { id: d.id, created_by: d.created_by, event_id: d.event_id });
  processed += 1;
  if (processed % 50 === 0) process.stdout.write(`  ...resolved ${processed}/${orders.length}\r`);
  if (!res?.agentId) { skipped.no_agent += 1; continue; }
  if (existingDocIds.has(d.id)) continue;
  const base = commissionableBase(d);
  if (base <= 0) { skipped.zero_base += 1; continue; }
  const profile = res.profile;
  let effRate = Number(profile.commission_rate) || 0;
  if (!effRate && profile.organization_id) effRate = await orgRate(profile.organization_id);
  const { amount } = calculateCommission(base, profile.agent_commission_config || null, effRate);
  plan.push({ doc: d, profile, agentId: res.agentId });
  if (!expected.has(res.agentId)) expected.set(res.agentId, { orders: 0, base: 0, commission: 0 });
  const e = expected.get(res.agentId);
  e.orders += 1;
  e.base = round2(e.base + base);
  e.commission = round2(e.commission + amount);
}
process.stdout.write('\n');

// Names for the report.
const agentIds = [...expected.keys()];
const nameById = new Map();
if (agentIds.length) {
  const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', agentIds);
  for (const p of profs || []) nameById.set(p.id, p.full_name || p.email);
}

const rows = [...expected.entries()]
  .map(([id, e]) => ({ name: nameById.get(id) || id, ...e }))
  .sort((a, b) => b.commission - a.commission);
const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
const totalCommission = round2(rows.reduce((s, r) => s + r.commission, 0));

console.log('MISSING rows to create (effective rate = agent rate, else org rate):');
for (const r of rows) {
  console.log(`  ${r.name.padEnd(30)} | orders=${String(r.orders).padStart(4)} | net ${eur(r.base).padStart(14)} | comm ${eur(r.commission)}`);
}
console.log(hr());
console.log(`  Missing attributable rows    : ${plan.length}`);
console.log(`  Skipped (no agent)           : ${skipped.no_agent}`);
console.log(`  Skipped (zero base)          : ${skipped.zero_base}`);
console.log(`  Total commission to write    : ${totalOrders} rows | ${eur(totalCommission)}`);

if (!APPLY) {
  console.log('\nDRY-RUN — no writes. Re-run with --apply to create the rows.');
  process.exit(0);
}

// ── APPLY ────────────────────────────────────────────────────────────────────
console.log('\nApplying...');
let written = 0;
let failed = 0;
for (const p of plan) {
  try {
    const r = await upsertCommissionForDocument(supabase, {
      document: p.doc,
      profile: p.profile,
      agentId: p.agentId,
    }, { preserveExisting: true });
    if (r?.upserted) written += 1;
  } catch (err) {
    failed += 1;
    console.error(`  upsert failed for doc ${p.doc.id}:`, err?.message);
  }
  if ((written + failed) % 50 === 0) process.stdout.write(`  ...wrote ${written}/${plan.length}\r`);
}
process.stdout.write('\n');
if (failed) { console.error(`  ${failed} upsert(s) failed — investigate before trusting totals.`); }

// ── INVARIANT: re-read agent_commissions order rows and confirm no double-count ─
// For each affected agent: exactly one order row per resolved doc, and the
// summed commission equals the planned preview (to the cent).
const affected = agentIds;
const actual = new Map(); // agentId -> { rows, docIds:Set, commission }
{
  const { data: comms, error } = await supabase
    .from('agent_commissions')
    .select('agent_id, document_id, type, commission_amount, status')
    .in('agent_id', affected)
    .eq('type', 'order')
    .not('document_id', 'is', null);
  if (error) { console.error('verify query failed:', error.message); process.exit(1); }
  const planDocIds = new Set(plan.map((p) => p.doc.id));
  for (const c of comms || []) {
    if (!planDocIds.has(c.document_id)) continue; // ignore rows outside this run's scope
    if (!actual.has(c.agent_id)) actual.set(c.agent_id, { rows: 0, docIds: new Set(), commission: 0 });
    const e = actual.get(c.agent_id);
    e.rows += 1;
    e.docIds.add(c.document_id);
    e.commission = round2(e.commission + (Number(c.commission_amount) || 0));
  }
}

let pass = true;
console.log(hr('\u2550'));
console.log('INVARIANT CHECK (per agent: no duplicate rows, commission matches plan):');
for (const id of affected) {
  const exp = expected.get(id);
  const act = actual.get(id) || { rows: 0, docIds: new Set(), commission: 0 };
  const noDup = act.rows === act.docIds.size;              // one row per document
  const countOk = act.docIds.size === exp.orders;          // every planned doc present
  const sumOk = Math.abs(act.commission - exp.commission) < 0.01;
  const ok = noDup && countOk && sumOk;
  if (!ok) pass = false;
  console.log(
    `  ${(nameById.get(id) || id).padEnd(30)} | plan ${exp.orders}@${eur(exp.commission)} ` +
    `| db ${act.docIds.size}@${eur(act.commission)} | ${ok ? 'PASS' : 'FAIL'}` +
    `${noDup ? '' : ' [DUP ROWS]'}${countOk ? '' : ' [COUNT]'}${sumOk ? '' : ' [SUM]'}`,
  );
}
console.log(hr());
console.log(`  RESULT: ${pass ? 'PASS - real rows match the plan, no double-count' : 'FAIL - investigate above'}`);
process.exit(pass ? 0 : 1);
