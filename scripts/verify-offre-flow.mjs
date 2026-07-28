/**
 * Live verification of the Offre storage layer (safe: creates ONE temporary row
 * and always deletes it again).
 *
 * Checks, against the real database:
 *   1. documents.draft_kind exists (phase-25 migration applied);
 *   2. the CHECK constraint rejects an unknown bucket;
 *   3. an Offre row is readable through the exact filters the UI uses
 *      (status=draft + draft_kind=offre / draft_kind is null);
 *   4. an Offre never shows up in a sent-orders listing;
 *   5. promoting it to 'sent' works and takes it out of both parked folders.
 *
 * Run: node scripts/verify-offre-flow.mjs
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

const MARKER = 'ZZZ OFFRE VERIFICATION — DELETE ME';
let failures = 0;
let testId = null;

function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

try {
  // 1. Column present?
  const probe = await supabase.from('documents').select('draft_kind').limit(1);
  check('documents.draft_kind exists', !probe.error, probe.error?.message);
  if (probe.error) {
    console.log('\nApply database-migrations/supabase-phase25-offre-orders.sql first.');
    process.exit(1);
  }

  // An existing admin to own the temporary row (created_by is NOT NULL).
  const { data: admin } = await supabase
    .from('profiles').select('id').eq('role', 'admin').limit(1).single();

  // 2. CHECK constraint rejects anything but 'offre'.
  const bad = await supabase.from('documents').insert({
    client_name: MARKER, document_type: 'order', file_name: 'verify.pdf', file_path: 'verify/verify.pdf',
    created_by: admin.id, order_channel: 'b2b', status: 'draft', draft_kind: 'nonsense',
  }).select('id').single();
  check('CHECK constraint rejects an unknown bucket', !!bad.error, bad.error?.code);
  if (bad.data?.id) await supabase.from('documents').delete().eq('id', bad.data.id);

  // 3. Create the Offre exactly as POST /api/documents does.
  const { data: created, error: createErr } = await supabase.from('documents').insert({
    client_name: MARKER, client_company: MARKER, document_type: 'order',
    file_name: 'verify-offre.pdf', file_path: 'verify/verify-offre.pdf', total_amount: 1234, created_by: admin.id,
    order_channel: 'b2b', status: 'draft', draft_kind: 'offre', event_id: null,
  }).select('id, status, draft_kind, event_id').single();
  check('an Offre row can be created', !createErr, createErr?.message);
  if (createErr) process.exit(1);
  testId = created.id;
  check('it is parked (status draft, no folder)', created.status === 'draft' && created.event_id === null);
  check('it carries the offre bucket', created.draft_kind === 'offre');

  // 4. Offre folder query (UI: ?status=draft&draft_kind=offre).
  const offreFolder = await supabase.from('documents')
    .select('id').eq('status', 'draft').eq('draft_kind', 'offre').is('deleted_at', null);
  check('it appears in the Offre folder', (offreFolder.data || []).some((d) => d.id === testId));

  // 5. Draft folder query (UI: ?status=draft&draft_kind=none) must NOT see it.
  const draftFolder = await supabase.from('documents')
    .select('id').eq('status', 'draft').is('draft_kind', null).is('deleted_at', null);
  check('it stays out of the Draft folder', !(draftFolder.data || []).some((d) => d.id === testId));

  // 6. Sent orders (revenue) must NOT see it.
  const sent = await supabase.from('documents')
    .select('id').eq('status', 'sent').is('deleted_at', null).limit(1000);
  check('it stays out of sent orders / revenue', !(sent.data || []).some((d) => d.id === testId));

  // 7. Promotion to a real order.
  const promoted = await supabase.from('documents')
    .update({ status: 'sent' }).eq('id', testId).select('status, draft_kind').single();
  check('promoting it to sent works', promoted.data?.status === 'sent', promoted.error?.message);
  const parkedAfter = await supabase.from('documents')
    .select('id').eq('status', 'draft').is('deleted_at', null);
  check('after promotion it leaves the parked folders', !(parkedAfter.data || []).some((d) => d.id === testId));
} finally {
  if (testId) {
    const { error } = await supabase.from('documents').delete().eq('id', testId);
    console.log(error ? `CLEANUP FAILED for ${testId}: ${error.message}` : 'cleanup: temporary row deleted');
  }
}

console.log(failures === 0 ? '\nAll Offre storage checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
