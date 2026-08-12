/**
 * List every country that appears across saved orders.
 *
 * The billing country is not a column on `documents` — it lives inside the
 * saved form snapshot at metadata.formState.country (shipping country sits
 * next to it at metadata.formState.shippingCountry). Read-only.
 *
 * Run: node scripts/list-order-countries.mjs
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

// Countries are typed by hand, so the same place arrives spelled several ways.
// Group on a squashed key (lowercase, no accents/punctuation) and report the
// most common spelling of each group.
function key(raw) {
  return String(raw)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

const PAGE = 1000;
const counts = new Map(); // key -> { spellings: Map<label, n>, orders: n }
let scanned = 0;
let withCountry = 0;

for (let from = 0; ; from += PAGE) {
  const { data, error } = await supabase
    .from('documents')
    .select('id, metadata')
    .eq('document_type', 'order')
    .is('deleted_at', null)
    .range(from, from + PAGE - 1);

  if (error) { console.error('query failed:', error.message); process.exit(1); }
  if (!data.length) break;

  for (const doc of data) {
    scanned++;
    const raw = doc.metadata?.formState?.country;
    const label = typeof raw === 'string' ? raw.trim() : '';
    if (!label) continue;
    withCountry++;
    const k = key(label);
    if (!k) continue;
    if (!counts.has(k)) counts.set(k, { spellings: new Map(), orders: 0 });
    const entry = counts.get(k);
    entry.orders++;
    entry.spellings.set(label, (entry.spellings.get(label) || 0) + 1);
  }

  if (data.length < PAGE) break;
}

const rows = [...counts.values()]
  .map(({ spellings, orders }) => {
    const sorted = [...spellings.entries()].sort((a, b) => b[1] - a[1]);
    return { label: sorted[0][0], orders, variants: sorted.map(([s]) => s) };
  })
  .sort((a, b) => b.orders - a.orders || a.label.localeCompare(b.label));

console.log(`Scanned ${scanned} order(s); ${withCountry} had a country filled in.`);
console.log(`${rows.length} distinct countries:\n`);
for (const r of rows) {
  const alt = r.variants.length > 1 ? `   (also written: ${r.variants.slice(1).join(', ')})` : '';
  console.log(`  ${String(r.orders).padStart(4)}  ${r.label}${alt}`);
}

console.log('\nPlain list:');
console.log(rows.map((r) => r.label).sort((a, b) => a.localeCompare(b)).join(', '));
