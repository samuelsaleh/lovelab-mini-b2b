/**
 * One-off repair — 4 manually-entered orders sit in the "ONLINE B2C" event
 * but were saved with order_channel 'b2b', so the analytics B2C toggle
 * misses them. Sam approved flipping them to 'b2c' (2026-07-17).
 *
 * Explicit ID allowlist — verifies each doc still matches expectations
 * (channel b2b + ONLINE B2C event) before updating.
 *
 * Run: node scripts/repair-online-b2c-channels.mjs
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

const TARGETS = [
  { id: 'e75f7a82-272a-48de-b127-aa7f6cde9ff8', label: 'JULIA KALDY €735.25' },
  { id: '78f2d33f-61c3-463e-bfac-200ef1aa7a71', label: 'BLUSH CONCEPT STORE €880' },
  { id: 'd02ff569-52bd-406c-848c-a4aad837e317', label: 'kim €400' },
  { id: '53d621fa-ddc3-4f9f-9014-b6f912c3af11', label: 'Gonzalez miami €360' },
];

const { data: b2cEvent } = await supabase
  .from('events').select('id, name').eq('name', 'ONLINE B2C').single();
if (!b2cEvent) { console.error('ONLINE B2C event not found'); process.exit(1); }

for (const t of TARGETS) {
  const { data: doc, error } = await supabase
    .from('documents')
    .select('id, order_channel, event_id, total_amount, client_name, client_company, deleted_at')
    .eq('id', t.id)
    .single();
  if (error || !doc) { console.error(`✗ ${t.label}: not found (${error?.message})`); continue; }
  if (doc.deleted_at) { console.error(`✗ ${t.label}: document is trashed — skipping`); continue; }
  if (doc.order_channel !== 'b2b' || doc.event_id !== b2cEvent.id) {
    console.error(`✗ ${t.label}: state changed (channel=${doc.order_channel}, event=${doc.event_id}) — skipping`);
    continue;
  }
  const { error: upErr } = await supabase
    .from('documents')
    .update({ order_channel: 'b2c' })
    .eq('id', t.id);
  if (upErr) console.error(`✗ ${t.label}: update failed — ${upErr.message}`);
  else console.log(`✓ ${t.label} → order_channel = b2c`);
}

// Verify final state
const { data: check } = await supabase
  .from('documents')
  .select('id, order_channel, client_name, client_company, total_amount')
  .in('id', TARGETS.map(t => t.id));
console.log('\nFinal state:');
for (const d of check) {
  console.log(`  [${d.order_channel}] ${(d.client_company || d.client_name)} €${d.total_amount}`);
}
