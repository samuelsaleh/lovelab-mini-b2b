/**
 * Invite an existing agent to a fair (event_access, permission=edit).
 * Dry-run by default. Pass --apply to write.
 *
 * Usage:
 *   node --env-file=.env scripts/grant-fair-access.mjs "Bastian Mayer" "INOVA FRANKFURT"
 *   node --env-file=.env scripts/grant-fair-access.mjs "Bastian Mayer" "INOVA FRANKFURT" --apply
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { documentIsOwnOrCredited } from '../lib/documentAccess.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(path.join(__dirname, '..', f)); } catch { /* optional */ }
}

const apply = process.argv.includes('--apply');
const args = process.argv.slice(2).filter((a) => a !== '--apply');
const agentQuery = args[0] || 'Bastian Mayer';
const fairQuery = args[1] || 'INOVA FRANKFURT';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: agents, error: agentErr } = await admin
  .from('profiles')
  .select('id, full_name, email, is_agent, agent_status, role')
  .or(`full_name.ilike.%${agentQuery}%,email.ilike.%${agentQuery}%`)
  .is('agent_deleted_at', null);

if (agentErr) {
  console.error('Agent lookup failed:', agentErr.message);
  process.exit(1);
}

const agent = (agents || []).find((p) => p.is_agent) || (agents || [])[0];
if (!agent) {
  console.error(`No profile matching "${agentQuery}"`);
  process.exit(1);
}

const { data: fairs, error: fairErr } = await admin
  .from('events')
  .select('id, name, type')
  .ilike('name', `%${fairQuery}%`);

if (fairErr) {
  console.error('Fair lookup failed:', fairErr.message);
  process.exit(1);
}

const fair = (fairs || []).find((e) => e.type === 'fair') || (fairs || [])[0];
if (!fair) {
  console.error(`No event matching "${fairQuery}"`);
  process.exit(1);
}

const { data: existing } = await admin
  .from('event_access')
  .select('event_id, user_id, permission, user_email')
  .eq('event_id', fair.id)
  .eq('user_id', agent.id)
  .maybeSingle();

const { data: docs, error: docsErr } = await admin
  .from('documents')
  .select('id, created_by, agent_id, client_company, total_amount')
  .eq('event_id', fair.id)
  .is('deleted_at', null)
  .not('order_channel', 'in', '("internal","consignment","delete_from_stock","sample")');

if (docsErr) {
  console.error('Document lookup failed:', docsErr.message);
  process.exit(1);
}

const visible = (docs || []).filter((d) => documentIsOwnOrCredited(d, [agent.id]));
const hidden = (docs || []).length - visible.length;

console.log(`${agent.full_name} <${agent.email}>  ${agent.id}`);
console.log(`${fair.name} (${fair.type})  ${fair.id}`);
console.log(`existing access: ${existing ? existing.permission : 'none'}`);
console.log(`fair orders: ${(docs || []).length}  agent would see: ${visible.length}  hidden: ${hidden}`);
visible.forEach((d) => {
  console.log(`  keep  ${d.client_company || d.id}  €${d.total_amount ?? 0}`);
});

if (existing && existing.permission === 'edit') {
  console.log('Already invited with edit. Nothing to write.');
  process.exit(0);
}

if (!apply) {
  console.log('Dry-run. Re-run with --apply to write event_access.');
  process.exit(0);
}

const { error: upsertErr } = await admin
  .from('event_access')
  .upsert({
    event_id: fair.id,
    user_id: agent.id,
    user_email: (agent.email || '').trim().toLowerCase(),
    permission: 'edit',
  }, { onConflict: 'event_id,user_id' });

if (upsertErr) {
  console.error('Grant failed:', upsertErr.message);
  process.exit(1);
}

console.log('Granted edit access.');
