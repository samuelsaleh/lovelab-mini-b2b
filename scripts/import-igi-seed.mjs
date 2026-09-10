#!/usr/bin/env node
/**
 * Loads the opening balances for the LoveLab x IGI certificate module.
 *
 * Source is lib/igi/seed.json, taken from IGI's file as of 27 August 2026 and
 * from the live packing-stock endpoint. Run it once after applying
 * supabase/migrations/20260828120000_igi_certificates.sql.
 *
 * Idempotent: keyed on serial, visit_no and description, so a re-run corrects
 * rather than duplicates. It finishes by reconciling against the known-good
 * totals from IGI's file and exits non-zero if any of them is off, because a
 * silently wrong opening balance is the one thing this module cannot afford.
 *
 * Usage:
 *   node scripts/import-igi-seed.mjs             # import, then reconcile
 *   node scripts/import-igi-seed.mjs --check     # reconcile only, write nothing
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL (already in .env).
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadEnvFile(path) {
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

loadEnvFile(resolve(ROOT, '.env'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Set them in .env or shell env, then re-run.');
  process.exit(2);
}

const checkOnly = process.argv.includes('--check');
const seed = JSON.parse(readFileSync(resolve(ROOT, 'lib/igi/seed.json'), 'utf8'));
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** The figures in IGI's file. If the import does not land on these, it is wrong. */
const EXPECTED = {
  'models in use': 61,
  'reserved serials': 15,
  'models awaiting a serial': 3,
  'certificates ordered': 62999,
  'issued with a model': 3778,
  'issued with no model': 3245,
  'issued in total': 7023,
  'unissued at IGI': 59221,
  movements: 23,
  'descriptions classified': 116,
  'descriptions linked to a model': 26,
};

function die(message, error) {
  console.error(`\n  ${message}${error ? `: ${error.message}` : ''}`);
  process.exit(1);
}

async function upsert(table, rows, onConflict) {
  if (!rows.length) return;
  // Chunked so a large model list cannot blow the request size limit.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) die(`could not write ${table}`, error);
  }
}

async function importSeed() {
  console.log(`Importing IGI opening balances as of ${seed.as_of}\n`);

  // ── Models ────────────────────────────────────────────────────────────────
  // Models waiting for a serial have no natural key, so they are matched on
  // name + carat and inserted only once.
  const numbered = seed.models.filter((m) => m.serial);
  const awaiting = seed.models.filter((m) => !m.serial);

  await upsert('igi_models', numbered.map((m) => ({
    serial: m.serial,
    serial_full: m.serial_full,
    name: m.name,
    igi_name: m.igi_name,
    stones: m.stones,
    carat: m.carat,
    shape: m.shape,
    spec: m.spec,
    state: m.state,
    qty_ordered: m.qty_ordered,
    sort_order: m.sort_order,
  })), 'serial');
  console.log(`  ${numbered.length} numbered models`);

  const { data: existingAwaiting } = await db
    .from('igi_models').select('id, name, carat').eq('state', 'awaiting_serial');
  const already = new Set((existingAwaiting || []).map((m) => `${m.name}|${Number(m.carat)}`));
  const toAdd = awaiting.filter((m) => !already.has(`${m.name}|${Number(m.carat)}`));
  if (toAdd.length) {
    const { error } = await db.from('igi_models').insert(toAdd.map((m) => ({
      name: m.name, stones: m.stones, carat: m.carat, shape: m.shape,
      spec: m.spec, state: 'awaiting_serial', sort_order: m.sort_order,
    })));
    if (error) die('could not write the models awaiting a serial', error);
  }
  console.log(`  ${awaiting.length} models waiting for a serial`);

  // ── Resolve serials to ids for everything that follows ────────────────────
  const { data: models, error: modelErr } = await db
    .from('igi_models').select('id, serial').not('serial', 'is', null);
  if (modelErr) die('could not read back the models', modelErr);
  const idOf = new Map(models.map((m) => [m.serial, m.id]));

  // ── Descriptions: the mapping table ───────────────────────────────────────
  await upsert('igi_descriptions', seed.descriptions.map((d) => ({
    description: d.description,
    model_id: d.serial ? idOf.get(d.serial) : null,
    kind: d.kind,
  })), 'description');
  console.log(`  ${seed.descriptions.length} descriptions classified`);

  // ── Batches: the original commissioned run, one per model ─────────────────
  // No natural key, so an existing 'initial order' batch is left alone rather
  // than added a second time.
  const { data: existingBatches } = await db
    .from('igi_batches').select('model_id').eq('reference', 'initial order');
  const haveBatch = new Set((existingBatches || []).map((b) => b.model_id));
  const newBatches = seed.batches
    .map((b) => ({ model_id: idOf.get(b.serial), qty: b.qty, batch_date: b.batch_date, reference: b.reference }))
    .filter((b) => b.model_id && !haveBatch.has(b.model_id));
  if (newBatches.length) {
    const { error } = await db.from('igi_batches').insert(newBatches);
    if (error) die('could not write the opening batches', error);
  }
  console.log(`  ${seed.batches.length} opening batches`);

  // ── Visits and their lines ────────────────────────────────────────────────
  await upsert('igi_visits', seed.visits.map((v) => ({
    visit_no: v.visit_no,
    visit_date: v.visit_date,
    status: v.status,
    date_suspect: v.date_suspect,
    unattributed_total: v.unattributed_total,
    closed_at: v.status === 'closed' ? `${v.visit_date}T12:00:00Z` : null,
  })), 'visit_no');

  const { data: visits, error: visitErr } = await db.from('igi_visits').select('id, visit_no');
  if (visitErr) die('could not read back the movements', visitErr);
  const visitIdOf = new Map(visits.map((v) => [v.visit_no, v.id]));

  const lines = [];
  for (const v of seed.visits) {
    for (const l of v.lines) {
      lines.push({
        visit_id: visitIdOf.get(v.visit_no),
        model_id: idOf.get(l.serial),
        qty_requested: l.qty,
        qty_issued: l.qty,
        qty_received: l.qty,
      });
    }
  }
  await upsert('igi_visit_lines', lines, 'visit_id,model_id');
  console.log(`  ${seed.visits.length} movements, ${lines.length} lines\n`);
}

async function reconcile() {
  const [models, batches, visits, lines, descriptions] = await Promise.all([
    db.from('igi_models').select('id, state, serial'),
    db.from('igi_batches').select('model_id, qty'),
    db.from('igi_visits').select('id, unattributed_total'),
    db.from('igi_visit_lines').select('model_id, qty_issued'),
    db.from('igi_descriptions').select('description, model_id, kind'),
  ]);

  for (const r of [models, batches, visits, lines, descriptions]) {
    if (r.error) die('could not read the tables back', r.error);
  }

  const sum = (rows, pick) => rows.reduce((t, r) => t + (Number(pick(r)) || 0), 0);
  const ordered = sum(batches.data, (b) => b.qty);
  const attributed = sum(lines.data, (l) => l.qty_issued);
  const unattributed = sum(visits.data, (v) => v.unattributed_total);

  const actual = {
    'models in use': models.data.filter((m) => m.state === 'in_use').length,
    'reserved serials': models.data.filter((m) => m.state === 'reserved').length,
    'models awaiting a serial': models.data.filter((m) => m.state === 'awaiting_serial').length,
    'certificates ordered': ordered,
    'issued with a model': attributed,
    'issued with no model': unattributed,
    'issued in total': attributed + unattributed,
    'unissued at IGI': ordered - attributed,
    movements: visits.data.length,
    'descriptions classified': descriptions.data.length,
    'descriptions linked to a model': descriptions.data.filter((d) => d.model_id).length,
  };

  console.log('Reconciliation against IGI\'s file:\n');
  let ok = true;
  for (const [label, expected] of Object.entries(EXPECTED)) {
    const got = actual[label];
    const match = got === expected;
    if (!match) ok = false;
    console.log(
      `  ${match ? 'ok  ' : 'OFF '} ${label.padEnd(32)} ${String(got).padStart(7)}`
      + (match ? '' : `   expected ${expected}`),
    );
  }

  const needsHuman = descriptions.data.filter((d) => d.kind === 'certificate' && !d.model_id);
  console.log(`\n  ${needsHuman.length} description(s) still need linking to a model`);
  if (needsHuman.length) needsHuman.slice(0, 10).forEach((d) => console.log(`      ${d.description}`));

  if (!ok) {
    console.error('\n  The import did not land on IGI\'s figures. Do not build on it.');
    process.exit(1);
  }
  console.log('\n  Every figure matches.\n');
}

if (!checkOnly) await importSeed();
await reconcile();
