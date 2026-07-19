/**
 * @jest-environment node
 *
 * Source-of-truth check against public/Price Lists/Pricelist_LoveLab_2026.pdf.
 * Mirror of catalog-prices-2025.test.js — every B2B and B2C price in the 2026
 * PDF must match what getPrice and getRetail return for pricelistYear='2026'.
 */

import { COLLECTIONS, getPrice, getRetail } from '../catalog.js';

const Y = '2026';

function col(id) {
  const c = COLLECTIONS.find((x) => x.id === id);
  if (!c) throw new Error(`No collection ${id}`);
  return c;
}

describe('2026 pricelist matches public/Price Lists/Pricelist_LoveLab_2026.pdf', () => {
  describe('CUTY', () => {
    const c = col('CUTY');
    test.each([
      // [caratIdx, cert,     B2B, B2C]
      [0,          'inhouse', 24,  75],   // 0,05 INHOUSE
      [0,          'igi',     30,  105],  // 0,05 IGI
      [1,          'inhouse', 34,  120],  // 0,10 INHOUSE
      [1,          'igi',     40,  155],  // 0,10 IGI
      [2,          'igi',     70,  315],  // 0,20 IGI
      [3,          'igi',     100, 430],  // 0,30 IGI
    ])('CUTY caratIdx=%i cert=%s -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('CUBIX', () => {
    const c = col('CUBIX');
    test.each([
      [0, 'inhouse', 24, 95],   // 0,05 INHOUSE
      [0, 'igi',     30, 120],  // 0,05 IGI
      [1, 'inhouse', 34, 145],  // 0,10 INHOUSE
      [1, 'igi',     40, 155],  // 0,10 IGI
      [2, 'igi',     70, 340],  // 0,20 IGI
    ])('CUBIX caratIdx=%i cert=%s -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('MULTI THREE', () => {
    const c = col('M3');
    test.each([
      [0, 'igi', 65,  260],   // 0,15
      [1, 'igi', 95,  400],   // 0,30
      [2, 'igi', 175, 800],   // 0,60
      [3, 'igi', 250, 1150],  // 0,90
    ])('M3 caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('MULTI FOUR', () => {
    const c = col('M4');
    test.each([
      [0, 'igi', 85,  360],  // 0,20
      [1, 'igi', 110, 500],  // 0,40
    ])('M4 caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('MULTI FIVE', () => {
    const c = col('M5');
    test.each([
      [0, 'igi', 95,  400],  // 0,25
      [1, 'igi', 130, 580],  // 0,50
    ])('M5 caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('MATCHY FANCY', () => {
    const c = col('MF');
    test.each([
      [0, 'igi', 200, 550],  // 0,60
      [1, 'igi', 310, 885],  // 1,00
    ])('MF caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('SHAPY SHINE FANCY', () => {
    const c = col('SSF');
    test.each([
      [0, 'igi', 55,  180],  // 0,10
      [1, 'igi', 100, 330],  // 0,30
      [2, 'igi', 155, 450],  // 0,50
    ])('SSF caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('SHAPY SPARKLE FANCY', () => {
    const c = col('SSPF');
    test.each([
      [0, 'igi', 240, 550],  // 0,70
      [1, 'igi', 325, 850],  // 1,00
    ])('SSPF caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('SHAPY SPARKLE RND G/H (inhouse)', () => {
    const c = col('SSRG');
    test.each([
      [0, 'inhouse', 125, 290],  // 0,50
      [1, 'inhouse', 165, 360],  // 0,70
      [2, 'inhouse', 225, 500],  // 1,00
    ])('SSRG caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('SHAPY SPARKLE RND D VVS (igi)', () => {
    const c = col('SSRD');
    test.each([
      [0, 'igi', 200, 550],  // 0,50
      [1, 'igi', 220, 650],  // 0,70
      [2, 'igi', 305, 850],  // 1,00
    ])('SSRD caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  // ─── Iconix (PDF update 2026-07-19: B2B rounded to whole euros) ───
  // B2B is pinned to the PDF. B2C deliberately NOT asserted here: the app's
  // Iconix retail values come from the original workbook and Sam chose to
  // keep them (the PDF's B2C column differs — see new-collections-prices).
  describe('ICONIX B2B (PDF 2026-07-19)', () => {
    test.each([
      // [id,     caratIdx, B2B]
      ['LUVA',    0,        150],  // Flower Heart 0,40
      ['LUMA',    0,        130],  // Flower Marquise 0,40
      ['LIN3',    0,        115],  // Linea Three 0,30
      ['LIN5',    0,        175],  // Linea Five 0,50
      ['RIV4',    0,        90],   // Riviera Four 0,20
      ['RIV4',    1,        115],  // Riviera Four 0,40
      ['RIV8',    0,        115],  // Riviera Eight 0,40
      ['RIV8',    1,        150],  // Riviera Eight 0,80
    ])('%s caratIdx=%i -> B2B=%i', (id, ci, b2b) => {
      expect(getPrice(col(id), ci, 'igi', Y)).toBe(b2b);
    });
  });
});
