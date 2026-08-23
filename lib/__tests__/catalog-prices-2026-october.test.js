/**
 * @jest-environment node
 *
 * Source-of-truth check against
 * public/Price Lists/Pricelist_LoveLab_2026_October.pdf (the "PRICELIST 2026
 * FROM OCTOBER" revision Sam supplied on 2026-08-13).
 *
 * Every row of all four PDF pages is transcribed below and asserted through
 * getPrice / getRetail at pricelistYear='2026-10'. That includes the classic
 * collections, which carry no '2026-10' bucket at all and resolve through
 * PRICELIST_BASE — so this suite is also the guard on the inheritance chain.
 *
 * The suite runs in both directions: every PDF row must be priced, AND no
 * collection may price a carat that the PDF does not list.
 */

import { COLLECTIONS, PRICELISTS, getAvailableCarats, getPrice, getRetail } from '../catalog.js';

const Y = '2026-10';

function col(id) {
  const c = COLLECTIONS.find((x) => x.id === id);
  if (!c) throw new Error(`No collection ${id}`);
  return c;
}

// [collection id, carat (as the catalog spells it), cert, B2B €, B2C incl. 21% €]
// Transcribed top-to-bottom from the PDF, pages 1-4.
const PDF_ROWS = [
  // ─── page 1 · BRACELETS ───
  ['CUTY',  '0.05', 'inhouse', 24,  75],
  ['CUTY',  '0.05', 'igi',     30,  105],
  ['CUTY',  '0.10', 'inhouse', 34,  120],
  ['CUTY',  '0.10', 'igi',     40,  155],
  ['CUTY',  '0.20', 'igi',     70,  315],
  ['CUTY',  '0.30', 'igi',     100, 430],
  ['CUBIX', '0.05', 'inhouse', 24,  95],
  ['CUBIX', '0.05', 'igi',     30,  120],
  ['CUBIX', '0.10', 'inhouse', 34,  145],
  ['CUBIX', '0.10', 'igi',     40,  155],
  ['CUBIX', '0.20', 'igi',     70,  340],
  ['M3',    '0.15', 'igi',     65,  260],
  ['M3',    '0.30', 'igi',     95,  400],
  ['M3',    '0.60', 'igi',     175, 800],
  ['M3',    '0.90', 'igi',     250, 1150],
  ['M4',    '0.20', 'igi',     85,  360],
  ['M4',    '0.40', 'igi',     110, 500],
  ['M5',    '0.25', 'igi',     95,  400],
  ['M5',    '0.50', 'igi',     130, 580],
  ['MF',    '0.60', 'igi',     200, 550],
  ['MF',    '1.00', 'igi',     310, 885],

  // ─── page 2 · SHAPY ───
  ['SSF',  '0.10', 'igi',     55,  180],
  ['SSF',  '0.30', 'igi',     100, 330],
  ['SSF',  '0.50', 'igi',     155, 450],
  ['SSPF', '0.70', 'igi',     240, 550],
  ['SSPF', '1.00', 'igi',     325, 850],
  ['SSRG', '0.50', 'inhouse', 125, 290],
  ['SSRG', '0.70', 'inhouse', 165, 360],
  ['SSRG', '1.00', 'inhouse', 225, 500],
  ['SSRD', '0.50', 'inhouse', 200, 600],
  ['SSRD', '0.70', 'inhouse', 300, 900],
  ['SSRD', '1.00', 'igi',     400, 1200],

  // ─── page 2 · MOONLIGHT (new prices + new sizes) ───
  ['MNO', '0.05', 'igi', 67,  255],
  ['MNO', '0.10', 'igi', 82,  310],
  ['MNO', '0.30', 'igi', 121, 475],
  ['MNH', '0.20', 'igi', 90,  340],
  ['MNH', '0.40', 'igi', 150, 585],
  ['MNH', '0.70', 'igi', 200, 650],
  ['MNH', '1.10', 'igi', 320, 960],
  ['MFM', '0.10', 'igi', 70,  210],
  ['MFM', '0.20', 'igi', 80,  240],
  ['MFM', '0.30', 'igi', 121, 475],
  ['MFM', '0.50', 'igi', 250, 1000],
  ['MFM', '0.70', 'igi', 300, 1200],
  ['MFM', '1.01', 'igi', 460, 1800],

  // ─── pages 2-3 · SIENNA ───
  ['SI1',  '0.10', 'igi', 121, 475],
  ['SI1',  '0.30', 'igi', 172, 675],
  ['SI2P', '0.20', 'igi', 138, 540],
  ['SI3',  '0.15', 'igi', 78,  295],
  ['SI3',  '0.30', 'igi', 138, 540],
  ['SI4',  '0.20', 'igi', 96,  360],
  ['SI4',  '0.40', 'igi', 172, 675],
  ['SI5',  '0.25', 'igi', 114, 430],
  ['SI5',  '0.50', 'igi', 196, 765],

  // ─── page 3 · ICONIX (B2B unchanged, B2C per the PDF) ───
  ['LUVA', '0.40', 'igi', 150, 585],
  ['LUMA', '0.40', 'igi', 130, 495],
  ['LIN3', '0.30', 'igi', 115, 430],
  ['LIN5', '0.50', 'igi', 175, 675],
  ['RIV4', '0.20', 'igi', 90,  340],
  ['RIV4', '0.40', 'igi', 115, 430],
  ['RIV8', '0.40', 'igi', 115, 430],
  ['RIV8', '0.80', 'igi', 150, 585],
  ['ZAHA', '0.30', 'igi', 126, 495],

  // ─── pages 3-4 · NECKLACES ───
  ['CUTY_NECK',  '0.10', 'igi', 50,  195],
  ['CUTY_NECK',  '0.20', 'igi', 88,  395],
  ['CUTY_NECK',  '0.30', 'igi', 125, 540],
  ['CUBIX_NECK', '0.05', 'igi', 36,  145],
  ['CUBIX_NECK', '0.10', 'igi', 48,  190],
  ['CUBIX_NECK', '0.20', 'igi', 84,  410],
  ['M3_NECK',    '0.15', 'igi', 81,  325],
  ['M3_NECK',    '0.30', 'igi', 119, 500],
  ['M3_NECK',    '0.60', 'igi', 219, 1000],
  ['M4_NECK',    '0.20', 'igi', 106, 450],
  ['M4_NECK',    '0.40', 'igi', 138, 625],
  ['M5_NECK',    '0.25', 'igi', 114, 480],
  ['M5_NECK',    '0.50', 'igi', 156, 700],
  ['MF_NECK',    '0.60', 'igi', 240, 660],
  ['MF_NECK',    '1.00', 'igi', 372, 1065],
  ['SSF_NECK',   '0.10', 'igi', 66,  220],
  ['SSF_NECK',   '0.30', 'igi', 120, 400],
  ['SSF_NECK',   '0.50', 'igi', 186, 540],
  ['SSPF_NECK',  '0.70', 'igi', 288, 660],
  ['SSPF_NECK',  '1.00', 'igi', 390, 1020],
  ['HOLY_NECK',  '0.50', 'igi', 312, 780],
  ['HOLY_NECK',  '0.70', 'igi', 510, 1200],
  ['HOLY_NECK',  '1.00', 'igi', 660, 1590],
];

// The HOLY bracelet has never appeared on a printed pricelist (2025, 2026 or
// October) — the product team keeps it in the app at its own prices. It is the
// only legitimate absence, so the completeness check skips it by name rather
// than tolerating gaps everywhere.
const NOT_ON_ANY_PDF = new Set(['HOLY']);

describe('2026-10 pricelist matches public/Price Lists/Pricelist_LoveLab_2026_October.pdf', () => {
  test('the October list is a selectable pricelist', () => {
    expect(PRICELISTS).toContain('2026-10');
  });

  test.each(PDF_ROWS)('%s %s ct (%s) -> B2B=%i B2C=%i', (id, carat, cert, b2b, b2c) => {
    const c = col(id);
    const ci = c.carats.indexOf(carat);
    expect(`${id} carats include ${carat}: ${ci >= 0}`).toBe(`${id} carats include ${carat}: true`);
    expect(getPrice(c, ci, cert, Y)).toBe(b2b);
    expect(getRetail(c, ci, cert, Y)).toBe(b2c);
  });

  test('every carat the app offers on the October list appears on the PDF', () => {
    const pdfKeys = new Set(PDF_ROWS.map(([id, carat]) => `${id}|${carat}`));
    const unexpected = [];
    for (const c of COLLECTIONS) {
      if (NOT_ON_ANY_PDF.has(c.id)) continue;
      for (const { carat } of getAvailableCarats(c, Y)) {
        if (!pdfKeys.has(`${c.id}|${carat}`)) unexpected.push(`${c.id} ${carat} ct`);
      }
    }
    expect(unexpected).toEqual([]);
  });

  test('every PDF row is an orderable size on the October list', () => {
    const missing = [];
    for (const [id, carat] of PDF_ROWS) {
      const available = getAvailableCarats(col(id), Y).some((o) => o.carat === carat);
      if (!available) missing.push(`${id} ${carat} ct`);
    }
    expect(missing).toEqual([]);
  });

  // Every collection that changed in October must carry its own bucket; every
  // collection that did not must carry none, so it can never drift from 2026.
  test('only the repriced collections carry a 2026-10 bucket', () => {
    const withOwnBucket = COLLECTIONS.filter((c) => c.prices['2026-10']).map((c) => c.id);
    expect(withOwnBucket.sort()).toEqual(
      ['MFM', 'MNH', 'MNO', 'SI1', 'SI2P', 'SI3', 'SI4', 'SI5', 'ZAHA'].sort(),
    );
  });

  test('collections without an October bucket price identically to 2026', () => {
    for (const c of COLLECTIONS) {
      if (c.prices['2026-10']) continue;
      for (const cert of ['igi', 'inhouse']) {
        const oct = c.carats.map((_, i) => [getPrice(c, i, cert, Y), getRetail(c, i, cert, Y)]);
        const base = c.carats.map((_, i) => [getPrice(c, i, cert, '2026'), getRetail(c, i, cert, '2026')]);
        expect(`${c.id}/${cert}: ${JSON.stringify(oct)}`).toBe(`${c.id}/${cert}: ${JSON.stringify(base)}`);
      }
    }
  });
});
