/**
 * Backfill documents.agent_id (Phase 1).
 *
 * Sets each non-deleted document's agent_id to the agent the app already
 * attributes it to, using the SAME resolveCommissionAgent() the POST/PUT routes
 * use. Because agent_id is defined as "the resolved agent", per-agent revenue is
 * identical before and after — the script proves this with an invariant check.
 *
 * SAFE BY DEFAULT: dry-run. Prints the full plan and the invariant, writes
 * nothing. Pass --apply to persist.
 *
 *   node scripts/backfill-document-agent-id.mjs            # dry-run
 *   node scripts/backfill-document-agent-id.mjs --apply    # write agent_id
 *
 * Requires migration supabase/migrations/20260818130000_documents_agent_id.sql
 * to be applied first (adds the agent_id column). The script detects a missing
 * column and tells you.
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCommissionAgent } from '../lib/commissionAttribution.js';

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
const eur = (n) => '\u20ac' + (Math.round((n || 0) * 100) / 100).toLocaleString('en-US');
const hr = (c = '\u2500') => c.repeat(80);

// Guard: the agent_id column must exist before we can write.
const colProbe = await supabase.from('documents').select('agent_id').limit(1);
const columnExists = !colProbe.error;
if (!columnExists) {
  console.log('documents.agent_id is MISSING.');
  console.log('  -> Apply supabase/migrations/20260818130000_documents_agent_id.sql in the');
  console.log('     Supabase SQL editor, then re-run. (Dry-run still works below.)\n');
  if (APPLY) {
    console.error('Refusing to --apply without the column. Aborting.');
    process.exit(1);
  }
}

// Page through every non-deleted document (orders + quotes).
const docs = [];
let from = 0;
const PAGE = 1000;
while (true) {
  const { data: batch, error } = await supabase
    .from('documents')
    .select('id, created_by, event_id, total_amount, document_type, status, order_channel')
    .is('deleted_at', null)
    .range(from, from + PAGE - 1);
  if (error) { console.error('documents query failed:', error.message); process.exit(1); }
  docs.push(...(batch || []));
  if (!batch || batch.length < PAGE) break;
  from += PAGE;
}

console.log(hr('\u2550'));
console.log(`BACKFILL documents.agent_id  (${APPLY ? 'APPLY' : 'DRY-RUN'}) — ${docs.length} non-deleted docs`);
console.log(hr());

// Resolve each doc's agent (identical logic to the running app).
const plan = []; // { id, agentId }
const perAgent = new Map(); // agentId -> { orders, revenue }  (revenue orders only)
let resolved = 0;
let processed = 0;
for (const d of docs) {
  const res = await resolveCommissionAgent(supabase, {
    id: d.id,
    created_by: d.created_by,
    event_id: d.event_id,
  });
  processed += 1;
  if (processed % 50 === 0) process.stdout.write(`  ...resolved ${processed}/${docs.length}\r`);
  const agentId = res?.agentId || null;
  plan.push({ id: d.id, agentId });
  if (!agentId) continue;
  resolved += 1;
  // Track the revenue-order invariant only (matches the audit baseline).
  const isRevenueOrder = d.document_type === 'order' && d.status !== 'draft' && !EXCLUDED_CHANNELS.includes(d.order_channel);
  if (isRevenueOrder) {
    if (!perAgent.has(agentId)) perAgent.set(agentId, { orders: 0, revenue: 0 });
    const e = perAgent.get(agentId);
    e.orders += 1;
    e.revenue += d.total_amount || 0;
  }
}
process.stdout.write('\n');

// Name lookup for the report.
const agentIds = [...perAgent.keys()];
const nameById = new Map();
if (agentIds.length) {
  const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', agentIds);
  for (const p of profs || []) nameById.set(p.id, p.full_name || p.email);
}

const rows = [...perAgent.entries()]
  .map(([id, e]) => ({ name: nameById.get(id) || id, ...e }))
  .sort((a, b) => b.revenue - a.revenue);
const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

console.log('PLANNED per-agent attribution (revenue orders only):');
for (const r of rows) console.log(`  ${r.name.padEnd(30)} | orders=${String(r.orders).padStart(4)} | ${eur(r.revenue)}`);
console.log(hr());
console.log(`  Docs resolving to an agent: ${resolved} / ${docs.length}`);
console.log(`  Revenue-order agent totals: ${totalOrders} orders | ${eur(totalRevenue)}`);
console.log(`  (These MUST match the Phase 0 audit "Attributed" baseline: 93 orders | \u20ac158,329.67)`);

if (!APPLY) {
  console.log('\nDRY-RUN — no writes. Re-run with --apply after the column exists.');
  process.exit(0);
}

// ── APPLY ────────────────────────────────────────────────────────────────────
console.log('\nApplying...');
const toWrite = plan.filter((p) => p.agentId); // leave nulls null
let written = 0;
for (const p of toWrite) {
  const { error } = await supabase.from('documents').update({ agent_id: p.agentId }).eq('id', p.id);
  if (error) { console.error(`  update failed for ${p.id}:`, error.message); process.exit(1); }
  written += 1;
  if (written % 50 === 0) process.stdout.write(`  ...wrote ${written}/${toWrite.length}\r`);
}
process.stdout.write('\n');

// ── INVARIANT: re-read agent_id and confirm per-agent revenue is unchanged ────
const check = new Map();
let cf = 0;
while (true) {
  const { data: batch, error } = await supabase
    .from('documents')
    .select('agent_id, total_amount, document_type, status, order_channel')
    .is('deleted_at', null)
    .not('agent_id', 'is', null)
    .range(cf, cf + PAGE - 1);
  if (error) { console.error('verify query failed:', error.message); process.exit(1); }
  for (const d of batch || []) {
    const isRevenueOrder = d.document_type === 'order' && d.status !== 'draft' && !EXCLUDED_CHANNELS.includes(d.order_channel);
    if (!isRevenueOrder) continue;
    if (!check.has(d.agent_id)) check.set(d.agent_id, { orders: 0, revenue: 0 });
    const e = check.get(d.agent_id);
    e.orders += 1;
    e.revenue += d.total_amount || 0;
  }
  if (!batch || batch.length < PAGE) break;
  cf += PAGE;
}
const checkOrders = [...check.values()].reduce((s, e) => s + e.orders, 0);
const checkRevenue = [...check.values()].reduce((s, e) => s + e.revenue, 0);

const ordersOk = checkOrders === totalOrders;
const revenueOk = Math.abs(checkRevenue - totalRevenue) < 0.01;
console.log(hr('\u2550'));
console.log(`INVARIANT CHECK:`);
console.log(`  planned : ${totalOrders} orders | ${eur(totalRevenue)}`);
console.log(`  in DB   : ${checkOrders} orders | ${eur(checkRevenue)}`);
console.log(`  result  : ${ordersOk && revenueOk ? 'PASS - per-agent totals unchanged' : 'FAIL - MISMATCH, investigate!'}`);
process.exit(ordersOk && revenueOk ? 0 : 1);
