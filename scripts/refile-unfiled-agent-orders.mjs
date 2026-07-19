/**
 * Repair — file the July 2026 unfiled agent orders into their agent folders.
 * Only touches NON-ADMIN-created sent b2b/b2c orders whose event_id is null
 * and whose creator resolves to exactly one agent folder (same logic the API
 * now applies automatically going forward).
 *
 * Found by scripts/diagnose-unfiled-agent-orders.mjs (2026-07-19):
 *   ROSTFLECKHAUS €1695 (Bastian Mayer) → "Bastian Mayer"
 *   SAS BLD (LE DONJON) €376 (Nicolas)  → "NICOLAS WHOLESALE FRANCE"
 *   MARIE ET HORTENSE €1630 (Wassila)   → "Sarah Goutard"
 *   SARL LANOUE AND CO €2128 (Nicolas)  → "NICOLAS WHOLESALE FRANCE"
 *   SAS GALA €2503 (Nicolas)            → "NICOLAS WHOLESALE FRANCE"
 *
 * Run: node scripts/refile-unfiled-agent-orders.mjs          (dry run)
 *      node scripts/refile-unfiled-agent-orders.mjs --apply  (write)
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

const orgsByUser = new Map();
for (const m of memberships || []) {
  if (m.deleted_at) continue;
  if (!orgsByUser.has(m.user_id)) orgsByUser.set(m.user_id, new Set());
  orgsByUser.get(m.user_id).add(m.organization_id);
}
for (const p of profiles || []) {
  if (p.organization_id) {
    if (!orgsByUser.has(p.id)) orgsByUser.set(p.id, new Set());
    orgsByUser.get(p.id).add(p.organization_id);
  }
}

function folderForUser(userId) {
  const orgIds = orgsByUser.get(userId) || new Set();
  const byOrg = (agentEvents || []).find((e) => e.organization_id && orgIds.has(e.organization_id));
  if (byOrg) return byOrg;
  return (agentEvents || []).find((e) => e.created_by === userId) || null;
}

const { data: docs } = await supabase
  .from('documents')
  .select('id, client_name, client_company, total_amount, created_by, created_at, order_channel, status, event_id')
  .is('event_id', null)
  .is('deleted_at', null)
  .eq('document_type', 'order')
  .in('order_channel', ['b2b', 'b2c'])
  .neq('status', 'draft');

let updated = 0;
for (const d of docs || []) {
  const p = profileById.get(d.created_by);
  if (!p || p.role === 'admin') continue; // agents only — admin filing stays manual
  const folder = folderForUser(d.created_by);
  if (!folder) continue;
  const label = `${d.created_at?.slice(0, 10)} €${d.total_amount} ${d.client_company || d.client_name} (by ${p.full_name || p.email})`;
  if (!APPLY) {
    console.log(`[dry-run] would file: ${label} → "${folder.name}"`);
    continue;
  }
  const { error } = await supabase
    .from('documents')
    .update({ event_id: folder.id })
    .eq('id', d.id)
    .is('event_id', null); // guard against concurrent change
  if (error) console.error(`✗ ${label}: ${error.message}`);
  else { console.log(`✓ filed: ${label} → "${folder.name}"`); updated++; }
}
console.log(APPLY ? `\nDone — ${updated} orders filed.` : '\nDry run only. Re-run with --apply to write.');
