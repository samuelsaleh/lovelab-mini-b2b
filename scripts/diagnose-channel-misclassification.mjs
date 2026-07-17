/**
 * Diagnostic #3 — find website orders misfiled as B2B (or vice versa).
 * Read-only. Run: node scripts/diagnose-channel-misclassification.mjs
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

const { data: docs, error } = await supabase
  .from('documents')
  .select('id, document_type, order_channel, status, total_amount, client_name, client_company, created_at, metadata, events(name)')
  .is('deleted_at', null)
  .order('created_at', { ascending: false });

if (error) { console.error(error.message); process.exit(1); }

const eur = (n) => `€${(Math.round((n || 0) * 100) / 100).toLocaleString('en-GB')}`;

// 1. Website-sourced docs whose channel is NOT b2c
const websiteNotB2C = docs.filter(d =>
  (d.metadata?.source === 'website' || d.metadata?.website_order_type) && d.order_channel !== 'b2c'
);
console.log(`Website-sourced docs NOT filed as b2c: ${websiteNotB2C.length}`);
for (const d of websiteNotB2C) {
  console.log(`  [${d.order_channel}] ${d.created_at.slice(0, 10)} ${(d.client_company || d.client_name || '?').padEnd(30)} ${eur(d.total_amount)} website_order_type=${d.metadata?.website_order_type ?? '—'} event=${d.events?.name || '—'}`);
}

// 2. b2c-channel docs NOT from the website (manually mis-set?)
const b2cNotWebsite = docs.filter(d =>
  d.order_channel === 'b2c' && d.metadata?.source !== 'website'
);
console.log(`\nb2c-channel docs NOT website-sourced: ${b2cNotWebsite.length}`);
for (const d of b2cNotWebsite) {
  console.log(`  ${d.created_at.slice(0, 10)} ${(d.client_company || d.client_name || '?').padEnd(30)} ${eur(d.total_amount)} source=${d.metadata?.source ?? '—'}`);
}

// 3. Docs filed under the ONLINE B2C event but not channel b2c
const onlineEventNotB2C = docs.filter(d => d.events?.name === 'ONLINE B2C' && d.order_channel !== 'b2c');
console.log(`\nDocs in "ONLINE B2C" event with channel !== b2c: ${onlineEventNotB2C.length}`);
for (const d of onlineEventNotB2C) {
  console.log(`  [${d.order_channel}] ${d.created_at.slice(0, 10)} ${(d.client_company || d.client_name || '?').padEnd(30)} ${eur(d.total_amount)} status=${d.status}`);
}

// 4. website_order_type=b2b docs (website wholesale) — where are they filed?
const websiteB2B = docs.filter(d => d.metadata?.website_order_type && d.metadata.website_order_type !== 'b2c');
console.log(`\nWebsite docs with website_order_type !== 'b2c': ${websiteB2B.length}`);
for (const d of websiteB2B) {
  console.log(`  [${d.order_channel}] ${d.created_at.slice(0, 10)} ${(d.client_company || d.client_name || '?').padEnd(30)} ${eur(d.total_amount)} type=${d.metadata.website_order_type} event=${d.events?.name || '—'}`);
}
