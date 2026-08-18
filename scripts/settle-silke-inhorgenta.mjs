/**
 * Settle Silke Holdinghausen's seven INHORGENTA 2026 commissions.
 *
 * The money was paid outside this app. We preserve an auditable representation:
 *   - the seven real commission rows become paid;
 *   - customer_paid_at and paid_at are stamped;
 *   - one matching agent_payments ledger row records the €2,745.75 payout.
 *
 * SAFE BY DEFAULT and idempotent:
 *   node scripts/settle-silke-inhorgenta.mjs
 *   node scripts/settle-silke-inhorgenta.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const EXPECTED_ORDER_COUNT = 7;
const EXPECTED_RATE = 15;
const EXPECTED_PAYOUT = 2745.75;
const PAYMENT_NOTE = 'INHORGENTA Feb 2026 — settled outside app';
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const eur = (n) => `€${round2(n).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;
const fail = (message) => {
  console.error(`REFUSING TO APPLY: ${message}`);
  process.exit(1);
};

const { data: silke, error: silkeErr } = await supabase
  .from('profiles')
  .select('id, full_name, email')
  .eq('email', 'silke@holdinghausen.com')
  .maybeSingle();
if (silkeErr || !silke) fail(`Silke profile not found (${silkeErr?.message || 'no row'})`);

const { data: fairs, error: fairErr } = await supabase
  .from('events')
  .select('id, name, type')
  .ilike('name', 'INHORGENTA')
  .eq('type', 'fair');
if (fairErr) fail(`INHORGENTA lookup failed: ${fairErr.message}`);
if ((fairs || []).length !== 1) {
  fail(`expected exactly one INHORGENTA fair, found ${(fairs || []).length}`);
}
const fair = fairs[0];

const { data: docs, error: docsErr } = await supabase
  .from('documents')
  .select('id, client_company, client_name, total_amount, event_id, agent_id')
  .eq('agent_id', silke.id)
  .eq('event_id', fair.id)
  .eq('document_type', 'order')
  .is('deleted_at', null);
if (docsErr) fail(`INHORGENTA documents lookup failed: ${docsErr.message}`);
if ((docs || []).length !== EXPECTED_ORDER_COUNT) {
  fail(`expected ${EXPECTED_ORDER_COUNT} Silke INHORGENTA orders, found ${(docs || []).length}`);
}

const docIds = docs.map((doc) => doc.id);
const { data: commissions, error: commErr } = await supabase
  .from('agent_commissions')
  .select('id, document_id, status, commission_rate, commission_amount, order_total, paid_at, customer_paid_at')
  .eq('agent_id', silke.id)
  .eq('type', 'order')
  .in('document_id', docIds);
if (commErr) fail(`commission lookup failed: ${commErr.message}`);
if ((commissions || []).length !== EXPECTED_ORDER_COUNT) {
  fail(`expected ${EXPECTED_ORDER_COUNT} real commission rows, found ${(commissions || []).length}`);
}

const uniqueDocs = new Set(commissions.map((row) => row.document_id));
if (uniqueDocs.size !== EXPECTED_ORDER_COUNT) fail('duplicate or missing commission document links detected');
if (commissions.some((row) => Number(row.commission_rate) !== EXPECTED_RATE)) {
  fail(`every INHORGENTA row must be at ${EXPECTED_RATE}%`);
}
const payout = round2(commissions.reduce(
  (sum, row) => sum + (Number(row.commission_amount) || 0),
  0,
));
if (payout !== EXPECTED_PAYOUT) {
  fail(`commission sum is ${eur(payout)}, expected ${eur(EXPECTED_PAYOUT)}`);
}
if (commissions.some((row) => row.status === 'cancelled')) {
  fail('a cancelled INHORGENTA commission cannot be marked paid');
}

// Confirm the orders that must remain outstanding are still linked to Silke.
const { data: nordstil } = await supabase
  .from('events')
  .select('id')
  .ilike('name', 'Nordstil')
  .eq('type', 'fair')
  .maybeSingle();
if (!nordstil) fail('Nordstil fair not found');
const { count: nordstilCount, error: nordstilErr } = await supabase
  .from('documents')
  .select('id', { count: 'exact', head: true })
  .eq('agent_id', silke.id)
  .eq('event_id', nordstil.id)
  .eq('document_type', 'order')
  .is('deleted_at', null);
if (nordstilErr || nordstilCount !== 9) {
  fail(`expected 9 Nordstil orders linked to Silke, found ${nordstilCount ?? 'unknown'}`);
}

const { data: matchingPayments, error: paymentErr } = await supabase
  .from('agent_payments')
  .select('id, amount, notes, payment_date')
  .eq('agent_id', silke.id)
  .eq('notes', PAYMENT_NOTE);
if (paymentErr) fail(`payment lookup failed: ${paymentErr.message}`);
if ((matchingPayments || []).length > 1) fail('duplicate matching INHORGENTA payout rows already exist');
if (matchingPayments?.[0] && round2(matchingPayments[0].amount) !== EXPECTED_PAYOUT) {
  fail(`existing matching payout has wrong amount: ${eur(matchingPayments[0].amount)}`);
}

const unsettled = commissions.filter((row) => row.status !== 'paid');
console.log(`SETTLE SILKE / INHORGENTA (${APPLY ? 'APPLY' : 'DRY-RUN'})`);
console.log(`  Fair orders             : ${docs.length}`);
console.log(`  Commission rate         : ${EXPECTED_RATE}%`);
console.log(`  Commission / payout     : ${eur(payout)}`);
console.log(`  Rows already paid       : ${commissions.length - unsettled.length}`);
console.log(`  Rows to mark paid       : ${unsettled.length}`);
console.log(`  Matching payout exists  : ${matchingPayments?.length === 1 ? 'yes' : 'no'}`);
console.log(`  Nordstil remains linked : ${nordstilCount} orders`);

if (!APPLY) {
  console.log('\nDRY-RUN — no writes. Re-run with --apply.');
  process.exit(0);
}

const timestamp = new Date().toISOString();
if (unsettled.length) {
  const { data: updated, error } = await supabase
    .from('agent_commissions')
    .update({
      status: 'paid',
      paid_at: timestamp,
      customer_paid_at: timestamp,
    })
    .in('id', unsettled.map((row) => row.id))
    .in('status', ['pending', 'approved'])
    .select('id');
  if (error) fail(`mark-paid update failed: ${error.message}`);
  if ((updated || []).length !== unsettled.length) {
    fail(`only ${updated?.length || 0}/${unsettled.length} rows were marked paid`);
  }
}

if (!matchingPayments?.length) {
  const { data: admin, error: adminErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  if (adminErr || !admin) fail(`admin profile needed for payment audit: ${adminErr?.message || 'none found'}`);

  const { error } = await supabase.from('agent_payments').insert({
    agent_id: silke.id,
    amount: EXPECTED_PAYOUT,
    notes: PAYMENT_NOTE,
    payment_date: timestamp,
    created_by: admin.id,
  });
  if (error) fail(`payout insert failed: ${error.message}`);
}

// Read back both sides of the settlement.
const [{ data: verifiedRows }, { data: verifiedPayments }] = await Promise.all([
  supabase
    .from('agent_commissions')
    .select('id, status, commission_amount, paid_at, customer_paid_at')
    .eq('agent_id', silke.id)
    .in('document_id', docIds),
  supabase
    .from('agent_payments')
    .select('id, amount, notes')
    .eq('agent_id', silke.id)
    .eq('notes', PAYMENT_NOTE),
]);
const rowsOk =
  verifiedRows?.length === EXPECTED_ORDER_COUNT &&
  verifiedRows.every((row) => row.status === 'paid' && row.paid_at && row.customer_paid_at);
const paymentOk =
  verifiedPayments?.length === 1 &&
  round2(verifiedPayments[0].amount) === EXPECTED_PAYOUT;

console.log(`\nVERIFY: rows ${rowsOk ? 'PASS' : 'FAIL'} | payout ${paymentOk ? 'PASS' : 'FAIL'}`);
process.exit(rowsOk && paymentOk ? 0 : 1);
