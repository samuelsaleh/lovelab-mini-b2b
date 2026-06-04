/**
 * @jest-environment node
 *
 * Guarantee 1 — prices match the single source of truth.
 *
 * Parses the original price workbook (_reference-materials/
 * moonlightcoollection_25052026.xlsx) and asserts that EVERY (model, carat)
 * B2B and B2C value in the sheet equals what getPrice/getRetail return for the
 * 15 new 2026 collections — and, in reverse, that every catalog carat for those
 * collections is covered by a row in the workbook. 2025 and 2026 are identical
 * for these collections, so both years are checked.
 *
 * The workbook uses the OLD model names; the mapping below translates
 * (excelCollection, excelModel[, carat]) -> catalog id.
 */

import path from 'path';
import ExcelJS from 'exceljs';
import { COLLECTIONS, getPrice, getRetail } from '../catalog.js';

const XLSX = path.join(__dirname, '..', '..', '_reference-materials', 'moonlightcoollection_25052026.xlsx');

const NEW_IDS = [
  'MFM', 'MNO', 'MNH',
  'SI1', 'SI2P', 'SI3', 'SI4', 'SI5',
  'ZAHA', 'LUVA', 'LUMA', 'RIV4', 'RIV8', 'LIN3', 'LIN5',
];

function col(id) {
  const c = COLLECTIONS.find((x) => x.id === id);
  if (!c) throw new Error(`No collection ${id}`);
  return c;
}

// Normalize an Excel "cts tot" number to the catalog carat string ('0.20' etc).
function caratStr(n) {
  return Number(n).toFixed(2);
}

// Translate an Excel row to its catalog collection id. Sienna "four" in the
// workbook actually covers BOTH Sienna Four (0.20/0.40) and Sienna Five
// (0.25/0.50), so that one is carat-dependent.
function excelToCatalogId(collection, model, caratNum) {
  const c = String(collection || '').trim().toLowerCase();
  const m = String(model || '').trim().toLowerCase();
  const cs = caratStr(caratNum);

  if (c === 'moonlight') {
    if (m === 'halo') return 'MNH';       // Multi Moonlight
    if (m === 'ora') return 'MNO';        // Long Moonlight
    if (m === 'full moon') return 'MFM';  // Original Moonlight
  }
  if (c === 'sienna') {
    if (m === 'one') return 'SI1';
    if (m === 'two') return 'SI2P';
    if (m === 'three') return 'SI3';
    if (m === 'four') {
      if (cs === '0.20' || cs === '0.40') return 'SI4';
      if (cs === '0.25' || cs === '0.50') return 'SI5';
    }
  }
  if (c === 'zaha') return 'ZAHA';
  if (c === 'luma') return 'LUMA';
  if (c === 'luva') return 'LUVA';
  if (c === 'linea') {
    if (m === 'three') return 'LIN3';
    if (m === 'five') return 'LIN5';
  }
  if (c === 'riviera') {
    if (m === 'four') return 'RIV4';
    if (m === 'eight') return 'RIV8';
  }
  return null;
}

let rows = [];

beforeAll(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const ws = wb.getWorksheet('Sheet1');
  const cellVal = (cell) => {
    const v = cell.value;
    return v && typeof v === 'object' && v.result !== undefined ? v.result : v;
  };
  const seen = new Set();
  ws.eachRow((row, rn) => {
    if (rn === 1) return; // header
    const collection = cellVal(row.getCell(1));
    const model = cellVal(row.getCell(2));
    const cts = cellVal(row.getCell(5));
    const b2b = cellVal(row.getCell(7));
    const b2c = cellVal(row.getCell(8));
    if (collection == null || cts == null) return;
    const id = excelToCatalogId(collection, model, cts);
    if (!id) return; // unrelated row
    const carat = caratStr(cts);
    const key = `${id}|${carat}`;
    if (seen.has(key)) return; // many color/housing rows repeat the same price
    seen.add(key);
    rows.push({ id, carat, b2b: Number(b2b), b2c: Number(b2c) });
  });
});

describe('new collections — prices match the source workbook', () => {
  test('workbook produced a non-trivial number of price rows', () => {
    // 15 models, multiple carats each -> at least 25 distinct (model, carat).
    expect(rows.length).toBeGreaterThanOrEqual(25);
  });

  test('every workbook (model, carat) matches catalog B2B + B2C (2025 & 2026)', () => {
    for (const r of rows) {
      const c = col(r.id);
      const idx = c.carats.indexOf(r.carat);
      expect(`${r.id} carat ${r.carat} present in catalog: ${idx >= 0}`).toBe(`${r.id} carat ${r.carat} present in catalog: true`);
      for (const yr of ['2025', '2026']) {
        expect(`${r.id}/${r.carat}/${yr} B2B=${getPrice(c, idx, 'igi', yr)}`)
          .toBe(`${r.id}/${r.carat}/${yr} B2B=${r.b2b}`);
        expect(`${r.id}/${r.carat}/${yr} B2C=${getRetail(c, idx, 'igi', yr)}`)
          .toBe(`${r.id}/${r.carat}/${yr} B2C=${r.b2c}`);
      }
    }
  });

  test('every catalog carat for the 15 new collections is covered by the workbook', () => {
    const covered = new Set(rows.map((r) => `${r.id}|${r.carat}`));
    const missing = [];
    for (const id of NEW_IDS) {
      const c = col(id);
      for (const carat of c.carats) {
        if (!covered.has(`${id}|${carat}`)) missing.push(`${id}|${carat}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
