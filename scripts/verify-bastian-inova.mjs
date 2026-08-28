/**
 * Check Bastian's Inova invite and hit the local API as him.
 * Does not send him an email (admin generateLink + verifyOtp).
 *
 *   node --env-file=.env scripts/verify-bastian-inova.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { documentIsOwnOrCredited } from '../lib/documentAccess.js';

const AGENT_EMAIL = 'bastianmeyer319@hotmail.com';
const FAIR_NAME = 'INOVA FRANKFURT';
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error('Missing Supabase env');
  process.exit(1);
}

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

const { data: agent, error: agentErr } = await admin
  .from('profiles')
  .select('id, full_name, email, is_agent, agent_status')
  .eq('email', AGENT_EMAIL)
  .maybeSingle();
if (agentErr || !agent) {
  console.error('Bastian profile not found', agentErr?.message);
  process.exit(1);
}

const { data: fair } = await admin
  .from('events')
  .select('id, name, type')
  .ilike('name', `%${FAIR_NAME}%`)
  .eq('type', 'fair')
  .maybeSingle();
if (!fair) {
  console.error('Inova fair not found');
  process.exit(1);
}

const { data: access } = await admin
  .from('event_access')
  .select('permission, user_email, created_at, granted_by')
  .eq('event_id', fair.id)
  .eq('user_id', agent.id)
  .maybeSingle();

const { data: docs } = await admin
  .from('documents')
  .select('id, created_by, agent_id, client_company, total_amount')
  .eq('event_id', fair.id)
  .is('deleted_at', null)
  .not('order_channel', 'in', '("internal","consignment","delete_from_stock","sample")');

const visible = (docs || []).filter((d) => documentIsOwnOrCredited(d, [agent.id]));
const hidden = (docs || []).filter((d) => !documentIsOwnOrCredited(d, [agent.id]));

console.log('=== Invite row ===');
console.log(`${agent.full_name} <${agent.email}>`);
console.log(`fair: ${fair.name}  ${fair.id}`);
if (!access) {
  console.log('ACCESS: missing — he was not invited');
} else {
  console.log(`ACCESS: ${access.permission}  since ${access.created_at}`);
  console.log('(No email is sent for this invite — it only opens the fair in the app.)');
}

console.log('\n=== Live-data prediction ===');
console.log(`total in fair: ${(docs || []).length}`);
console.log(`he should see: ${visible.map((d) => d.client_company).join(', ') || '(none)'}`);
console.log(`he should NOT see: ${hidden.map((d) => d.client_company).join(', ') || '(none)'}`);

if (!access) process.exit(1);

const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: AGENT_EMAIL,
});
if (linkErr || !linkData?.properties?.hashed_token) {
  console.error('Could not start a Bastian session:', linkErr?.message || 'no hashed_token');
  process.exit(1);
}

const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
  token_hash: linkData.properties.hashed_token,
  type: 'email',
});
if (verifyErr || !verified?.session) {
  console.error('Could not verify Bastian session:', verifyErr?.message);
  process.exit(1);
}

const cookie = sessionCookieHeader(verified.session);
const headers = { cookie, Accept: 'application/json' };

const eventsRes = await fetch(`${BASE}/api/events`, { headers });
const eventsBody = await eventsRes.json();
const inova = (eventsBody.events || []).find((e) => e.id === fair.id);

console.log('\n=== Local API as Bastian ===');
console.log(`GET /api/events  ${eventsRes.status}`);
if (!inova) {
  console.log('INOVA missing from his Events list');
  process.exit(1);
}
console.log(`Inova in sidebar: yes  doc_count=${inova.doc_count}  permission=${inova.permission}`);

const docsRes = await fetch(`${BASE}/api/documents?event_id=${fair.id}&per_page=50`, { headers });
const docsBody = await docsRes.json();
const names = (docsBody.documents || []).map((d) => d.client_company || d.client_name);
console.log(`GET /api/documents?event_id=inova  ${docsRes.status}  count=${docsBody.documents?.length}  total_count=${docsBody.total_count}`);
console.log(`visible companies: ${names.join(', ') || '(none)'}`);

const leaked = (docsBody.documents || []).filter((d) => !documentIsOwnOrCredited(d, [agent.id]));
if (Number(inova.doc_count) !== visible.length) {
  console.error(`FAIL: sidebar count ${inova.doc_count} != expected ${visible.length}`);
  process.exit(1);
}
if ((docsBody.documents || []).length !== visible.length || leaked.length) {
  console.error('FAIL: API returned someone else\'s orders');
  leaked.forEach((d) => console.error('  leak', d.client_company, d.created_by, d.agent_id));
  process.exit(1);
}

const hiddenIds = hidden.map((d) => d.id);
if (hiddenIds[0]) {
  const one = await fetch(`${BASE}/api/documents/${hiddenIds[0]}`, { headers });
  console.log(`GET Alberto order ${hiddenIds[0]}  ${one.status} (want 403)`);
  if (one.status !== 403) {
    console.error('FAIL: he can open an admin order by id');
    process.exit(1);
  }
}

console.log('\nPASS: invite is on, he sees only his Inova orders.');
