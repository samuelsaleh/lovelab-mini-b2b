/**
 * @jest-environment node
 *
 * Default-fallback contract for the pricelist year. The `pricelistYear`
 * argument is technically optional everywhere — when missing or invalid, the
 * catalog must fall back to DEFAULT_PRICELIST ('2026'). This guarantees that
 * any call site we forgot to migrate keeps quoting today's prices instead of
 * silently breaking.
 */

import {
  COLLECTIONS,
  DEFAULT_PRICELIST,
  PRICELISTS,
  resolvePricelist,
  getPrice,
  getRetail,
  getAvailableCerts,
  calculateQuote,
} from '../catalog.js';

const cuty = COLLECTIONS.find((c) => c.id === 'CUTY');

describe('catalog pricelist defaults', () => {
  test('PRICELISTS exposes both years and DEFAULT_PRICELIST is 2026', () => {
    expect(PRICELISTS).toEqual(['2025', '2026']);
    expect(DEFAULT_PRICELIST).toBe('2026');
  });

  describe('resolvePricelist', () => {
    test('returns the default when input is missing', () => {
      expect(resolvePricelist(undefined)).toBe('2026');
      expect(resolvePricelist(null)).toBe('2026');
    });
    test('returns the default for an unknown year', () => {
      expect(resolvePricelist('2024')).toBe('2026');
      expect(resolvePricelist('something-bogus')).toBe('2026');
    });
    test('coerces numbers to strings', () => {
      expect(resolvePricelist(2025)).toBe('2025');
      expect(resolvePricelist(2026)).toBe('2026');
    });
    test('passes valid years through', () => {
      expect(resolvePricelist('2025')).toBe('2025');
      expect(resolvePricelist('2026')).toBe('2026');
    });
  });

  describe('getPrice / getRetail without a year', () => {
    test('CUTY 0.30 IGI -> 2026 prices when no year is passed', () => {
      // 2026 = €100, 2025 = €90 — these MUST diverge so this assertion is meaningful.
      expect(getPrice(cuty, 3, 'igi')).toBe(100);
      expect(getPrice(cuty, 3, 'igi', undefined)).toBe(100);
      expect(getPrice(cuty, 3, 'igi', null)).toBe(100);
    });
    test('CUTY 0.30 IGI retail does NOT differ between years (B2C unchanged)', () => {
      expect(getRetail(cuty, 3, 'igi')).toBe(getRetail(cuty, 3, 'igi', '2025'));
    });
    test('invalid year falls back to default', () => {
      expect(getPrice(cuty, 3, 'igi', '2024')).toBe(100);
      expect(getPrice(cuty, 3, 'igi', 'bogus')).toBe(100);
    });
  });

  describe('getAvailableCerts default', () => {
    test('CUTY 0.05 returns [igi, inhouse] under either year (inhouse exists at 0.05/0.10)', () => {
      expect(getAvailableCerts(cuty, 0)).toEqual(['igi', 'inhouse']);
      expect(getAvailableCerts(cuty, 0, '2025')).toEqual(['igi', 'inhouse']);
      expect(getAvailableCerts(cuty, 0, '2026')).toEqual(['igi', 'inhouse']);
    });
    test('CUTY 0.30 returns only [igi] (no inhouse at 0.30)', () => {
      expect(getAvailableCerts(cuty, 3)).toEqual(['igi']);
    });
  });

  describe('calculateQuote default', () => {
    const lines = [
      {
        collectionId: 'CUTY',
        colorConfigs: [
          { caratIdx: 3, qty: 3, certType: 'igi', colorName: 'Black' },
        ],
      },
    ];

    test('omitting opts.pricelistYear uses the 2026 prices and reports it on the quote', () => {
      const q = calculateQuote(lines);
      expect(q.pricelistYear).toBe('2026');
      // 100 unit × 3 qty = 300 (and minC=3 enforced by the cfg.qty)
      expect(q.subtotal).toBe(300);
    });

    test('explicit { pricelistYear: undefined } falls back to default', () => {
      const q = calculateQuote(lines, { pricelistYear: undefined });
      expect(q.pricelistYear).toBe('2026');
    });

    test('explicit { pricelistYear: "2025" } uses 2025 prices', () => {
      const q = calculateQuote(lines, { pricelistYear: '2025' });
      expect(q.pricelistYear).toBe('2025');
      expect(q.subtotal).toBe(270); // €90 × 3
    });
  });
});
