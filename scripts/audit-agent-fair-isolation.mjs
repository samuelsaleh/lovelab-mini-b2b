/**
 * Audit: can any agent see another agent's folder or orders?
 * Also logs in as Bastian against localhost and lists what he actually gets.
 *
 *   node --env-file=.env scripts/audit-agent-fair-isolation.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { documentIsOwnOrCredited } from '../lib/documentAccess.js';

const BASTIAN_EMAIL = 'bastianmeyer319@hotmail.com';
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

function toBase64Url(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sessionCookieHeader(session) {
  const ref = new URL(url).hostname.split('.')[0];
  const payload = `base64-${toBase64Url(JSON.stringify(session))}`;
  const name = `sb-${ref}-auth-token`;
  const chunk = 3180;
  const parts = [];
  for (let i = 0; i < payload.length; i += chunk) {
    const idx = Math.floor(i / chunk);
    const key = idx === 0 && payload.length <= chunk ? name : `${name}.${idx}`;
    parts.push(`${key}=${payload.slice(i, i + chunk)}`);
  }
  return parts.join('; ');
}

const { data: agents } = await admin
  .from('profiles')
  .select('id, full_name, email, is_agent, agent_status, organization_id, role')
  .or('is_agent.eq.true,agent_status.not.is.null');

const byId = new Map((agents || []).map((a) => [a.id, a]));
const bastian = (agents || []).find((a) => (a.email || '').toLowerCase() === BASTIAN_EMAIL);
const marc = (agents || []).find((a) => /schlund/i.test(a.full_name || '') || /schlund/i.test(a.email || ''));

console.log('=== People ===');
console.log('Bastian:', bastian ? `${bastian.full_name} ${bastian.id} org=${bastian.organization_id} status=${bastian.agent_status}` : 'NOT FOUND');
console.log('Marc:', marc ? `${marc.full_name} ${marc.id} org=${marc.organization_id} status=${marc.agent_status}` : 'NOT FOUND');

const { data: memberships } = await admin
  .from('organization_memberships')
  .select('user_id, organization_id, role, deleted_at')
  .is('deleted_at', null);

const orgsByUser = new Map();
for (const m of memberships || []) {
  if (!orgsByUser.has(m.user_id)) orgsByUser.set(m.user_id, []);
  orgsByUser.get(m.user_id).push(m.organization_id);
}

const { data: events } = await admin
  .from('events')
  .select('id, name, type, organization_id, created_by');

const eventsById = new Map((events || []).map((e) => [e.id, e]));
const marcEvents = (events || []).filter((e) =>
  /schlund|marc/i.test(e.name || '') ||
  (marc && (e.created_by === marc.id || e.organization_id === marc.organization_id)),
);

console.log('\n=== Marc folders / events ===');
for (const e of marcEvents) {
  console.log(`  [${e.type}] ${e.name}  org=${e.organization_id || '—'}  created_by=${e.created_by}`);
}

const { data: accessRows } = await admin
  .from('event_access')
  .select('event_id, user_id, user_email, permission, created_at');

console.log('\n=== event_access that is NOT a real trade fair ===');
const leaks = [];
for (const row of accessRows || []) {
  const evt = eventsById.get(row.event_id);
  const who = byId.get(row.user_id);
  const isFair = evt?.type === 'fair';
  const isOtherAgentFolder = evt?.type === 'agent' && evt.created_by !== row.user_id;
  if (isOtherAgentFolder || (!isFair && evt?.type === 'agent')) {
    const line = `${who?.full_name || row.user_email} → [${evt?.type}] ${evt?.name} (${row.permission})`;
    if (isOtherAgentFolder) leaks.push(line);
    console.log(`  ${line}`);
  }
}

console.log('\n=== Bastian event_access ===');
const bastianAccess = (accessRows || []).filter((r) => r.user_id === bastian?.id);
if (!bastianAccess.length) console.log('  (none)');
for (const row of bastianAccess) {
  const evt = eventsById.get(row.event_id);
  console.log(`  ${row.permission}  [${evt?.type}] ${evt?.name}`);
}

if (bastian && marc) {
  const sameOrg = bastian.organization_id && bastian.organization_id === marc.organization_id;
  const bOrgs = new Set(orgsByUser.get(bastian.id) || []);
  const mOrgs = new Set(orgsByUser.get(marc.id) || []);
  const overlap = [...bOrgs].filter((id) => mOrgs.has(id));
  console.log('\n=== Shared org? ===');
  console.log(`profile.organization_id same: ${Boolean(sameOrg)}`);
  console.log(`membership overlap: ${overlap.length ? overlap.join(', ') : 'none'}`);
}

const { data: marcDocs } = marc
  ? await admin
      .from('documents')
      .select('id, event_id, created_by, agent_id, client_company, total_amount, deleted_at')
      .or(`created_by.eq.${marc.id},agent_id.eq.${marc.id}`)
      .is('deleted_at', null)
  : { data: [] };

console.log(`\n=== Marc live orders: ${(marcDocs || []).length} ===`);
for (const d of marcDocs || []) {
  const evt = eventsById.get(d.event_id);
  const bastianWouldSee = bastian ? documentIsOwnOrCredited(d, [bastian.id]) : false;
  console.log(`  ${d.client_company || d.id}  @ ${evt?.name || 'no folder'}  [${evt?.type || '—'}]  bastianOwnOrCredited=${bastianWouldSee}`);
}

if (!bastian) process.exit(1);

const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: BASTIAN_EMAIL,
});
if (linkErr || !linkData?.properties?.hashed_token) {
  console.error('session failed', linkErr?.message);
  process.exit(1);
}
const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
  token_hash: linkData.properties.hashed_token,
  type: 'email',
});
if (verifyErr || !verified?.session) {
  console.error('verify failed', verifyErr?.message);
  process.exit(1);
}

const headers = { cookie: sessionCookieHeader(verified.session), Accept: 'application/json' };

const eventsRes = await fetch(`${BASE}/api/events`, { headers });
const eventsBody = await eventsRes.json();
const hisEvents = eventsBody.events || [];

console.log(`\n=== Bastian GET /api/events (${eventsRes.status}) ${hisEvents.length} folders ===`);
for (const e of hisEvents) {
  const flag = /schlund|marc/i.test(e.name || '') ? '  << MARC?' : '';
  console.log(`  [${e.type}] ${e.name}  count=${e.doc_count}  perm=${e.permission}${flag}`);
}

const orgRes = await fetch(`${BASE}/api/org-folders`, { headers });
const orgBody = await orgRes.json();
console.log(`\n=== Bastian GET /api/org-folders (${orgRes.status}) ===`);
for (const o of orgBody.orgFolders || []) {
  const names = (o.members || []).map((m) => m.full_name || m.email).join(', ');
  const marcHit = /schlund|marc/i.test(`${o.organization_name} ${names}`) ? '  << MARC?' : '';
  console.log(`  ${o.organization_name}  members=[${names}]  docs=${o.doc_count}${marcHit}`);
}

const allRes = await fetch(`${BASE}/api/documents?per_page=200&page=1`, { headers });
const allBody = await allRes.json();
const allDocs = allBody.documents || [];
console.log(`\n=== Bastian All Documents (${allRes.status}) ${allDocs.length} / total ${allBody.total_count} ===`);

const marcNameRe = /schlund/i;
const leakedMarc = allDocs.filter((d) =>
  d.created_by === marc?.id ||
  d.agent_id === marc?.id ||
  marcNameRe.test(d.creator?.full_name || '') ||
  marcNameRe.test(d.agent?.full_name || '') ||
  marcNameRe.test(d.events?.name || ''),
);
console.log(`Marc-attributed rows in All Documents: ${leakedMarc.length}`);
leakedMarc.forEach((d) => {
  console.log(`  LEAK ${d.client_company}  by ${d.creator?.full_name || d.created_by}  agent=${d.agent?.full_name || d.agent_id}  @ ${d.events?.name}`);
});

const notHis = allDocs.filter((d) => !documentIsOwnOrCredited(d, [bastian.id]));
console.log(`Rows that are not created_by/agent_id Bastian: ${notHis.length}`);
notHis.slice(0, 20).forEach((d) => {
  console.log(`  OTHER ${d.client_company}  by ${d.creator?.full_name || d.created_by}  agent=${d.agent?.full_name || d.agent_id}  @ ${d.events?.name}`);
});

if (marcEvents.length) {
  for (const e of marcEvents) {
    const folderRes = await fetch(`${BASE}/api/documents?event_id=${e.id}&per_page=50`, { headers });
    const folderBody = await folderRes.json();
    console.log(`\nBastian GET folder "${e.name}" → ${folderRes.status}  docs=${folderBody.documents?.length ?? 'n/a'}`);
    (folderBody.documents || []).forEach((d) => {
      console.log(`  ${d.client_company}  by ${d.creator?.full_name}`);
    });
  }
}

const marcInSidebar = hisEvents.some((e) => /schlund|marc/i.test(e.name || '') || e.id === marcEvents[0]?.id);
const orgHasMarc = (orgBody.orgFolders || []).some((o) =>
  /schlund|marc/i.test(o.organization_name || '') ||
  (o.members || []).some((m) => /schlund|marc/i.test(`${m.full_name} ${m.email}`)),
);

console.log('\n=== Verdict ===');
console.log(`Bastian sees a Marc folder in Events: ${marcInSidebar}`);
console.log(`Bastian sees Marc in Agents/org folders: ${orgHasMarc}`);
console.log(`Bastian All Documents contains Marc orders: ${leakedMarc.length > 0}`);
console.log(`Cross-agent event_access onto another agent's folder: ${leaks.length}`);
leaks.forEach((l) => console.log(`  ${l}`));

if (marcInSidebar || orgHasMarc || leakedMarc.length) process.exit(1);
console.log('PASS: Bastian cannot see Marc Schlund or his orders.');
