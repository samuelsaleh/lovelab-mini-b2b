/**
 * @jest-environment node
 *
 * Guarantee 1 — prices match the single source of truth.
 *
 * Moonlight workbook: _reference-materials/moonlightcoollection_25052026.xlsx
 * covers Moonlight, Sienna, Za-Ha (9 collections).
 *
 * Iconix workbook: _reference-materials/riviera-linea-flower-prices.xlsx
 * covers Flower Heart/Marquise, Riviera Four/Eight, Linea Three/Five (6 collections).
 *
 * 2025 and 2026 are identical for these collections, so both years are checked.
 */

import path from 'path';
import ExcelJS from 'exceljs';
import { COLLECTIONS, getPrice, getRetail } from '../catalog.js';

const MOONLIGHT_XLSX = path.join(__dirname, '..', '..', '_reference-materials', 'moonlightcoollection_25052026.xlsx');
const ICONIX_XLSX = path.join(__dirname, '..', '..', '_reference-materials', 'riviera-linea-flower-prices.xlsx');

const MOONLIGHT_IDS = [
  'MFM', 'MNO', 'MNH',
  'SI1', 'SI2P', 'SI3', 'SI4', 'SI5',
  'ZAHA',
];

const ICONIX_IDS = ['LUVA', 'LUMA', 'RIV4', 'RIV8', 'LIN3', 'LIN5'];

function col(id) {
  const c = COLLECTIONS.find((x) => x.id === id);
  if (!c) throw new Error(`No collection ${id}`);
  return c;
}

function caratStr(n) {
  return Number(n).toFixed(2);
}

function normalizeCatalogCarat(id, carat) {
  // The source Moonlight workbook labels the largest Original Moonlight as
  // 1.01ct, but LoveLab wants the app/customer-facing catalog to show 1ct.
  if (id === 'MFM' && carat === '1.01') return '1';
  return carat;
}

function assertPricesMatchCatalog(rows, ids) {
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

  const covered = new Set(rows.map((r) => `${r.id}|${r.carat}`));
  const missing = [];
  for (const id of ids) {
    const c = col(id);
    for (const carat of c.carats) {
      if (!covered.has(`${id}|${carat}`)) missing.push(`${id}|${carat}`);
    }
  }
  expect(missing).toEqual([]);
}

function excelToCatalogId(collection, model, caratNum) {
  const c = String(collection || '').trim().toLowerCase();
  const m = String(model || '').trim().toLowerCase();
  const cs = caratStr(caratNum);

  if (c === 'moonlight') {
    if (m === 'halo') return 'MNH';
    if (m === 'ora') return 'MNO';
    if (m === 'full moon') return 'MFM';
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
  return null;
}

function iconixProductToCatalogId(product) {
  const p = String(product || '').trim().toLowerCase();
  if (p.includes('flower heart')) return 'LUVA';
  if (p.includes('flower marquise')) return 'LUMA';
  if (p.includes('linea three')) return 'LIN3';
  if (p.includes('linea five')) return 'LIN5';
  if (p.includes('riviera four')) return 'RIV4';
  if (p.includes('riviera eight')) return 'RIV8';
  return null;
}

function parseCaratFromLabel(label) {
  const m = String(label || '').match(/([\d.]+)\s*ct/i);
  return m ? caratStr(m[1]) : null;
}

let moonlightRows = [];
let iconixRows = [];

beforeAll(async () => {
  const moonlightWb = new ExcelJS.Workbook();
  await moonlightWb.xlsx.readFile(MOONLIGHT_XLSX);
  const moonlightWs = moonlightWb.getWorksheet('Sheet1');
  const cellVal = (cell) => {
    const v = cell.value;
    return v && typeof v === 'object' && v.result !== undefined ? v.result : v;
  };
  const seenMoonlight = new Set();
  moonlightWs.eachRow((row, rn) => {
    if (rn === 1) return;
    const collection = cellVal(row.getCell(1));
    const model = cellVal(row.getCell(2));
    const cts = cellVal(row.getCell(5));
    const b2b = cellVal(row.getCell(7));
    const b2c = cellVal(row.getCell(8));
    if (collection == null || cts == null) return;
    const id = excelToCatalogId(collection, model, cts);
    if (!id) return;
    const carat = normalizeCatalogCarat(id, caratStr(cts));
    const key = `${id}|${carat}`;
    if (seenMoonlight.has(key)) return;
    seenMoonlight.add(key);
    moonlightRows.push({ id, carat, b2b: Number(b2b), b2c: Number(b2c) });
  });

  const iconixWb = new ExcelJS.Workbook();
  await iconixWb.xlsx.readFile(ICONIX_XLSX);
  const iconixWs = iconixWb.worksheets[0];
  const seenIconix = new Set();
  iconixWs.eachRow((row, rn) => {
    if (rn === 1) return;
    const product = cellVal(row.getCell(2));
    const caratLabel = cellVal(row.getCell(11));
    const b2c = cellVal(row.getCell(18));
    const b2b = cellVal(row.getCell(19));
    if (!product || !caratLabel) return;
    const id = iconixProductToCatalogId(product);
    const carat = parseCaratFromLabel(caratLabel);
    if (!id || !carat) return;
    const key = `${id}|${carat}`;
    if (seenIconix.has(key)) return;
    seenIconix.add(key);
    iconixRows.push({ id, carat, b2b: Number(b2b), b2c: Number(b2c) });
  });
});

describe('new collections — moonlight workbook prices', () => {
  test('workbook produced a non-trivial number of price rows', () => {
    expect(moonlightRows.length).toBeGreaterThanOrEqual(15);
  });

  test('every workbook (model, carat) matches catalog B2B + B2C (2025 & 2026)', () => {
    assertPricesMatchCatalog(moonlightRows, MOONLIGHT_IDS);
  });
});

describe('new collections — iconix riviera/linea/flower workbook prices', () => {
  test('workbook produced all 8 distinct (model, carat) price rows', () => {
    expect(iconixRows.length).toBe(8);
  });

  test('every workbook (model, carat) matches catalog B2B + B2C (2025 & 2026)', () => {
    assertPricesMatchCatalog(iconixRows, ICONIX_IDS);
  });
});
