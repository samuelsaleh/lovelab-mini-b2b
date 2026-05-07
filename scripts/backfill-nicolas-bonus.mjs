/**
 * One-shot: backfill Nicolas's missing new_client_bonus rows.
 *
 * Calls lib/newClientBonus.js#executeBackfill which is the same code
 * the "Enable bonus" modal triggers. Idempotent — running it twice
 * inserts no new rows because executeBackfill checks for existing
 * (agent_id, document_id, type='new_client_bonus') first.
 *
 * Usage:  node scripts/backfill-nicolas-bonus.mjs
 *         node scripts/backfill-nicolas-bonus.mjs --dry-run
 *         node scripts/backfill-nicolas-bonus.mjs --agent <agent_id>
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewBackfill, executeBackfill } from '../lib/newClientBonus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(path.join(__dirname, '..', f)); } catch {}
}

const DRY = process.argv.includes('--dry-run');
const agentArgIdx = process.argv.indexOf('--agent');
const AGENT_ID = agentArgIdx !== -1 ? process.argv[agentArgIdx + 1] : '3e3c4bcc-e6b8-4c64-8ac5-e1ee2537363f'; // Nicolas

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: profile, error: profErr } = await supabase
  .from('profiles')
  .select('id, full_name, new_client_bonus_enabled, new_client_bonus_amount')
  .eq('id', AGENT_ID)
  .single();

if (profErr || !profile) {
  console.error('❌ Could not fetch agent:', profErr?.message);
  process.exit(1);
}
if (!profile.new_client_bonus_enabled) {
  console.error(`❌ ${profile.full_name}: new_client_bonus_enabled is FALSE. Enable in the UI first.`);
  process.exit(1);
}
const amt = Number(profile.new_client_bonus_amount);
if (!Number.isFinite(amt) || amt <= 0) {
  console.error(`❌ ${profile.full_name}: new_client_bonus_amount is invalid (${profile.new_client_bonus_amount}).`);
  process.exit(1);
}

console.log(`👤 Agent: ${profile.full_name}`);
console.log(`💰 Bonus amount: €${amt} per new client`);
console.log('');

// 1) Preview
const preview = await previewBackfill(supabase, AGENT_ID, amt);
console.log(`🔍 Preview: ${preview.rows.length} new customer(s) eligible, total €${preview.total}`);
preview.rows.forEach((r, i) => {
  console.log(`   ${i + 1}. ${r.customer || '(unknown)'}  →  €${amt}`);
});
console.log('');

if (preview.rows.length === 0) {
  console.log('✅ Nothing to backfill — all customers already have bonus rows (or none qualify).');
  process.exit(0);
}

if (DRY) {
  console.log('🟡 DRY RUN — no rows inserted. Re-run without --dry-run to apply.');
  process.exit(0);
}

// 2) Execute
const result = await executeBackfill(supabase, AGENT_ID, amt);
console.log(`✅ Inserted ${result.created} new_client_bonus row(s), total €${result.total}.`);
console.log('');
console.log('Now go check the agent page — you should see:');
console.log(`  • ${result.created} new "NEW" rows in the Commission History`);
console.log(`  • READY TO PAY increased by the bonus amount of any customer whose order is already ticked Paid`);
