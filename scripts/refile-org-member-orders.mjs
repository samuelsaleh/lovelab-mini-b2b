/**
 * Repair — move team members' orders out of a team-mate's folder into their own.
 *
 * Background: personal agent folders for multi-member teams were provisioned
 * later than the first orders. Until then a member's save auto-filed into the
 * FIRST agent folder of their organization — the owner's. On Showroom Accestory
 * that put Wassila's, Caren's, Ruby's and Marie-Louise's orders under
 * "Sarah Goutard", so an admin could not see who an order came from.
 *
 * The decision is made by lib/events/agentFolderMatch.js (same name-based rule
 * the live save path uses), so this script and the API agree.
 *
 * Safety:
 *   - dry run by default; only --apply writes
 *   - only documents already filed in an agent folder of their own creator's
 *     organization — fair folders, other orgs and unfiled rows are untouched
 *   - skips drafts and admin-created documents
 *   - never creates a folder; a member with no personal folder is reported
 *   - the update is guarded on the old event_id, so a concurrent refile wins
 *   - idempotent: a second run reports 0 moves
 *
 * Run: node --env-file=.env scripts/refile-org-member-orders.mjs
 *      node --env-file=.env scripts/refile-org-member-orders.mjs --apply
 *      node --env-file=.env scripts/refile-org-member-orders.mjs --org-id <uuid>
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMisfiledAgentOrder } from '../lib/events/agentFolderMatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(path.join(__dirname, '..', f)); } catch {}
}

const APPLY = process.argv.includes('--apply');
const argOrgId = (() => {
  const i = process.argv.indexOf('--org-id');
  return i > -1 ? process.argv[i + 1] : null;
})();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — run with node --env-file=.env');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: agentEvents, error: eventsErr } = await supabase
  .from('events')
  .select('id, name, organization_id, created_by')
  .eq('type', 'agent');
if (eventsErr) {
  console.error(`Failed to read events: ${eventsErr.message}`);
  process.exit(1);
}

const { data: profiles, error: profilesErr } = await supabase
  .from('profiles')
  .select('id, full_name, email, role, organization_id');
if (profilesErr) {
  console.error(`Failed to read profiles: ${profilesErr.message}`);
  process.exit(1);
}
const profileById = new Map((profiles || []).map((p) => [p.id, p]));

// Profile ids sharing one email — a re-invited agent keeps a second row.
const idsByEmail = new Map();
for (const p of profiles || []) {
  const email = String(p.email || '').trim().toLowerCase();
  if (!email) continue;
  if (!idsByEmail.has(email)) idsByEmail.set(email, []);
  idsByEmail.get(email).push(p.id);
}
const userIdsFor = (profile) => {
  const email = String(profile?.email || '').trim().toLowerCase();
  return email ? (idsByEmail.get(email) || [profile.id]) : [profile.id];
};

const { data: memberships, error: memErr } = await supabase
  .from('organization_memberships')
  .select('user_id, organization_id, deleted_at');
if (memErr) {
  console.error(`Failed to read memberships: ${memErr.message}`);
  process.exit(1);
}

const orgsByUser = new Map();
const addOrg = (userId, orgId) => {
  if (!userId || !orgId) return;
  if (!orgsByUser.has(userId)) orgsByUser.set(userId, new Set());
  orgsByUser.get(userId).add(orgId);
};
for (const m of memberships || []) {
  if (m.deleted_at) continue;
  addOrg(m.user_id, m.organization_id);
}
for (const p of profiles || []) addOrg(p.id, p.organization_id);

const eventById = new Map((agentEvents || []).map((e) => [e.id, e]));
const relevantEventIds = (agentEvents || [])
  .filter((e) => !argOrgId || e.organization_id === argOrgId)
  .map((e) => e.id);

if (relevantEventIds.length === 0) {
  console.log('No agent folders in scope — nothing to do.');
  process.exit(0);
}

const { data: docs, error: docsErr } = await supabase
  .from('documents')
  .select('id, client_name, client_company, total_amount, created_by, created_at, order_channel, status, event_id, document_type')
  .in('event_id', relevantEventIds)
  .is('deleted_at', null)
  .neq('status', 'draft')
  .order('created_at', { ascending: true });
if (docsErr) {
  console.error(`Failed to read documents: ${docsErr.message}`);
  process.exit(1);
}

let moved = 0;
let failed = 0;
const skipReasons = new Map();
const noFolder = new Set();

for (const doc of docs || []) {
  const profile = profileById.get(doc.created_by) || null;
  const decision = resolveMisfiledAgentOrder({
    document: doc,
    profile,
    orgIds: orgsByUser.get(doc.created_by) || [],
    agentEvents: agentEvents || [],
    userIds: profile ? userIdsFor(profile) : [],
  });

  if (decision.action !== 'move') {
    skipReasons.set(decision.reason, (skipReasons.get(decision.reason) || 0) + 1);
    if (decision.reason === 'no personal folder exists yet' && profile) {
      noFolder.add(profile.full_name || profile.email || profile.id);
    }
    continue;
  }

  const who = profile.full_name || profile.email;
  const from = eventById.get(doc.event_id)?.name || doc.event_id;
  const label = `${doc.created_at?.slice(0, 10)} €${doc.total_amount} ${doc.client_company || doc.client_name} (by ${who})`;

  if (!APPLY) {
    console.log(`[dry-run] ${label}: "${from}" → "${decision.targetEvent.name}"`);
    moved += 1;
    continue;
  }

  const { error } = await supabase
    .from('documents')
    .update({ event_id: decision.targetEvent.id })
    .eq('id', doc.id)
    .eq('event_id', doc.event_id); // guard against a concurrent refile
  if (error) {
    console.error(`✗ ${label}: ${error.message}`);
    failed += 1;
  } else {
    console.log(`✓ ${label}: "${from}" → "${decision.targetEvent.name}"`);
    moved += 1;
  }
}

console.log(`\nScanned ${docs?.length || 0} filed documents in ${relevantEventIds.length} agent folders.`);
if (skipReasons.size > 0) {
  console.log('Left alone:');
  for (const [reason, count] of [...skipReasons.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${reason}`);
  }
}
if (noFolder.size > 0) {
  console.log(`\n⚠ No personal folder yet for: ${[...noFolder].join(', ')}`);
  console.log('  Run scripts/backfill-org-agent-subfolders.mjs --apply first, or invite them again.');
}
if (failed > 0) console.log(`\n✗ ${failed} update(s) failed.`);
console.log(APPLY
  ? `\nDone — ${moved} order(s) refiled.`
  : `\nDry run only — ${moved} order(s) would move. Re-run with --apply to write.`);
