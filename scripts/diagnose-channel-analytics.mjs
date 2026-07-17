/**
 * Diagnostic — are B2B / B2C analytics numbers correct?
 * Read-only. Run: node scripts/diagnose-channel-analytics.mjs
 *
 * Reproduces what AnalyticsDashboard computes and compares it against
 * a channel-by-channel breakdown straight from the documents table.
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(path.join(__dirname, '..', f)); } catch {}
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Fetch all non-deleted documents (paginated)
const all = [];
let from = 0;
const STEP = 1000;
while (true) {
  const { data, error } = await supabase
    .from('documents')
    .select('id, document_type, order_channel, status, total_amount, client_company, client_name, event_id, created_at, deleted_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .range(from, from + STEP - 1);
  if (error) { console.error('fetch failed:', error.message); process.exit(1); }
  all.push(...data);
  if (data.length < STEP) break;
  from += STEP;
}

console.log(`Total non-deleted documents: ${all.length}\n`);

const eur = (n) => `€${Math.round(n).toLocaleString('en-GB')}`;

// ── 1. Raw breakdown by channel × type × status ─────────────────────────────
const byChannel = new Map();
for (const d of all) {
  const ch = d.order_channel || '(null)';
  if (!byChannel.has(ch)) byChannel.set(ch, { docs: 0, orders: 0, quotes: 0, drafts: 0, revenue: 0 });
  const e = byChannel.get(ch);
  e.docs++;
  if (d.status === 'draft') { e.drafts++; continue; }
  if (d.document_type === 'order') { e.orders++; e.revenue += d.total_amount || 0; }
  if (d.document_type === 'quote') e.quotes++;
}
console.log('── Breakdown by order_channel (drafts excluded from orders/revenue) ──');
for (const [ch, e] of byChannel) {
  console.log(`  ${ch.padEnd(18)} docs=${String(e.docs).padStart(4)}  orders=${String(e.orders).padStart(4)}  quotes=${String(e.quotes).padStart(3)}  drafts=${String(e.drafts).padStart(3)}  revenue=${eur(e.revenue)}`);
}

// ── 2. What AnalyticsDashboard shows today ──────────────────────────────────
// loadAnalytics(): drop internal + sample; docs memo: drop drafts
const loaded = all.filter(d => d.order_channel !== 'internal' && d.order_channel !== 'sample');
const nonDraft = loaded.filter(d => d.status !== 'draft');

const revenueOf = (docs) => docs.filter(d => d.document_type === 'order').reduce((s, d) => s + (d.total_amount || 0), 0);
const ordersOf = (docs) => docs.filter(d => d.document_type === 'order').length;

const scopeAll = nonDraft;
const scopeB2B = nonDraft.filter(d => d.order_channel !== 'b2c');
const scopeB2C = nonDraft.filter(d => d.order_channel === 'b2c');

console.log('\n── What the dashboard currently shows ──');
console.log(`  All : revenue=${eur(revenueOf(scopeAll))}  orders=${ordersOf(scopeAll)}`);
console.log(`  B2B : revenue=${eur(revenueOf(scopeB2B))}  orders=${ordersOf(scopeB2B)}`);
console.log(`  B2C : revenue=${eur(revenueOf(scopeB2C))}  orders=${ordersOf(scopeB2C)}`);

// ── 3. What it SHOULD show (consignment + write-offs are not revenue) ───────
const clean = nonDraft.filter(d => !['consignment', 'delete_from_stock'].includes(d.order_channel));
const cleanB2B = clean.filter(d => d.order_channel !== 'b2c');
console.log('\n── What it should show (excluding consignment + write-offs) ──');
console.log(`  All : revenue=${eur(revenueOf(clean))}  orders=${ordersOf(clean)}`);
console.log(`  B2B : revenue=${eur(revenueOf(cleanB2B))}  orders=${ordersOf(cleanB2B)}`);
console.log(`  B2C : revenue=${eur(revenueOf(scopeB2C))}  orders=${ordersOf(scopeB2C)}`);

// ── 4. The polluting documents, listed ───────────────────────────────────────
const polluting = nonDraft.filter(d => ['consignment', 'delete_from_stock'].includes(d.order_channel) && d.document_type === 'order');
if (polluting.length) {
  console.log(`\n── Consignment / write-off orders currently inflating B2B + All (${polluting.length}) ──`);
  for (const d of polluting.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0))) {
    console.log(`  [${d.order_channel}] ${(d.client_company || d.client_name || 'Unknown').padEnd(35)} ${eur(d.total_amount || 0).padStart(10)}  ${d.created_at.slice(0, 10)}`);
  }
}

// ── 5. B2C sanity: totals & suspicious values ────────────────────────────────
const b2cOrders = scopeB2C.filter(d => d.document_type === 'order');
if (b2cOrders.length) {
  console.log(`\n── B2C orders (${b2cOrders.length}) ──`);
  for (const d of b2cOrders.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
    console.log(`  ${(d.client_company || d.client_name || 'Unknown').padEnd(35)} ${eur(d.total_amount || 0).padStart(10)}  status=${d.status || '—'}  ${d.created_at.slice(0, 10)}`);
  }
}
