/**
 * Diagnostic — why can't agent "Bastien" save orders?
 * Read-only. Run: node scripts/diagnose-bastien-orders.mjs
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

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '—');

// ── 1. Find Bastien ──────────────────────────────────────────────────────────
const { data: matches, error: pErr } = await supabase
  .from('profiles')
  .select('id, full_name, email, is_agent, agent_status, commission_rate, organization_id, agent_commission_config, new_client_bonus_enabled, new_client_bonus_amount')
  .ilike('full_name', '%bastian%');

if (pErr) { console.error('profile lookup failed:', pErr.message); process.exit(1); }
if (!matches?.length) { console.error('No profile matching "bastien".'); process.exit(1); }

for (const profile of matches) {
  console.log('═'.repeat(80));
  console.log(`👤 ${profile.full_name}  <${profile.email}>`);
  console.log(`   id:            ${profile.id}`);
  console.log(`   is_agent:      ${profile.is_agent}`);
  console.log(`   agent_status:  ${profile.agent_status}`);
  console.log(`   commission:    ${profile.commission_rate}%`);
  console.log(`   org_id:        ${profile.organization_id || '—'}`);
  console.log(`   commission_cfg:${JSON.stringify(profile.agent_commission_config)}`);
  console.log(`   bonus_enabled: ${profile.new_client_bonus_enabled}`);
  console.log(`   bonus_amount:  €${profile.new_client_bonus_amount}`);
  console.log('');

  // ── 2. Recent documents created by Bastien ──────────────────────────────────
  const { data: docs, error: dErr } = await supabase
    .from('documents')
    .select('id, created_at, document_type, order_channel, status, client_company, client_name, total_amount, file_path, deleted_at')
    .eq('created_by', profile.id)
    .order('created_at', { ascending: false })
    .limit(15);
  if (dErr) console.error('   documents query failed:', dErr.message);
  else {
    console.log(`📄 Last ${docs.length} document(s) by ${profile.full_name}:`);
    console.log('   CREATED_AT          | TYPE  | CHANNEL     | STATUS | TOTAL    | CLIENT');
    console.log('   ' + '─'.repeat(90));
    for (const d of docs) {
      console.log(`   ${iso(d.created_at)} | ${(d.document_type||'').padEnd(5)} | ${(d.order_channel||'').padEnd(11)} | ${(d.status||'').padEnd(6)} | €${String(d.total_amount||0).padEnd(7)} | ${d.client_company || d.client_name || '—'}${d.deleted_at ? '  [DELETED]' : ''}`);
    }
    console.log('');
  }

  // ── 3. Recent commission rows ────────────────────────────────────────────────
  const { data: comms } = await supabase
    .from('agent_commissions')
    .select('id, type, status, commission_amount, created_at, document_id')
    .eq('agent_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(10);
  console.log(`💶 Last ${comms?.length || 0} commission row(s):`);
  for (const c of comms || []) {
    console.log(`   ${iso(c.created_at)} | ${c.type.padEnd(17)} | ${c.status.padEnd(9)} | €${c.commission_amount} | doc ${c.document_id}`);
  }
  console.log('');
}

// ── 4. Recent system health events (server-side errors) ───────────────────────
console.log('═'.repeat(80));
const { data: health, error: hErr } = await supabase
  .from('system_health_events')
  .select('created_at, source, severity, message, context')
  .order('created_at', { ascending: false })
  .limit(25);
if (hErr) {
  console.error('⚠  system_health_events query failed:', hErr.message);
} else {
  console.log(`🩺 Last ${health.length} system_health_events:`);
  for (const h of health) {
    console.log(`   ${iso(h.created_at)} [${h.severity}] ${h.source}`);
    console.log(`        ${h.message}`);
    if (h.context) console.log(`        ctx: ${JSON.stringify(h.context)}`);
  }
}
