/**
 * @jest-environment node
 *
 * Source-of-truth check against public/Price Lists/Pricelist_LoveLab_2025.pdf.
 * Every B2B and B2C price in the 2025 PDF must match what getPrice and
 * getRetail return for pricelistYear='2025'.
 *
 * If anyone touches the 2025 pricing, this test fails — forcing them to
 * either update the PDF, update the catalog, or both. No silent drift.
 */

import { COLLECTIONS, getPrice, getRetail } from '../catalog.js';

const Y = '2025';

function col(id) {
  const c = COLLECTIONS.find((x) => x.id === id);
  if (!c) throw new Error(`No collection ${id}`);
  return c;
}

describe('2025 pricelist matches public/Price Lists/Pricelist_LoveLab_2025.pdf', () => {
  // CUTY (min 3 pcs/color)
  describe('CUTY', () => {
    const c = col('CUTY');
    test.each([
      // [caratIdx, cert,     B2B, B2C]
      [0,          'inhouse', 20,  95],   // 0,05 INHOUSE
      [0,          'igi',     30,  105],  // 0,05 IGI
      [1,          'inhouse', 30,  145],  // 0,10 INHOUSE
      [1,          'igi',     40,  155],  // 0,10 IGI
      [2,          'igi',     65,  315],  // 0,20 IGI
      [3,          'igi',     90,  430],  // 0,30 IGI
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
      [0, 'igi', 55,  260],   // 0,15
      [1, 'igi', 85,  400],   // 0,30
      [2, 'igi', 165, 800],   // 0,60
      [3, 'igi', 240, 1150],  // 0,90
    ])('M3 caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('MULTI FOUR', () => {
    const c = col('M4');
    test.each([
      [0, 'igi', 75,  360],  // 0,20
      [1, 'igi', 100, 500],  // 0,40
    ])('M4 caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('MULTI FIVE', () => {
    const c = col('M5');
    test.each([
      [0, 'igi', 85,  400],  // 0,25
      [1, 'igi', 120, 580],  // 0,50
    ])('M5 caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('MATCHY FANCY', () => {
    const c = col('MF');
    test.each([
      [0, 'igi', 180, 550],  // 0,60
      [1, 'igi', 290, 885],  // 1,00
    ])('MF caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('SHAPY SHINE FANCY', () => {
    const c = col('SSF');
    test.each([
      [0, 'igi', 50,  180],  // 0,10
      [1, 'igi', 90,  330],  // 0,30
      [2, 'igi', 145, 450],  // 0,50
    ])('SSF caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('SHAPY SPARKLE FANCY', () => {
    const c = col('SSPF');
    test.each([
      [0, 'igi', 225, 550],  // 0,70
      [1, 'igi', 300, 850],  // 1,00
    ])('SSPF caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('SHAPY SPARKLE RND G/H (inhouse)', () => {
    const c = col('SSRG');
    test.each([
      [0, 'inhouse', 115, 290],  // 0,50
      [1, 'inhouse', 145, 360],  // 0,70
      [2, 'inhouse', 205, 500],  // 1,00
    ])('SSRG caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });

  describe('SHAPY SPARKLE RND D VVS (igi)', () => {
    const c = col('SSRD');
    test.each([
      [0, 'igi', 180, 550],  // 0,50
      [1, 'igi', 200, 650],  // 0,70
      [2, 'igi', 285, 850],  // 1,00
    ])('SSRD caratIdx=%i -> B2B=%i B2C=%i', (ci, cert, b2b, b2c) => {
      expect(getPrice(c, ci, cert, Y)).toBe(b2b);
      expect(getRetail(c, ci, cert, Y)).toBe(b2c);
    });
  });
});
