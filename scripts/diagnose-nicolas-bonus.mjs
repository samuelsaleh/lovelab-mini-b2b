/**
 * Diagnostic — does Nicolas have new_client_bonus rows for his customers?
 * Run: node scripts/diagnose-nicolas-bonus.mjs
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

const NICOLAS_ID = '3e3c4bcc-e6b8-4c64-8ac5-e1ee2537363f';

const { data: profile } = await supabase
  .from('profiles')
  .select('id, full_name, new_client_bonus_enabled, new_client_bonus_amount, commission_rate')
  .eq('id', NICOLAS_ID)
  .single();

console.log('👤 Nicolas profile:');
console.log(`   bonus_enabled: ${profile.new_client_bonus_enabled}`);
console.log(`   bonus_amount:  €${profile.new_client_bonus_amount}`);
console.log(`   rate:          ${profile.commission_rate}%`);
console.log('');

const { data: comms } = await supabase
  .from('agent_commissions')
  .select(`
    id, type, status, commission_amount, order_total, customer_paid_at, created_at, document_id, notes,
    document:documents (id, client_company, client_name)
  `)
  .eq('agent_id', NICOLAS_ID)
  .neq('status', 'cancelled')
  .order('created_at', { ascending: true });

console.log(`📦 ${comms.length} commission row(s) for Nicolas:`);
console.log('');
console.log('TYPE              | STATUS  | AMT       | PAID_AT             | CUSTOMER');
console.log('─'.repeat(95));
for (const c of comms) {
  const cust = c.document?.client_company || c.document?.client_name || c.notes || '(unknown)';
  const paid = c.customer_paid_at ? '✅ ' + new Date(c.customer_paid_at).toISOString().slice(0,10) : '❌ not yet         ';
  const type = c.type.padEnd(17);
  const status = c.status.padEnd(7);
  const amt = `€${c.commission_amount}`.padEnd(9);
  console.log(`${type} | ${status} | ${amt} | ${paid} | ${cust}`);
}

const orderRows = comms.filter(c => c.type === 'order');
const bonusRows = comms.filter(c => c.type === 'new_client_bonus');
console.log('');
console.log(`📊 Summary:`);
console.log(`   Orders:               ${orderRows.length}`);
console.log(`   New-client bonuses:   ${bonusRows.length}`);
console.log(`   Expected bonuses (1 per unique customer): ${new Set(orderRows.map(r => r.document?.client_company || r.document?.client_name)).size}`);

if (bonusRows.length === 0 && profile.new_client_bonus_enabled) {
  console.log('');
  console.log('⚠  BONUS ROWS MISSING — backfill needed.');
  console.log('   Possible causes:');
  console.log('   1. Sam clicked Save in the modal but the backfill silently failed.');
  console.log('   2. The constraint fix migration was applied AFTER the backfill ran, so it errored.');
  console.log('   3. Sam saved the bonus settings before clicking the modal at all.');
}
