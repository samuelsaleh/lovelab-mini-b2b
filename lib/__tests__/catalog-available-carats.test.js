/**
 * @jest-environment node
 *
 * getAvailableCarats decides which sizes a carat picker offers. It matters
 * because the sizes on sale differ per pricelist: the October 2026 list added
 * Moonlight Multi 0.70 / 1.10 and Moonlight Original 0.20, which are priced
 * null on 2025 / 2026 and must not be offered there at €0.
 */

import {
  COLLECTIONS,
  PRICELISTS,
  getAvailableCarats,
  getPrice,
  getRetail,
} from '../catalog.js';

function col(id) {
  const c = COLLECTIONS.find((x) => x.id === id);
  if (!c) throw new Error(`No collection ${id}`);
  return c;
}

const caratsOn = (id, year) => getAvailableCarats(col(id), year).map((o) => o.carat);

describe('getAvailableCarats', () => {
  test('returns [] for a missing or malformed collection', () => {
    expect(getAvailableCarats(null, '2026')).toEqual([]);
    expect(getAvailableCarats(undefined, '2026')).toEqual([]);
    expect(getAvailableCarats({}, '2026')).toEqual([]);
  });

  test('idx is the position in col.carats, not in the filtered list', () => {
    // MNH prices only 0.20 / 0.40 on 2026 — the 0.40 option must still report
    // idx 1 so a stored caratIdx and getPrice(col, idx) keep agreeing.
    const opts = getAvailableCarats(col('MNH'), '2026');
    expect(opts).toEqual([
      { carat: '0.20', idx: 0 },
      { carat: '0.40', idx: 1 },
    ]);
    for (const { idx } of opts) {
      expect(getPrice(col('MNH'), idx, 'igi', '2026')).toBeGreaterThan(0);
    }
  });

  test('offers every size when the whole list is priced', () => {
    expect(caratsOn('CUTY', '2026')).toEqual(['0.05', '0.10', '0.20', '0.30']);
    expect(caratsOn('SSF', '2026')).toEqual(['0.10', '0.30', '0.50']);
  });

  // CUTY / CUBIX In-house arrays are null past 0.10. Those carats are still on
  // sale under IGI, so they must NOT be filtered out.
  test('a size priced by only one certificate stays available', () => {
    expect(caratsOn('CUTY', '2026')).toContain('0.30');
    expect(getPrice(col('CUTY'), 3, 'inhouse', '2026')).toBe(0);
    expect(getPrice(col('CUTY'), 3, 'igi', '2026')).toBe(100);
    expect(caratsOn('CUBIX', '2026')).toContain('0.20');
  });

  describe('sizes the October list introduced', () => {
    test('Moonlight Multi 0.70 / 1.10 exist only on the October list', () => {
      expect(caratsOn('MNH', '2025')).toEqual(['0.20', '0.40']);
      expect(caratsOn('MNH', '2026')).toEqual(['0.20', '0.40']);
      expect(caratsOn('MNH', '2026-10')).toEqual(['0.20', '0.40', '0.70', '1.10']);
    });

    test('Moonlight Original 0.20 exists only on the October list', () => {
      expect(caratsOn('MFM', '2026')).toEqual(['0.10', '0.30', '0.50', '0.70', '1.01']);
      expect(caratsOn('MFM', '2026-10')).toEqual(['0.10', '0.20', '0.30', '0.50', '0.70', '1.01']);
    });

    test('an October-only size prices at 0 on the older lists', () => {
      const mnh = col('MNH');
      const octOnly = mnh.carats.indexOf('0.70');
      expect(getPrice(mnh, octOnly, 'igi', '2026')).toBe(0);
      expect(getRetail(mnh, octOnly, 'igi', '2026')).toBe(0);
      expect(getPrice(mnh, octOnly, 'igi', '2026-10')).toBe(200);
    });
  });

  describe('sizes discontinued in October', () => {
    // Sam confirmed these are gone for good, so they are removed from the
    // catalog outright rather than nulled per list.
    test.each([
      ['MNO', '0.20'],
      ['MNH', '0.15'],
      ['MNH', '0.30'],
      ['SI1', '0.20'],
    ])('%s %s ct is absent on every pricelist', (id, carat) => {
      expect(col(id).carats).not.toContain(carat);
      for (const year of PRICELISTS) {
        expect(caratsOn(id, year)).not.toContain(carat);
      }
    });
  });

  test('every collection offers at least one size on every pricelist', () => {
    const empty = [];
    for (const c of COLLECTIONS) {
      for (const year of PRICELISTS) {
        if (getAvailableCarats(c, year).length === 0) empty.push(`${c.id}/${year}`);
      }
    }
    expect(empty).toEqual([]);
  });

  test('no offered size ever prices at 0 for its default certificate path', () => {
    const zero = [];
    for (const c of COLLECTIONS) {
      for (const year of PRICELISTS) {
        for (const { carat, idx } of getAvailableCarats(c, year)) {
          const certs = c.certificate === 'both' ? ['igi', 'inhouse'] : [c.certificate];
          const priced = certs.some((cert) => getPrice(c, idx, cert, year) > 0);
          if (!priced) zero.push(`${c.id}/${year}/${carat}`);
        }
      }
    }
    expect(zero).toEqual([]);
  });

  test('an unknown pricelist falls back to the default list', () => {
    expect(caratsOn('MNH', 'not-a-year')).toEqual(caratsOn('MNH', '2026'));
  });
});
