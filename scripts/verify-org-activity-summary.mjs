// READ-ONLY verification of the numbers the admin organization detail page
// shows in its "Documents" and "Team revenue" cards and per-member columns.
//
// Usage:
//   node --env-file=.env scripts/verify-org-activity-summary.mjs --name "Sarah Goutard"
//   node --env-file=.env scripts/verify-org-activity-summary.mjs --org-id <uuid>
//
// It runs the SAME pure aggregation the /stats endpoint uses
// (lib/organizations/teamStats.js) against the same inputs, so a mismatch
// between this output and the page means a bug in the page, not in the data.

import { createClient } from '@supabase/supabase-js';
import { aggregateTeamStats } from '../lib/organizations/teamStats.js';

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

const EXCLUDED = '("internal","consignment","delete_from_stock","sample")';
const eur = (n) => `${(Number(n) || 0).toFixed(2)} €`;
const normalizeEmail = (v) => String(v || '').trim().toLowerCase();

let org = null;
const argOrgId = arg('--org-id');
const argName = arg('--name');
if (argOrgId) {
  ({ data: org } = await sb.from('organizations').select('id, name').eq('id', argOrgId).maybeSingle());
} else if (argName) {
  const { data } = await sb.from('organizations').select('id, name').ilike('name', `%${argName}%`).is('deleted_at', null);
  org = (data || [])[0] || null;
}
if (!org) {
  console.error('Organization not found — pass --org-id <uuid> or --name <match>');
  process.exit(1);
}

// Mirrors getOrgTeamScope in app/api/_lib/access.js
const [{ data: orgMembers }, { data: orgProfiles }, { data: orgEvents }] = await Promise.all([
  sb.from('organization_memberships').select('user_id').eq('organization_id', org.id),
  sb.from('profiles').select('id').eq('organization_id', org.id),
  sb.from('events').select('id').eq('organization_id', org.id),
]);

const memberIds = new Set([
  ...(orgMembers || []).map((m) => m.user_id),
  ...(orgProfiles || []).map((p) => p.id),
].filter(Boolean));

const { data: memberProfiles } = await sb.from('profiles').select('id, email').in('id', [...memberIds]);
const emails = [...new Set((memberProfiles || []).map((p) => normalizeEmail(p.email)).filter(Boolean))];
if (emails.length > 0) {
  const { data: sameEmail } = await sb.from('profiles').select('id').in('email', emails);
  (sameEmail || []).forEach((p) => memberIds.add(p.id));
}
const eventIds = (orgEvents || []).map((e) => e.id).filter(Boolean);

const { data: memberships } = await sb
  .from('organization_memberships')
  .select('user_id, role, created_at, deleted_at, profiles:user_id(id, full_name, email, agent_status)')
  .eq('organization_id', org.id)
  .order('created_at', { ascending: true });

const orParts = [];
if (memberIds.size > 0) orParts.push(`created_by.in.(${[...memberIds].join(',')})`);
if (eventIds.length > 0) orParts.push(`event_id.in.(${eventIds.join(',')})`);

const { data: documents } = await sb
  .from('documents')
  .select('id, created_by, event_id, document_type, status, order_channel, total_amount, created_at, deleted_at')
  .or(orParts.join(','))
  .is('deleted_at', null)
  .neq('status', 'draft')
  .not('order_channel', 'in', EXCLUDED);

const { data: commissions } = await sb
  .from('agent_commissions')
  .select('agent_id, commission_amount, status, created_at')
  .in('agent_id', [...memberIds]);

// Legacy profile ids folded back onto their canonical member row
const legacyToCanonical = new Map();
const membershipUserIds = new Set((memberships || []).map((m) => m.user_id));
const legacyIds = [...memberIds].filter((id) => !membershipUserIds.has(id));
if (legacyIds.length > 0) {
  const { data: legacyProfiles } = await sb.from('profiles').select('id, email').in('id', legacyIds);
  const emailToCanonical = new Map();
  for (const m of memberships || []) {
    const email = normalizeEmail(m.profiles?.email);
    if (email && !emailToCanonical.has(email)) emailToCanonical.set(email, m.user_id);
  }
  for (const p of legacyProfiles || []) {
    const email = normalizeEmail(p.email);
    if (email && emailToCanonical.has(email)) legacyToCanonical.set(p.id, emailToCanonical.get(email));
  }
}

const { totals, perMember } = aggregateTeamStats({
  memberships: memberships || [],
  documents: documents || [],
  commissions: commissions || [],
  legacyToCanonical,
});

console.log(`\n${org.name}`);
console.log('\nWhat the summary cards will show');
console.log(`  Documents:       ${totals.orders + totals.quotes}  (${totals.orders} orders · ${totals.quotes} quotes)`);
console.log(`  Team revenue:    ${eur(totals.revenue)}`);
console.log(`  Team earned:     ${eur(totals.total_commission)}`);
console.log(`  Active members:  ${totals.active_members}`);

console.log('\nWhat the member rows will show (revenue descending)');
for (const m of perMember) {
  const docs = m.orders + m.quotes;
  console.log(
    `  ${(m.full_name || m.email || m.user_id).padEnd(24)} ` +
    `${docs === 0 ? '—' : String(docs).padStart(3)}  ${docs === 0 ? '—' : eur(m.revenue).padStart(12)}` +
    `${m.is_removed ? '   (removed member, historical)' : ''}`,
  );
}

const memberDocs = perMember.reduce((acc, m) => acc + m.orders + m.quotes, 0);
const teamDocs = totals.orders + totals.quotes;
if (memberDocs !== teamDocs) {
  console.log(
    `\nNote: ${teamDocs - memberDocs} document(s) count for the team but for no member — ` +
    'entered by someone outside the team into one of its folders.',
  );
}
console.log('');
