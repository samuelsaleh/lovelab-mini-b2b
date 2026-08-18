/**
 * READ-ONLY audit — the "before" snapshot for the Agents / Organizations /
 * Fair-attribution reorganization (Phase 0).
 *
 * Prints, with ZERO writes:
 *   1. Every agent profile (is_agent=true) with org / status / rate.
 *   2. Every organization, flagging duplicate names.
 *   3. Every agent-type event (folder), flagging orphans (organization_id null)
 *      and agents that own more than one folder.
 *   4. Per non-deleted revenue order: the agent it resolves to today (via the
 *      SAME resolveCommissionAgent used by the app) and the fair it is tagged
 *      to — so we know exactly what Phase 1's agent_id backfill will produce.
 *   5. Derived per-agent totals (orders / revenue) — the baseline the Phase 1
 *      invariant check must reproduce exactly.
 *
 * Run: node scripts/audit-agents-orgs.mjs
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCommissionAgent } from '../lib/commissionAttribution.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(path.join(__dirname, '..', f)); } catch {}
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const EXCLUDED_CHANNELS = ['internal', 'consignment', 'delete_from_stock', 'sample'];
const eur = (n) => '\u20ac' + (Math.round((n || 0) * 100) / 100).toLocaleString('en-US');
const hr = (c = '\u2500') => c.repeat(84);

// ── 1. Agents ────────────────────────────────────────────────────────────────
const { data: agents, error: agentErr } = await supabase
  .from('profiles')
  .select('id, full_name, email, is_agent, agent_status, commission_rate, organization_id')
  .eq('is_agent', true)
  .order('full_name');
if (agentErr) { console.error('agents query failed:', agentErr.message); process.exit(1); }

console.log(hr('\u2550'));
console.log(`AGENTS (is_agent=true): ${agents.length}`);
console.log(hr());
for (const a of agents) {
  console.log(`  ${(a.full_name || a.email || a.id).padEnd(30)} | org=${a.organization_id || 'NULL'} | ${a.agent_status} | rate=${a.commission_rate}`);
}

// Silke is a special case: currently NOT an agent, but Phase 2 makes her one.
const { data: silke } = await supabase
  .from('profiles')
  .select('id, full_name, email, is_agent, agent_status, commission_rate, organization_id')
  .ilike('email', '%silke%')
  .maybeSingle();
if (silke) {
  console.log('\n  NOTE — Silke (to become an agent in Phase 2):');
  console.log(`    ${silke.full_name} <${silke.email}> | is_agent=${silke.is_agent} | org=${silke.organization_id || 'NULL'} | rate=${silke.commission_rate}`);
}

// ── 2. Organizations (+ duplicate detection) ─────────────────────────────────
const { data: orgs, error: orgErr } = await supabase
  .from('organizations')
  .select('id, name, deleted_at')
  .is('deleted_at', null)
  .order('name');
if (orgErr) { console.error('orgs query failed:', orgErr.message); process.exit(1); }

const orgByName = new Map();
for (const o of orgs) {
  const key = (o.name || '').trim().toLowerCase();
  if (!orgByName.has(key)) orgByName.set(key, []);
  orgByName.get(key).push(o);
}
console.log('\n' + hr('\u2550'));
console.log(`ORGANIZATIONS: ${orgs.length}`);
console.log(hr());
for (const o of orgs) console.log(`  ${(o.name || '').padEnd(38)} | ${o.id}`);
const dupOrgs = [...orgByName.entries()].filter(([, list]) => list.length > 1);
if (dupOrgs.length) {
  console.log('\n  DUPLICATE org names (candidates to merge/retire):');
  for (const [name, list] of dupOrgs) console.log(`    "${name}": ${list.map((o) => o.id).join(', ')}`);
}

// ── 3. Agent-type events (folders) ───────────────────────────────────────────
const { data: agentEvents, error: evErr } = await supabase
  .from('events')
  .select('id, name, organization_id, created_by')
  .eq('type', 'agent')
  .order('name');
if (evErr) { console.error('agent events query failed:', evErr.message); process.exit(1); }

console.log('\n' + hr('\u2550'));
console.log(`AGENT-TYPE EVENTS (folders): ${agentEvents.length}`);
console.log(hr());
const orphans = [];
const folderNameCount = new Map();
for (const e of agentEvents) {
  const key = (e.name || '').trim().toLowerCase();
  folderNameCount.set(key, (folderNameCount.get(key) || 0) + 1);
  const orphan = !e.organization_id;
  if (orphan) orphans.push(e);
  console.log(`  ${(e.name || '').padEnd(30)} | org=${e.organization_id || 'NULL (ORPHAN)'} | id=${e.id}`);
}
if (orphans.length) {
  console.log('\n  ORPHAN folders (organization_id null — invisible in Documents sidebar):');
  for (const e of orphans) console.log(`    "${e.name}"  id=${e.id}`);
}

// Same person, multiple folders (e.g. Bastian B2B + Bastian Mayer). A folder
// "belongs to" an agent when its name matches the agent's name OR it was
// created_by that agent. We deliberately do NOT match on shared org, because a
// multi-member org (e.g. Sarah Goutard Organization has 9 sub-agents) would
// otherwise flag every member as a duplicate. Solo owners created their own
// folder, so created_by catches the real splits.
const nameKey = (v) => (v || '').trim().toLowerCase();
const agentById = new Map(agents.map((a) => [a.id, a]));
console.log('\n  Split identities (one agent, more than one folder):');
let splitFound = false;
for (const a of agents) {
  const key = nameKey(a.full_name);
  const mine = agentEvents.filter(
    (e) => (key && nameKey(e.name) === key) || e.created_by === a.id,
  );
  if (mine.length > 1) {
    splitFound = true;
    console.log(`    ${a.full_name}: ${mine.length} folders -> ${mine.map((m) => `"${m.name}"${m.organization_id ? '' : ' (orphan)'}`).join(', ')}`);
  }
}
// Orphan folders whose creator is a known agent also count as splits even when
// the names differ (Bastian B2B is created_by Bastian Mayer).
for (const e of orphans) {
  const owner = agentById.get(e.created_by);
  if (owner && nameKey(owner.full_name) !== nameKey(e.name)) {
    splitFound = true;
    console.log(`    ${owner.full_name}: owns orphan folder "${e.name}" (id=${e.id}) that does not match their name`);
  }
}
if (!splitFound) console.log('    (none)');

// ── 4 & 5. Per-order derived agent + fair, and per-agent totals ──────────────
console.log('\n' + hr('\u2550'));
console.log('DERIVING per-order agent (same logic as the app) — this may take a moment...');
console.log(hr());

// Page through every non-deleted, revenue order.
const orderDocs = [];
let from = 0;
const PAGE = 1000;
while (true) {
  const { data: batch, error } = await supabase
    .from('documents')
    .select('id, created_by, event_id, total_amount, document_type, status, order_channel, client_company, client_name, events(name, type)')
    .is('deleted_at', null)
    .eq('document_type', 'order')
    .range(from, from + PAGE - 1);
  if (error) { console.error('documents query failed:', error.message); process.exit(1); }
  orderDocs.push(...(batch || []));
  if (!batch || batch.length < PAGE) break;
  from += PAGE;
}

const revenueOrders = orderDocs.filter(
  (d) => d.status !== 'draft' && !EXCLUDED_CHANNELS.includes(d.order_channel),
);

const profileName = new Map(agents.map((a) => [a.id, a.full_name || a.email]));
if (silke) profileName.set(silke.id, silke.full_name || silke.email);

const perAgent = new Map(); // agentId -> { name, orders, revenue }
let unattributed = 0;
let unattributedRevenue = 0;

for (const d of revenueOrders) {
  const res = await resolveCommissionAgent(supabase, {
    id: d.id,
    created_by: d.created_by,
    event_id: d.event_id,
  });
  if (!res) {
    unattributed += 1;
    unattributedRevenue += d.total_amount || 0;
    continue;
  }
  const name = profileName.get(res.agentId) || res.profile?.full_name || res.agentId;
  if (!perAgent.has(res.agentId)) perAgent.set(res.agentId, { name, orders: 0, revenue: 0 });
  const entry = perAgent.get(res.agentId);
  entry.orders += 1;
  entry.revenue += d.total_amount || 0;
}

const rows = [...perAgent.values()].sort((a, b) => b.revenue - a.revenue);
console.log(`\nPER-AGENT DERIVED TOTALS (revenue orders only): ${revenueOrders.length} orders total`);
console.log(hr());
for (const r of rows) {
  console.log(`  ${r.name.padEnd(30)} | orders=${String(r.orders).padStart(4)} | ${eur(r.revenue)}`);
}
console.log(hr());
const attributedRevenue = rows.reduce((s, r) => s + r.revenue, 0);
const attributedOrders = rows.reduce((s, r) => s + r.orders, 0);
console.log(`  Attributed:   ${String(attributedOrders).padStart(4)} orders | ${eur(attributedRevenue)}`);
console.log(`  Unattributed: ${String(unattributed).padStart(4)} orders | ${eur(unattributedRevenue)}  (no agent resolvable today)`);
console.log(`  GRAND TOTAL:  ${String(revenueOrders.length).padStart(4)} orders | ${eur(attributedRevenue + unattributedRevenue)}`);

// ── Fair breakdown for the two spotlight agents ──────────────────────────────
const spotlight = [];
const bastian = agents.find((a) => (a.full_name || '').toLowerCase().includes('bastian'));
if (bastian) spotlight.push(bastian.id);
if (silke) spotlight.push(silke.id);

for (const agentId of spotlight) {
  const mine = revenueOrders.filter((d) => d.created_by === agentId);
  if (mine.length === 0) continue;
  console.log('\n' + hr());
  console.log(`FAIR BREAKDOWN for ${profileName.get(agentId)} (orders they created):`);
  const byFolder = new Map();
  for (const d of mine) {
    const label = d.events ? `${d.events.name} [${d.events.type}]` : '(no event)';
    if (!byFolder.has(label)) byFolder.set(label, { orders: 0, revenue: 0 });
    const e = byFolder.get(label);
    e.orders += 1;
    e.revenue += d.total_amount || 0;
  }
  for (const [label, e] of byFolder) {
    console.log(`  ${label.padEnd(34)} | orders=${String(e.orders).padStart(3)} | ${eur(e.revenue)}`);
  }
}

console.log('\n' + hr('\u2550'));
console.log('AUDIT COMPLETE — no data was modified.');
console.log(hr('\u2550'));
