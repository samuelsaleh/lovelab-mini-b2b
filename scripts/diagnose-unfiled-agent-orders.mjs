/**
 * READ-ONLY diagnostic — find b2b/b2c sent orders that were saved WITHOUT an
 * event folder (event_id null) by users who have an agent folder they should
 * have been filed into. Explains the "saved but not in the agent's folder"
 * complaint (Sarah / Nicolas, July 2026).
 *
 * Run: node scripts/diagnose-unfiled-agent-orders.mjs
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

// All agent folders
const { data: agentEvents } = await supabase
  .from('events')
  .select('id, name, organization_id, created_by')
  .eq('type', 'agent');

const { data: profiles } = await supabase
  .from('profiles')
  .select('id, full_name, email, role, organization_id');
const profileById = new Map((profiles || []).map((p) => [p.id, p]));

const { data: memberships } = await supabase
  .from('organization_memberships')
  .select('user_id, organization_id, deleted_at');

// user_id -> set of active org ids
const orgsByUser = new Map();
for (const m of memberships || []) {
  if (m.deleted_at) continue;
  if (!orgsByUser.has(m.user_id)) orgsByUser.set(m.user_id, new Set());
  orgsByUser.get(m.user_id).add(m.organization_id);
}
// Also profiles.organization_id counts as a link
for (const p of profiles || []) {
  if (p.organization_id) {
    if (!orgsByUser.has(p.id)) orgsByUser.set(p.id, new Set());
    orgsByUser.get(p.id).add(p.organization_id);
  }
}

// Folder for a user: agent event linked to one of their orgs, or created by them
function folderForUser(userId) {
  const orgIds = orgsByUser.get(userId) || new Set();
  const byOrg = (agentEvents || []).find((e) => e.organization_id && orgIds.has(e.organization_id));
  if (byOrg) return byOrg;
  return (agentEvents || []).find((e) => e.created_by === userId) || null;
}

// Unfiled sent b2b/b2c orders
const { data: docs } = await supabase
  .from('documents')
  .select('id, client_name, client_company, total_amount, created_by, created_at, order_channel, status, event_id, deleted_at')
  .is('event_id', null)
  .is('deleted_at', null)
  .eq('document_type', 'order')
  .in('order_channel', ['b2b', 'b2c'])
  .neq('status', 'draft')
  .order('created_at', { ascending: false });

let fixable = 0;
console.log(`\n── Unfiled sent b2b/b2c orders (event_id = null): ${docs?.length || 0} ──\n`);
for (const d of docs || []) {
  const p = profileById.get(d.created_by);
  const folder = folderForUser(d.created_by);
  const who = p ? `${p.full_name || p.email} (${p.role})` : d.created_by;
  const target = folder ? `→ should file into "${folder.name}"` : '→ no agent folder (admin/office order, probably fine)';
  if (folder && p?.role !== 'admin') fixable++;
  console.log(`${d.created_at?.slice(0, 10)}  €${String(d.total_amount ?? '?').padEnd(8)} ${String(d.client_company || d.client_name).slice(0, 34).padEnd(35)} by ${who.padEnd(38)} ${target}`);
}
console.log(`\nAgent-created orders that SHOULD be re-filed: ${fixable}`);
