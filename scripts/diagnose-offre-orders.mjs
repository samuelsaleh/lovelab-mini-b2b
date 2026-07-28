/**
 * READ-ONLY diagnostic — parked orders split by folder (Draft vs Offre).
 *
 * An Offre is a parked order (status='draft') carrying draft_kind='offre' so it
 * shows on the admin-only Offre page instead of the shared Draft page. Use this
 * to confirm that:
 *   - supabase-phase25-offre-orders.sql has been applied (the column exists);
 *   - no pre-existing draft was moved out of the Draft folder by mistake;
 *   - the Offre folder contains what the UI shows.
 *
 * Run: node scripts/diagnose-offre-orders.mjs
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

// Probe the column first so the script is useful before AND after the migration.
const probe = await supabase.from('documents').select('draft_kind').limit(1);
const columnExists = !probe.error;

if (!columnExists) {
  console.log('documents.draft_kind is MISSING.');
  console.log('  → Apply database-migrations/supabase-phase25-offre-orders.sql in the Supabase SQL editor.');
  console.log(`  (server said: ${probe.error.message})\n`);
}

const columns = [
  'id', 'client_name', 'client_company', 'total_amount', 'order_channel',
  'event_id', 'created_by', 'created_at',
  ...(columnExists ? ['draft_kind'] : []),
].join(', ');

const { data: parked, error } = await supabase
  .from('documents')
  .select(columns)
  .eq('status', 'draft')
  .is('deleted_at', null)
  .order('created_at', { ascending: false });

if (error) {
  console.error('Failed to read parked orders:', error.message);
  process.exit(1);
}

const { data: profiles } = await supabase.from('profiles').select('id, full_name, email');
const nameById = new Map((profiles || []).map((p) => [p.id, p.full_name || p.email]));

const offres = (parked || []).filter((d) => d.draft_kind === 'offre');
const drafts = (parked || []).filter((d) => d.draft_kind !== 'offre');

function print(label, rows) {
  console.log(`${label}: ${rows.length}`);
  for (const d of rows) {
    const who = nameById.get(d.created_by) || d.created_by;
    const folder = d.event_id ? ` FILED IN ${d.event_id}` : '';
    console.log(
      `  · ${(d.client_company || d.client_name || '—').padEnd(28)} ` +
      `${String(d.total_amount ?? 0).padStart(8)} €  ${d.order_channel}  ` +
      `${d.created_at?.slice(0, 10)}  ${who}${folder}`,
    );
  }
}

console.log('Parked orders (status = draft)');
console.log('=============================');
print('Draft folder', drafts);
print('Offre folder', offres);

// Parked orders must never sit in a folder — that is what keeps them out of
// event folders and revenue.
const filed = (parked || []).filter((d) => d.event_id);
if (filed.length > 0) {
  console.log(`\nWARNING: ${filed.length} parked order(s) have an event_id — they should be unfiled until sent.`);
}
