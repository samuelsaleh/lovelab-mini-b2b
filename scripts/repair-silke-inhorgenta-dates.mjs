/**
 * Backdate Silke Holdinghausen's seven INHORGENTA commission ledger rows to
 * their original February 2026 document dates.
 *
 * Only `agent_commissions.created_at` changes. Paid/customer-paid timestamps
 * and the €2,745.75 payment record remain untouched.
 *
 * SAFE BY DEFAULT and idempotent:
 *   node scripts/repair-silke-inhorgenta-dates.mjs
 *   node scripts/repair-silke-inhorgenta-dates.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(path.join(__dirname, '..', f)); } catch {}
}

const APPLY = process.argv.includes('--apply');
const EXPECTED_ORDER_COUNT = 7;
const EXPECTED_PAYOUT = 2745.75;
const PAYMENT_NOTE = 'INHORGENTA Feb 2026 — settled outside app';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const fail = (message) => {
  console.error(`REFUSING TO APPLY: ${message}`);
  process.exit(1);
};
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const { data: silke, error: silkeErr } = await supabase
  .from('profiles')
  .select('id, full_name, email')
  .eq('email', 'silke@holdinghausen.com')
  .maybeSingle();
if (silkeErr || !silke) fail(`Silke profile not found (${silkeErr?.message || 'no row'})`);

const { data: fair, error: fairErr } = await supabase
  .from('events')
  .select('id, name, type')
  .ilike('name', 'INHORGENTA')
  .eq('type', 'fair')
  .maybeSingle();
if (fairErr || !fair) fail(`INHORGENTA fair not found (${fairErr?.message || 'no row'})`);

const { data: docs, error: docsErr } = await supabase
  .from('documents')
  .select('id, client_company, client_name, created_at, event_id, agent_id')
  .eq('agent_id', silke.id)
  .eq('event_id', fair.id)
  .eq('document_type', 'order')
  .is('deleted_at', null)
  .order('created_at', { ascending: true });
if (docsErr) fail(`INHORGENTA documents lookup failed: ${docsErr.message}`);
if ((docs || []).length !== EXPECTED_ORDER_COUNT) {
  fail(`expected ${EXPECTED_ORDER_COUNT} Silke INHORGENTA orders, found ${(docs || []).length}`);
}
if (docs.some((doc) => {
  const timestamp = Date.parse(doc.created_at);
  return Number.isNaN(timestamp) ||
    timestamp < Date.parse('2026-02-20T00:00:00Z') ||
    timestamp >= Date.parse('2026-03-01T00:00:00Z');
})) {
  fail('every target document must have a valid February 2026 date');
}

const docIds = docs.map((doc) => doc.id);
const { data: commissions, error: commErr } = await supabase
  .from('agent_commissions')
  .select('id, document_id, created_at, status, commission_amount, paid_at, customer_paid_at')
  .eq('agent_id', silke.id)
  .eq('type', 'order')
  .in('document_id', docIds);
if (commErr) fail(`commission lookup failed: ${commErr.message}`);
if ((commissions || []).length !== EXPECTED_ORDER_COUNT) {
  fail(`expected ${EXPECTED_ORDER_COUNT} real commission rows, found ${(commissions || []).length}`);
}
if (new Set(commissions.map((row) => row.document_id)).size !== EXPECTED_ORDER_COUNT) {
  fail('duplicate or missing commission document links detected');
}
if (commissions.some((row) => row.status !== 'paid' || !row.paid_at || !row.customer_paid_at)) {
  fail('all seven commissions must remain fully paid before date repair');
}
if (round2(commissions.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0)) !== EXPECTED_PAYOUT) {
  fail(`commission total is not the expected €${EXPECTED_PAYOUT}`);
}

const { data: payments, error: paymentErr } = await supabase
  .from('agent_payments')
  .select('id, amount, payment_date, notes')
  .eq('agent_id', silke.id)
  .eq('notes', PAYMENT_NOTE);
if (paymentErr) fail(`payment lookup failed: ${paymentErr.message}`);
if ((payments || []).length !== 1 || round2(payments[0].amount) !== EXPECTED_PAYOUT) {
  fail('expected exactly one unchanged €2,745.75 INHORGENTA payment');
}
const originalPayment = payments[0];

const docsById = new Map(docs.map((doc) => [doc.id, doc]));
const plan = commissions
  .map((commission) => ({
    commission,
    document: docsById.get(commission.document_id),
  }))
  .sort((a, b) => a.document.created_at.localeCompare(b.document.created_at));
const needsUpdate = plan.filter(
  ({ commission, document }) =>
    new Date(commission.created_at).toISOString() !== new Date(document.created_at).toISOString(),
);

console.log(`REPAIR SILKE / INHORGENTA ORDER DATES (${APPLY ? 'APPLY' : 'DRY-RUN'})`);
for (const { commission, document } of plan) {
  const before = new Date(commission.created_at).toISOString().slice(0, 10);
  const after = new Date(document.created_at).toISOString().slice(0, 10);
  console.log(`  ${(document.client_company || document.client_name || document.id).padEnd(32)} ${before} -> ${after}`);
}
console.log(`  Rows requiring update: ${needsUpdate.length}/${EXPECTED_ORDER_COUNT}`);
console.log(`  Payment stays at      : ${originalPayment.payment_date}`);

if (!APPLY) {
  console.log('\nDRY-RUN — no writes. Re-run with --apply.');
  process.exit(0);
}

for (const { commission, document } of needsUpdate) {
  const targetDate = new Date(document.created_at).toISOString();
  const { data: updated, error } = await supabase
    .from('agent_commissions')
    .update({ created_at: targetDate })
    .eq('id', commission.id)
    .eq('agent_id', silke.id)
    .eq('document_id', document.id)
    .select('id, created_at')
    .maybeSingle();
  if (error || !updated || new Date(updated.created_at).toISOString() !== targetDate) {
    fail(`date update failed for ${document.id}: ${error?.message || 'guard matched no row'}`);
  }
}

const [{ data: verifiedRows, error: verifyRowsErr }, { data: verifiedPayments, error: verifyPaymentErr }] =
  await Promise.all([
    supabase
      .from('agent_commissions')
      .select('id, document_id, created_at, status, commission_amount, paid_at, customer_paid_at')
      .eq('agent_id', silke.id)
      .in('document_id', docIds),
    supabase
      .from('agent_payments')
      .select('id, amount, payment_date, notes')
      .eq('id', originalPayment.id)
      .maybeSingle(),
  ]);
if (verifyRowsErr || verifyPaymentErr) fail('final verification query failed');

const rowsOk =
  verifiedRows?.length === EXPECTED_ORDER_COUNT &&
  verifiedRows.every((row) => {
    const doc = docsById.get(row.document_id);
    return doc &&
      new Date(row.created_at).toISOString() === new Date(doc.created_at).toISOString() &&
      row.status === 'paid' &&
      row.paid_at &&
      row.customer_paid_at;
  });
const paymentOk =
  verifiedPayments?.id === originalPayment.id &&
  round2(verifiedPayments.amount) === EXPECTED_PAYOUT &&
  verifiedPayments.payment_date === originalPayment.payment_date &&
  verifiedPayments.notes === originalPayment.notes;

console.log(`\nVERIFY: order dates ${rowsOk ? 'PASS' : 'FAIL'} | payment unchanged ${paymentOk ? 'PASS' : 'FAIL'}`);
process.exit(rowsOk && paymentOk ? 0 : 1);
