/**
 * One-shot: sync customer_paid_at from each type='order' commission to its
 * linked type='new_client_bonus' commission.
 *
 * Run after Phase 19d when the cascade was added to the API endpoint.
 * Catches up any orders that were already ticked Paid before the cascade
 * was wired. Idempotent — running twice has no effect.
 *
 * Usage:  node scripts/sync-bonus-customer-paid.mjs
 *         node scripts/sync-bonus-customer-paid.mjs --dry-run
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(path.join(__dirname, '..', f)); } catch {}
}

const DRY = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Find every type='order' commission that has a customer_paid_at AND a
// matching new_client_bonus row whose customer_paid_at is still null.
const { data: orders, error: ordersErr } = await supabase
  .from('agent_commissions')
  .select('id, agent_id, document_id, customer_paid_at')
  .eq('type', 'order')
  .not('customer_paid_at', 'is', null)
  .not('document_id', 'is', null);

if (ordersErr) {
  console.error('Failed to fetch paid orders:', ordersErr.message);
  process.exit(1);
}

console.log(`📦 ${orders.length} type='order' commission(s) with customer_paid_at set.`);

let synced = 0;
let alreadyOk = 0;
let noBonus = 0;

for (const o of orders) {
  // Find the matching bonus row (if any).
  const { data: bonus } = await supabase
    .from('agent_commissions')
    .select('id, customer_paid_at')
    .eq('agent_id', o.agent_id)
    .eq('document_id', o.document_id)
    .eq('type', 'new_client_bonus')
    .maybeSingle();

  if (!bonus) {
    noBonus += 1;
    continue;
  }
  if (bonus.customer_paid_at) {
    alreadyOk += 1;
    continue;
  }

  console.log(`   → Syncing bonus ${bonus.id.slice(0,8)} ← order ${o.id.slice(0,8)} (paid ${o.customer_paid_at})`);

  if (!DRY) {
    const { error } = await supabase
      .from('agent_commissions')
      .update({ customer_paid_at: o.customer_paid_at })
      .eq('id', bonus.id);
    if (error) {
      console.error(`     ❌ ${error.message}`);
      continue;
    }
  }
  synced += 1;
}

console.log('');
console.log(`✅ Synced ${synced} bonus row(s)${DRY ? ' (DRY RUN)' : ''}.`);
console.log(`   Already in sync:           ${alreadyOk}`);
console.log(`   Orders with no bonus row:  ${noBonus}`);
