// Phase 31 verification — READ-ONLY end-to-end check of the org-level
// commission settlement against the live Supabase database.
//
// Usage:
//   node --env-file=.env scripts/verify-org-settlement.mjs [--org-id <uuid>]
//
// Checks (never writes anything):
//   1. Organization + active members exist, and there is exactly one owner.
//   2. Schema drift: agent_commissions.report_id / invoice_number,
//      agent_payments.report_id, commission_reports table — all reachable.
//   3. Org ledger math (earned − paid = owed) across all members.
//   4. Dry-run of the org report scope: which commissions WOULD be swept,
//      per member, using the exact same eligibility rules as
//      buildReportData (pending + customer_paid + not yet on a report).
//   5. Flags members with no usable commission rate (personal + org both null).

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — run with node --env-file=.env');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const argOrgId = (() => {
  const i = process.argv.indexOf('--org-id');
  return i > -1 ? process.argv[i + 1] : null;
})();

const eur = (n) => `${(Number(n) || 0).toFixed(2)} €`;
let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => { failures += 1; console.log(`  ✗ ${msg}`); };
const warn = (msg) => console.log(`  ⚠ ${msg}`);

// ── 1. Organization + members ────────────────────────────────────────────
console.log('\n[1] Organization + members');
let org;
if (argOrgId) {
  ({ data: org } = await sb.from('organizations').select('*').eq('id', argOrgId).maybeSingle());
} else {
  const { data: orgs } = await sb.from('organizations').select('*').is('deleted_at', null);
  // Default to the biggest multi-member org (Showroom Accestory in prod).
  let best = null;
  for (const o of orgs || []) {
    const { count } = await sb.from('organization_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', o.id).is('deleted_at', null);
    if (!best || (count || 0) > best.count) best = { org: o, count: count || 0 };
  }
  org = best?.org;
}
if (!org) { bad('No organization found'); process.exit(1); }
ok(`Organization: ${org.name} (${org.id}) — org rate: ${org.commission_rate ?? 'none'}`);

const { data: members, error: memErr } = await sb
  .from('organization_memberships')
  .select('user_id, role, profiles:user_id(id, full_name, email, commission_rate, agent_status)')
  .eq('organization_id', org.id)
  .is('deleted_at', null);
if (memErr) { bad(`Members query failed: ${memErr.message}`); process.exit(1); }

const owners = (members || []).filter((m) => m.role === 'owner');
if (owners.length === 1) ok(`Owner: ${owners[0].profiles?.full_name} <${owners[0].profiles?.email}>`);
else bad(`Expected exactly 1 owner, found ${owners.length}`);
ok(`${members.length} active member(s): ${members.map((m) => m.profiles?.full_name || m.user_id).join(', ')}`);

// ── 2. Schema drift ──────────────────────────────────────────────────────
console.log('\n[2] Schema drift');
const drift = [
  ['agent_commissions', 'id, agent_id, status, report_id, invoice_number, customer_paid_at, commission_amount'],
  ['agent_payments', 'id, agent_id, amount, report_id, invoice_number'],
  ['commission_reports', 'id, agent_id, total_due, snapshot_data, period_label'],
];
for (const [table, cols] of drift) {
  const { error } = await sb.from(table).select(cols).limit(1);
  if (error) bad(`${table}: ${error.message}`);
  else ok(`${table} — all settlement columns present`);
}

// ── 3. Org ledger math ───────────────────────────────────────────────────
console.log('\n[3] Org ledger (earned − paid = owed)');
const memberIds = members.map((m) => m.user_id);
const [{ data: comms }, { data: pays }] = await Promise.all([
  sb.from('agent_commissions').select('id, agent_id, commission_amount, status, customer_paid_at, report_id').in('agent_id', memberIds),
  sb.from('agent_payments').select('agent_id, amount').in('agent_id', memberIds),
]);
let earned = 0, paidOut = 0;
const perMember = new Map(memberIds.map((id) => [id, { earned: 0, paid: 0, ready: 0, readyCount: 0 }]));
for (const c of comms || []) {
  if (c.status === 'cancelled') continue;
  earned += Number(c.commission_amount) || 0;
  const b = perMember.get(c.agent_id);
  if (b) b.earned += Number(c.commission_amount) || 0;
}
for (const p of pays || []) {
  paidOut += Number(p.amount) || 0;
  const b = perMember.get(p.agent_id);
  if (b) b.paid += Number(p.amount) || 0;
}
ok(`Earned ${eur(earned)} · Paid out ${eur(paidOut)} · OWED TO ORGANIZATION ${eur(earned - paidOut)}`);

// ── 4. Org report scope dry-run (same rules as buildReportData) ─────────
console.log('\n[4] Org report dry-run — what "Send org report" would sweep');
let readyTotal = 0, readyCount = 0;
for (const c of comms || []) {
  const eligible =
    c.status !== 'cancelled' && c.status !== 'paid' &&
    !c.report_id && !!c.customer_paid_at;
  if (!eligible) continue;
  readyTotal += Number(c.commission_amount) || 0;
  readyCount += 1;
  const b = perMember.get(c.agent_id);
  if (b) { b.ready += Number(c.commission_amount) || 0; b.readyCount += 1; }
}
for (const m of members) {
  const b = perMember.get(m.user_id);
  const name = (m.profiles?.full_name || m.user_id).padEnd(28);
  console.log(`    ${name} earned ${eur(b.earned).padStart(12)} · ready now ${eur(b.ready).padStart(12)} (${b.readyCount} row${b.readyCount === 1 ? '' : 's'})`);
}
ok(`Report would include ${readyCount} commission(s), one total due: ${eur(readyTotal)}`);
if (readyCount === 0) warn('Nothing ticked "Customer paid?" yet — report button would skip (expected for a fresh team).');

// ── 5. Commission-rate sanity ────────────────────────────────────────────
console.log('\n[5] Commission rates');
for (const m of members) {
  const personal = m.profiles?.commission_rate;
  if (personal == null && org.commission_rate == null) {
    warn(`${m.profiles?.full_name || m.user_id}: NO personal rate and NO org rate — new orders would earn 0 commission`);
  }
}
const missing = members.filter((m) => m.profiles?.commission_rate == null && org.commission_rate == null);
if (missing.length === 0) ok('Every member resolves to a usable commission rate (personal or org).');

console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
