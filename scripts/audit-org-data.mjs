// READ-ONLY audit of an organization's data health.
//
// Usage:
//   node --env-file=.env scripts/audit-org-data.mjs [--org-id <uuid>] [--name <match>]
//
// Never writes anything. Reports:
//   1. Organization + memberships vs profiles.organization_id drift
//   2. Legacy (email-reconciled) profile IDs that split one person's history
//   3. Documents in team scope — true DB duplicates (same client/amount/path
//      within a short window) vs one row that merely matches multiple scopes
//   4. Duplicate agent_commissions per (agent, document, type)
//   5. agent_folders hierarchy for the org (root / Sub-agents / per person)
//   6. Settlement schema columns (Phase 28/29)

import { createClient } from '@supabase/supabase-js';

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

const eur = (n) => `${(Number(n) || 0).toFixed(2)} €`;
let issues = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => { issues += 1; console.log(`  ✗ ${msg}`); };
const warn = (msg) => console.log(`  ⚠ ${msg}`);
const info = (msg) => console.log(`    ${msg}`);

// ── 1. Resolve the organization ─────────────────────────────────────────
console.log('\n[1] Organization + membership drift');
let org = null;
if (argOrgId) {
  ({ data: org } = await sb.from('organizations').select('*').eq('id', argOrgId).maybeSingle());
} else if (argName) {
  const { data: orgs } = await sb.from('organizations').select('*').ilike('name', `%${argName}%`).is('deleted_at', null);
  org = (orgs || [])[0] || null;
} else {
  // Default: biggest active multi-member org.
  const { data: orgs } = await sb.from('organizations').select('*').is('deleted_at', null);
  let best = null;
  for (const o of orgs || []) {
    const { count } = await sb.from('organization_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', o.id).is('deleted_at', null);
    if (!best || (count || 0) > best.count) best = { org: o, count: count || 0 };
  }
  org = best?.org || null;
}
if (!org) { bad('No organization found'); process.exit(1); }
ok(`Organization: ${org.name} (${org.id})`);

const { data: memberships } = await sb
  .from('organization_memberships')
  .select('user_id, role, deleted_at, profiles:user_id(id, full_name, email, organization_id, agent_status)')
  .eq('organization_id', org.id);
const activeMembers = (memberships || []).filter((m) => !m.deleted_at);
ok(`${activeMembers.length} active membership(s), ${(memberships || []).length - activeMembers.length} removed`);
for (const m of activeMembers) {
  const p = m.profiles;
  const drift = p && p.organization_id !== org.id;
  const line = `${(p?.full_name || m.user_id).padEnd(28)} role=${m.role.padEnd(6)} status=${p?.agent_status || '—'}`;
  if (drift) bad(`${line}  ← profiles.organization_id=${p.organization_id || 'NULL'} (drift)`);
  else info(line);
}
// Profiles pointing at this org WITHOUT a membership row
const { data: orphanProfiles } = await sb
  .from('profiles')
  .select('id, full_name, email')
  .eq('organization_id', org.id);
const memberIdSet = new Set((memberships || []).map((m) => m.user_id));
for (const p of orphanProfiles || []) {
  if (!memberIdSet.has(p.id)) bad(`profile ${p.full_name || p.email} (${p.id}) points at org but has NO membership row`);
}

// ── 2. Legacy profile IDs (same email, different UUID) ──────────────────
console.log('\n[2] Legacy (re-invited) profile IDs');
const activeIds = activeMembers.map((m) => m.user_id);
const emails = [...new Set(activeMembers.map((m) => String(m.profiles?.email || '').trim().toLowerCase()).filter(Boolean))];
const legacyByEmail = new Map();
if (emails.length > 0) {
  const { data: sameEmail } = await sb.from('profiles').select('id, email, full_name').in('email', emails);
  for (const p of sameEmail || []) {
    if (!memberIdSet.has(p.id)) {
      const em = String(p.email).trim().toLowerCase();
      if (!legacyByEmail.has(em)) legacyByEmail.set(em, []);
      legacyByEmail.get(em).push(p.id);
    }
  }
}
if (legacyByEmail.size === 0) ok('No legacy profile IDs — each member has a single profile.');
for (const [em, ids] of legacyByEmail) {
  warn(`${em} has ${ids.length} legacy profile ID(s): ${ids.join(', ')}`);
  for (const lid of ids) {
    const { count } = await sb.from('documents').select('id', { count: 'exact', head: true }).eq('created_by', lid);
    info(`  legacy ${lid}: ${count || 0} document(s) still keyed to it`);
  }
}

// ── 3. Documents: true duplicates vs scope overlap ───────────────────────
console.log('\n[3] Team documents — duplicate detection');
const allCreatorIds = [...new Set([...activeIds, ...[...legacyByEmail.values()].flat()])];
const { data: orgEvents } = await sb.from('events').select('id, name').eq('organization_id', org.id);
const eventIds = (orgEvents || []).map((e) => e.id);
const orParts = [];
if (allCreatorIds.length > 0) orParts.push(`created_by.in.(${allCreatorIds.join(',')})`);
if (eventIds.length > 0) orParts.push(`event_id.in.(${eventIds.join(',')})`);

const docs = [];
let pageStart = 0;
for (;;) {
  const { data, error } = await sb
    .from('documents')
    .select('id, created_by, event_id, client_name, client_company, document_type, order_channel, status, total_amount, file_path, file_name, created_at, deleted_at')
    .or(orParts.join(','))
    .order('created_at', { ascending: false })
    .range(pageStart, pageStart + 999);
  if (error) { bad(`documents query failed: ${error.message}`); process.exit(1); }
  docs.push(...(data || []));
  if (!data || data.length < 1000) break;
  pageStart += 1000;
}
const liveDocs = docs.filter((d) => !d.deleted_at);
ok(`${docs.length} document(s) in team scope (${liveDocs.length} live, ${docs.length - liveDocs.length} trashed)`);

// Distinct rows sharing the same ID would indicate an OR-filter join bug.
const idCounts = new Map();
for (const d of docs) idCounts.set(d.id, (idCounts.get(d.id) || 0) + 1);
const repeatedIds = [...idCounts.entries()].filter(([, c]) => c > 1);
if (repeatedIds.length === 0) ok('No repeated document IDs in the raw query result.');
else bad(`${repeatedIds.length} document ID(s) returned more than once by the query!`);

// True content duplicates: same client + same amount + same type, created
// within 10 minutes of each other. These are the "saved twice" candidates.
const byKey = new Map();
for (const d of liveDocs) {
  if (d.status === 'draft') continue;
  const client = String(d.client_company || d.client_name || '').trim().toLowerCase();
  const key = `${client}|${Number(d.total_amount) || 0}|${d.document_type}|${d.order_channel || 'b2b'}`;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(d);
}
let dupGroups = 0;
for (const [key, group] of byKey) {
  if (group.length < 2) continue;
  group.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const clusters = [];
  let cluster = [group[0]];
  for (let i = 1; i < group.length; i++) {
    const gapMin = (new Date(group[i].created_at) - new Date(cluster[cluster.length - 1].created_at)) / 60000;
    if (gapMin <= 10) cluster.push(group[i]);
    else { if (cluster.length > 1) clusters.push(cluster); cluster = [group[i]]; }
  }
  if (cluster.length > 1) clusters.push(cluster);
  for (const c of clusters) {
    dupGroups += 1;
    warn(`Possible saved-twice duplicate (${key.split('|')[0] || 'no client'} · ${eur(c[0].total_amount)}):`);
    for (const d of c) {
      info(`  ${d.id}  created ${d.created_at}  by ${d.created_by}  event=${d.event_id || 'NULL'}  file=${d.file_path || '—'}`);
    }
  }
}
if (dupGroups === 0) ok('No same-client/same-amount documents created within 10 minutes of each other.');
else warn(`${dupGroups} potential duplicate cluster(s) above — review before any deletion.`);

// Docs matching BOTH scopes (creator + org event) — these appear in multiple
// UI views and are the usual "it looks duplicated" cause. Informational only.
const bothScopes = liveDocs.filter((d) => allCreatorIds.includes(d.created_by) && d.event_id && eventIds.includes(d.event_id));
info(`${bothScopes.length} document(s) match BOTH member-created and org-event scope (normal, but shown in several views).`);

// ── 4. Commission duplicates ─────────────────────────────────────────────
console.log('\n[4] Commission rows — duplicates per (agent, document, type)');
const { data: comms } = await sb
  .from('agent_commissions')
  .select('id, agent_id, document_id, type, status, commission_amount, created_at')
  .in('agent_id', allCreatorIds.length > 0 ? allCreatorIds : ['00000000-0000-0000-0000-000000000000']);
const commKey = new Map();
for (const c of comms || []) {
  if (!c.document_id) continue;
  const key = `${c.agent_id}|${c.document_id}|${c.type}`;
  if (!commKey.has(key)) commKey.set(key, []);
  commKey.get(key).push(c);
}
let commDups = 0;
for (const [key, group] of commKey) {
  if (group.length < 2) continue;
  commDups += 1;
  bad(`Duplicate commissions for ${key}:`);
  for (const c of group) info(`  ${c.id}  status=${c.status}  ${eur(c.commission_amount)}  ${c.created_at}`);
}
if (commDups === 0) ok(`No duplicate commission rows across ${(comms || []).length} row(s).`);

// ── 5. Folder hierarchy ──────────────────────────────────────────────────
console.log('\n[5] agent_folders hierarchy');
const { data: roots } = await sb
  .from('agent_folders')
  .select('id, name, agent_id, parent_id, organization_id, created_at')
  .eq('organization_id', org.id)
  .is('parent_id', null);
if (!roots || roots.length === 0) bad('No org root folder (organization_id set, parent_id NULL).');
else if (roots.length > 1) bad(`${roots.length} org root folders — expected exactly 1.`);
else ok(`Org root: "${roots[0].name}" (${roots[0].id}) owned by ${roots[0].agent_id}`);

const root = roots?.[0];
if (root) {
  const { data: children } = await sb
    .from('agent_folders')
    .select('id, name, agent_id, parent_id, created_at')
    .eq('parent_id', root.id);
  info(`${(children || []).length} folder(s) directly under root:`);
  for (const c of children || []) info(`  "${c.name}" (${c.id}) agent=${c.agent_id}`);
  const subAgentsFolder = (children || []).find((c) => c.name === 'Sub-agents');
  if (subAgentsFolder) {
    const { data: grandkids } = await sb
      .from('agent_folders')
      .select('id, name, agent_id')
      .eq('parent_id', subAgentsFolder.id);
    ok(`"Sub-agents" folder exists with ${(grandkids || []).length} child folder(s).`);
    for (const g of grandkids || []) info(`  "${g.name}" agent=${g.agent_id}`);
  } else {
    warn('No "Sub-agents" folder under root yet (backfill will create it).');
  }
}
// Orphan personal roots for members (parent_id NULL, no organization_id)
const { data: orphanRoots } = await sb
  .from('agent_folders')
  .select('id, name, agent_id')
  .in('agent_id', activeIds.length > 0 ? activeIds : ['00000000-0000-0000-0000-000000000000'])
  .is('parent_id', null)
  .is('organization_id', null);
if ((orphanRoots || []).length > 0) {
  warn(`${orphanRoots.length} orphan personal root folder(s) (no organization_id):`);
  for (const f of orphanRoots) {
    const { count } = await sb.from('agent_folder_files').select('id', { count: 'exact', head: true }).eq('folder_id', f.id);
    info(`  "${f.name}" (${f.id}) agent=${f.agent_id} — ${count || 0} file(s)`);
  }
} else {
  ok('No orphan personal root folders for active members.');
}

// ── 6. Settlement schema ─────────────────────────────────────────────────
console.log('\n[6] Settlement schema (Phase 28/29)');
for (const [table, cols] of [
  ['agent_commissions', 'id, report_id, invoice_number, customer_paid_at'],
  ['agent_payments', 'id, report_id, invoice_number'],
  ['commission_reports', 'id, total_due, snapshot_data'],
]) {
  const { error } = await sb.from(table).select(cols).limit(1);
  if (error) bad(`${table}: ${error.message}`);
  else ok(`${table} — settlement columns present`);
}

console.log(`\n${issues === 0 ? '✅ AUDIT CLEAN' : `❌ ${issues} ISSUE(S) FOUND`}\n`);
