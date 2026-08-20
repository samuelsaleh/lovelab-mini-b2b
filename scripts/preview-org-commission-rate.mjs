// READ-ONLY preview of what setting an organization's commission rate would do.
//
// Usage:
//   node --env-file=.env scripts/preview-org-commission-rate.mjs --name Sarah --rate 20
//   node --env-file=.env scripts/preview-org-commission-rate.mjs --org-id <uuid> --rate 20
//
// Never writes anything. It mirrors the exact scope that
// recalcUnpaidCommissionsForOrganization uses after PATCH /api/organizations/[id]:
//   - only members with NO personal commission_rate (0/null inherit the org rate)
//   - only type='order' rows with report_id IS NULL
//   - status 'paid' / 'cancelled' are never touched
//
// Printing the per-row before/after lets the numbers be approved before any
// money changes in production.

import { createClient } from '@supabase/supabase-js';
import { calculateCommission } from '../lib/commission.js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — run with node --env-file=.env');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
};
const argOrgId = arg('--org-id');
const argName = arg('--name');
const argRate = Number(arg('--rate'));

if (!Number.isFinite(argRate) || argRate < 0 || argRate > 100) {
  console.error('Pass a target rate, e.g. --rate 20');
  process.exit(1);
}

const eur = (n) => `${(Number(n) || 0).toFixed(2)} €`;
const SKIP_STATUSES = new Set(['paid', 'cancelled']);

// ── Resolve the organization ─────────────────────────────────────────────
let org = null;
if (argOrgId) {
  ({ data: org } = await sb.from('organizations').select('*').eq('id', argOrgId).maybeSingle());
} else if (argName) {
  const { data: orgs } = await sb
    .from('organizations')
    .select('*')
    .ilike('name', `%${argName}%`)
    .is('deleted_at', null);
  org = (orgs || [])[0] || null;
}
if (!org) {
  console.error('Organization not found — pass --org-id <uuid> or --name <match>');
  process.exit(1);
}

console.log(`\nOrganization: ${org.name}`);
console.log(`  current commission_rate: ${org.commission_rate === null ? 'null (not set)' : `${org.commission_rate}%`}`);
console.log(`  target commission_rate:  ${argRate}%`);

// ── Members, and who inherits the org rate ───────────────────────────────
const { data: memberships } = await sb
  .from('organization_memberships')
  .select('user_id, role')
  .eq('organization_id', org.id)
  .is('deleted_at', null);

const userIds = [...new Set((memberships || []).map((m) => m.user_id).filter(Boolean))];
if (userIds.length === 0) {
  console.log('\nNo active members — nothing would change.');
  process.exit(0);
}

const { data: profiles } = await sb
  .from('profiles')
  .select('id, full_name, email, commission_rate, agent_commission_config')
  .in('id', userIds);

const profileById = new Map((profiles || []).map((p) => [p.id, p]));
const roleById = new Map((memberships || []).map((m) => [m.user_id, m.role]));
const label = (id) => profileById.get(id)?.full_name || profileById.get(id)?.email || id;

console.log('\n[1] Members and rate source after the change');
const inheritingIds = new Set();
for (const id of userIds) {
  const p = profileById.get(id) || {};
  const personal = Number(p.commission_rate) || 0;
  if (personal > 0) {
    console.log(`  ${label(id).padEnd(24)} keeps its own ${personal}% (personal rate wins)`);
  } else {
    inheritingIds.add(id);
    console.log(`  ${label(id).padEnd(24)} inherits ${argRate}% from the organization`);
  }
  if (p.agent_commission_config) {
    console.log(`      note: has agent_commission_config — recalc ignores it and applies the flat rate`);
  }
  if (roleById.get(id) === 'owner') console.log('      role: owner (receives the single team payment)');
}

// ── Rows that would be rewritten ─────────────────────────────────────────
const { data: rows, error: rowsErr } = await sb
  .from('agent_commissions')
  .select('id, agent_id, document_id, type, order_total, commission_rate, commission_amount, status, report_id')
  .in('agent_id', userIds)
  .order('created_at', { ascending: true });

if (rowsErr) {
  console.error(`Failed to read agent_commissions: ${rowsErr.message}`);
  process.exit(1);
}

const documentIds = [...new Set((rows || []).map((r) => r.document_id).filter(Boolean))];
const { data: documents } = documentIds.length > 0
  ? await sb.from('documents').select('id, client_company, client_name').in('id', documentIds)
  : { data: [] };
const docLabel = new Map(
  (documents || []).map((d) => [d.id, d.client_company || d.client_name || d.id]),
);

console.log('\n[2] Commission rows');
let currentTotal = 0;
let nextTotal = 0;
let changedRows = 0;
const perMember = new Map();

for (const row of rows || []) {
  const currentAmount = Number(row.commission_amount) || 0;
  currentTotal += currentAmount;

  const inherits = inheritingIds.has(row.agent_id);
  const eligible =
    inherits &&
    row.type === 'order' &&
    row.report_id === null &&
    !SKIP_STATUSES.has(row.status);

  const nextAmount = eligible
    ? calculateCommission(row.order_total, null, argRate).amount
    : currentAmount;
  nextTotal += nextAmount;
  if (eligible && nextAmount !== currentAmount) changedRows += 1;

  const bucket = perMember.get(row.agent_id) || { current: 0, next: 0, rows: 0, changed: 0 };
  bucket.current += currentAmount;
  bucket.next += nextAmount;
  bucket.rows += 1;
  if (eligible && nextAmount !== currentAmount) bucket.changed += 1;
  perMember.set(row.agent_id, bucket);

  const reason = eligible
    ? 'RECALC'
    : !inherits ? 'skip: personal rate'
      : row.type !== 'order' ? `skip: type=${row.type}`
        : row.report_id !== null ? 'skip: on a report'
          : `skip: status=${row.status}`;

  console.log(
    `  ${label(row.agent_id).slice(0, 22).padEnd(23)} ${String(docLabel.get(row.document_id) || '').slice(0, 24).padEnd(25)} ` +
    `base ${eur(row.order_total).padStart(11)}  ${eur(currentAmount).padStart(10)} -> ${eur(nextAmount).padStart(10)}  ${reason}`,
  );
}

console.log('\n[3] Per member');
for (const [agentId, bucket] of perMember) {
  console.log(
    `  ${label(agentId).padEnd(24)} ${bucket.rows} rows, ${bucket.changed} changed:  ` +
    `${eur(bucket.current)} -> ${eur(bucket.next)}`,
  );
}

console.log('\n[4] Team total (what "Team earned" would show)');
console.log(`  rows in scope:      ${rows?.length || 0}`);
console.log(`  rows that change:   ${changedRows}`);
console.log(`  earned now:         ${eur(currentTotal)}`);
console.log(`  earned after:       ${eur(nextTotal)}`);
console.log(`  difference:         ${eur(nextTotal - currentTotal)}`);
console.log('\nNothing was written. Set the rate from the org detail page to apply it.\n');
