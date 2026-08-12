/**
 * Set an agent's new-client bonus mode without touching the bonus rows they
 * already earned.
 *
 *   off     no bonus at all.
 *   manual  nothing is created on order save; the admin grants it per order
 *           with the button in the commission table.
 *   auto    created automatically on the first order for a new customer.
 *
 * Existing agent_commissions rows of type 'new_client_bonus' are deliberately
 * left alone — once earned, always earned. The script snapshots those rows
 * before and after the change and exits non-zero if anything about them moved.
 *
 * Requires the 20260812120000_new_client_bonus_mode migration. The script
 * checks for it and prints what to run if it is missing.
 *
 * Usage:
 *   node scripts/set-agent-bonus.mjs --agent <id> --mode manual
 *   node scripts/set-agent-bonus.mjs --agent <id> --mode auto --amount 200
 *   node scripts/set-agent-bonus.mjs --agent <id> --mode manual --dry-run
 *   node scripts/set-agent-bonus.mjs --agent <id> --off   (legacy alias for --mode off)
 *   node scripts/set-agent-bonus.mjs --agent <id> --on    (legacy alias for --mode auto)
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(path.join(__dirname, '..', f)); } catch {}
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

const MODES = ['off', 'manual', 'auto'];

const DRY = process.argv.includes('--dry-run');
const AGENT_ID = argValue('--agent') || '3e3c4bcc-e6b8-4c64-8ac5-e1ee2537363f'; // Nicolas Wholesale France
const AMOUNT_ARG = argValue('--amount');

const MODE = argValue('--mode')
  || (process.argv.includes('--off') ? 'off' : null)
  || (process.argv.includes('--on') ? 'auto' : null);

if (!MODES.includes(MODE)) {
  console.error(`❌ Pass --mode ${MODES.join('|')} (or the legacy --off / --on).`);
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function snapshotBonusRows(agentId) {
  const { data, error } = await supabase
    .from('agent_commissions')
    .select('id, status, commission_amount, customer_paid_at, report_id, created_at')
    .eq('agent_id', agentId)
    .eq('type', 'new_client_bonus')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to read bonus rows: ${error.message}`);

  const rows = data || [];
  const byStatus = {};
  for (const r of rows) {
    const key = r.report_id ? `${r.status}/reported` : r.status;
    byStatus[key] = (byStatus[key] || 0) + 1;
  }
  return {
    count: rows.length,
    total: rows.reduce((sum, r) => sum + Number(r.commission_amount || 0), 0),
    byStatus,
    // Serialised per-row fingerprint so a silent field change is caught too.
    fingerprint: rows
      .map((r) => `${r.id}:${r.status}:${r.commission_amount}:${r.customer_paid_at || '-'}:${r.report_id || '-'}`)
      .join('|'),
  };
}

function describe(snap) {
  return `${snap.count} row(s), €${snap.total}, ${JSON.stringify(snap.byStatus)}`;
}

const { error: columnErr } = await supabase.from('profiles').select('new_client_bonus_mode').limit(1);
if (columnErr) {
  console.error('❌ The new_client_bonus_mode column does not exist yet.');
  console.error('   Run supabase/migrations/20260812120000_new_client_bonus_mode.sql');
  console.error('   in the Supabase SQL editor first, then re-run this script.');
  process.exit(1);
}

const { data: profile, error: profErr } = await supabase
  .from('profiles')
  .select('id, full_name, email, is_agent, agent_deleted_at, new_client_bonus_mode, new_client_bonus_enabled, new_client_bonus_amount')
  .eq('id', AGENT_ID)
  .maybeSingle();

if (profErr) {
  console.error('❌ Could not fetch agent:', profErr.message);
  process.exit(1);
}
if (!profile || !profile.is_agent || profile.agent_deleted_at) {
  console.error(`❌ ${AGENT_ID} is not an active agent.`);
  process.exit(1);
}

const nextEnabled = MODE !== 'off';
// Keep the existing amount when switching off so the historic value stays
// visible and re-enabling doesn't need it retyped.
const nextAmount = nextEnabled
  ? Number(AMOUNT_ARG ?? profile.new_client_bonus_amount)
  : (profile.new_client_bonus_amount == null ? null : Number(profile.new_client_bonus_amount));

if (nextEnabled && (!Number.isFinite(nextAmount) || nextAmount <= 0)) {
  console.error(`❌ --mode ${MODE} requires a positive --amount (or an amount already stored on the profile).`);
  process.exit(1);
}

console.log(`👤 Agent: ${profile.full_name} <${profile.email}>`);
console.log(`   now:  mode=${profile.new_client_bonus_mode}  enabled=${profile.new_client_bonus_enabled}  amount=€${profile.new_client_bonus_amount}`);
console.log(`   next: mode=${MODE}  enabled=${nextEnabled}  amount=€${nextAmount}`);
console.log('');

const before = await snapshotBonusRows(AGENT_ID);
console.log(`📦 Existing bonus rows before: ${describe(before)}`);
console.log('');

if (
  MODE === profile.new_client_bonus_mode &&
  nextEnabled === profile.new_client_bonus_enabled &&
  nextAmount === Number(profile.new_client_bonus_amount)
) {
  console.log('✅ Already in the requested state — nothing to do.');
  process.exit(0);
}

if (DRY) {
  console.log('🟡 DRY RUN — profile not modified. Re-run without --dry-run to apply.');
  process.exit(0);
}

const { error: updateErr } = await supabase
  .from('profiles')
  .update({
    new_client_bonus_mode: MODE,
    new_client_bonus_enabled: nextEnabled,
    new_client_bonus_amount: nextAmount,
  })
  .eq('id', AGENT_ID);

if (updateErr) {
  console.error('❌ Failed to update profile:', updateErr.message);
  process.exit(1);
}

const { data: after } = await supabase
  .from('profiles')
  .select('new_client_bonus_mode, new_client_bonus_enabled, new_client_bonus_amount')
  .eq('id', AGENT_ID)
  .single();

console.log(`✅ Profile updated: mode=${after.new_client_bonus_mode}  enabled=${after.new_client_bonus_enabled}  amount=€${after.new_client_bonus_amount}`);
console.log('');

const afterSnap = await snapshotBonusRows(AGENT_ID);
console.log(`📦 Existing bonus rows after:  ${describe(afterSnap)}`);

if (afterSnap.fingerprint !== before.fingerprint) {
  console.error('');
  console.error('❌ VERIFICATION FAILED — existing bonus rows changed. Investigate immediately.');
  process.exit(1);
}

console.log('');
console.log('✅ Verified: every existing bonus row is untouched.');
if (MODE === 'off') {
  console.log('   No new-client bonus will be created for this agent, by anyone.');
} else if (MODE === 'manual') {
  console.log('   Orders no longer create a bonus on save. Grant it per order with');
  console.log('   the "+ bonus" button in the commission table on the agent page.');
} else {
  console.log('   The first order from a new customer will create the bonus again.');
}
