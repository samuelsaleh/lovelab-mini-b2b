#!/usr/bin/env node
/**
 * Rebuilds lib/igi/seed.json from IGI's spreadsheet.
 *
 * Michael sends the sheet; this reads it. The figures come from the file, the
 * names and everything LoveLab curated come from the seed being replaced.
 * See lib/igi/seedFromSheet.js for the rules.
 *
 *   node scripts/build-igi-seed.mjs path/to/models.xlsx          # rebuild the seed
 *   node scripts/build-igi-seed.mjs path/to/models.xlsx --dry    # show what would change, write nothing
 *
 * Afterwards: scripts/import-igi-seed.mjs carries EXPECTED figures that must
 * match — the script prints the new ones. Then rebuild the switch-on file with
 * scripts/build-igi-switch-on.mjs so a fresh install lands on the same state.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { buildSeed, expectedFigures } from '../lib/igi/seedFromSheet.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = resolve(ROOT, 'lib/igi/seed.json');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Usage: node scripts/build-igi-seed.mjs <models.xlsx> [--dry]');
  process.exit(2);
}

/** One cell as a plain value: dates as YYYY-MM-DD, formulas as their result. */
function plain(cell) {
  let v = cell.value;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v && typeof v === 'object') {
    if ('result' in v) v = v.result;
    else if ('richText' in v) v = v.richText.map((t) => t.text).join('');
    else if ('text' in v) v = v.text;
    else return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return v ?? null;
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(resolve(file));
const ws = wb.worksheets[0];
const header = [];
ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { header[i] = plain(c); });
const rows = [];
for (let r = 2; r <= ws.rowCount; r++) {
  const row = {};
  ws.getRow(r).eachCell({ includeEmpty: true }, (c, i) => { const v = plain(c); if (v !== null && v !== '') row[i] = v; });
  if (Object.keys(row).length) rows.push(row);
}
const feeSheet = wb.getWorksheet('fee');
const fee = feeSheet ? Number(plain(feeSheet.getCell('A1'))) || null : null;

const previous = JSON.parse(readFileSync(SEED, 'utf8'));
const { seed, warnings } = buildSeed({ header, rows, previous, fee, source: `IGI's file ${basename(file)}` });

// ── What changed against the seed being replaced ─────────────────────────
console.log(`Seed from ${basename(file)} — as of ${seed.as_of} (was ${previous.as_of})\n`);
const prevVisits = new Map(previous.visits.map((v) => [v.visit_no, v]));
for (const v of seed.visits) {
  const p = prevVisits.get(v.visit_no);
  const sum = v.lines.reduce((t, l) => t + l.qty, 0);
  if (!p) { console.log(`  + movement ${v.visit_no} ${v.visit_date}: ${v.lines.length} lines, ${sum || v.unattributed_total} certificates`); continue; }
  const pl = new Map(p.lines.map((l) => [l.serial, l.qty]));
  for (const l of v.lines) if ((pl.get(l.serial) || 0) !== l.qty) console.log(`  ~ movement ${v.visit_no} ${v.visit_date} ${l.serial}: ${pl.get(l.serial) || 0} → ${l.qty}`);
  for (const [s, q] of pl) if (!v.lines.find((l) => l.serial === s)) console.log(`  ~ movement ${v.visit_no} ${v.visit_date} ${s}: ${q} → 0`);
  if (p.visit_date !== v.visit_date) console.log(`  ~ movement ${v.visit_no}: date ${p.visit_date} → ${v.visit_date}`);
}
for (const v of previous.visits) if (!seed.visits.find((x) => x.visit_no === v.visit_no)) console.log(`  - movement ${v.visit_no} ${v.visit_date} is gone`);

if (warnings.length) {
  console.log('\nWorth a look:');
  for (const w of warnings) console.log(`  · ${w}`);
}

console.log('\nEXPECTED for scripts/import-igi-seed.mjs:');
for (const [k, v] of Object.entries(expectedFigures(seed))) console.log(`  '${k}': ${v},`);

if (dry) { console.log('\n--dry: nothing written.'); process.exit(0); }
writeFileSync(SEED, `${JSON.stringify(seed, null, 2)}\n`);
console.log(`\nWrote lib/igi/seed.json — ${seed.models.length} models, ${seed.visits.length} movements, ${seed.batches.length} batches.`);
