/**
 * Diagnostic — find client records whose contact details were overwritten by a
 * browser autofill (the agent's own name/email landing in a customer record),
 * plus duplicate company names that block the exact-match prefill.
 *
 * Read-only. Run: node scripts/diagnose-client-contacts.mjs
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

const { data: clients, error } = await supabase
  .from('clients')
  .select('id, company, name, email, phone, country, vat, created_by, created_at, updated_at')
  .order('updated_at', { ascending: false });

if (error) { console.error(error.message); process.exit(1); }

const { data: profiles, error: profilesError } = await supabase
  .from('profiles')
  .select('id, email, full_name');

if (profilesError) { console.error(profilesError.message); process.exit(1); }

const norm = (v) => (v || '').trim().toLowerCase();
const profileById = new Map(profiles.map((p) => [p.id, p]));
const profileByEmail = new Map(profiles.filter((p) => p.email).map((p) => [norm(p.email), p]));
const profileNames = new Set(profiles.filter((p) => p.full_name).map((p) => norm(p.full_name)));

console.log(`Total client records: ${clients.length}`);
console.log(`Total profiles: ${profiles.length}`);

// ─── 1. The reported record ───
console.log('\n=== 1. Companies matching "LITTLE FACTORY" ===');
const reported = clients.filter((c) => norm(c.company).includes('little factory'));
if (reported.length === 0) {
  console.log('  none found');
} else {
  for (const c of reported) {
    const owner = profileById.get(c.created_by);
    console.log(`  ${c.company}`);
    console.log(`    id         ${c.id}`);
    console.log(`    name       ${c.name ?? '—'}`);
    console.log(`    email      ${c.email ?? '—'}`);
    console.log(`    phone      ${c.phone ?? '—'}`);
    console.log(`    country    ${c.country ?? '—'}   vat ${c.vat ?? '—'}`);
    console.log(`    created_by ${owner ? `${owner.full_name || '?'} <${owner.email || '?'}>` : (c.created_by ?? '—')}`);
    console.log(`    updated_at ${c.updated_at ?? '—'}`);
  }
}

// ─── 2. Duplicate company names ───
console.log('\n=== 2. Duplicate company names (block exact-match prefill) ===');
const byCompany = new Map();
for (const c of clients) {
  const key = norm(c.company);
  if (!key) continue;
  if (!byCompany.has(key)) byCompany.set(key, []);
  byCompany.get(key).push(c);
}
const duplicates = [...byCompany.values()].filter((rows) => rows.length > 1);
if (duplicates.length === 0) {
  console.log('  none');
} else {
  console.log(`  ${duplicates.length} company name(s) with more than one record:`);
  for (const rows of duplicates) {
    console.log(`  ${rows[0].company} — ${rows.length} records`);
    for (const c of rows) {
      console.log(`    ${c.id}  name=${c.name ?? '—'}  email=${c.email ?? '—'}  updated=${(c.updated_at || '').slice(0, 10)}`);
    }
  }
}

// ─── 3. Agent details leaked into client records ───
console.log('\n=== 3. Client records holding a team member email or name ===');
const leaked = clients.filter((c) => profileByEmail.has(norm(c.email)) || profileNames.has(norm(c.name)));
if (leaked.length === 0) {
  console.log('  none');
} else {
  console.log(`  ${leaked.length} suspicious record(s):`);
  for (const c of leaked) {
    const viaEmail = profileByEmail.get(norm(c.email));
    const viaName = profileNames.has(norm(c.name));
    const reasons = [viaEmail ? 'email matches a profile' : null, viaName ? 'name matches a profile' : null]
      .filter(Boolean)
      .join(' + ');
    console.log(`  ${c.company}`);
    console.log(`    id      ${c.id}`);
    console.log(`    name    ${c.name ?? '—'}`);
    console.log(`    email   ${c.email ?? '—'}`);
    console.log(`    why     ${reasons}`);
    console.log(`    updated ${c.updated_at ?? '—'}`);
  }
}

console.log('\nRead-only run complete. No records were modified.');
