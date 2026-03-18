/**
 * normalizeCountry — unit tests
 *
 * Guarantees:
 *   - Non-English country names are mapped to their canonical English form
 *   - Common abbreviations and typos are resolved
 *   - Cities/regions stored as countries are normalised to their parent country
 *   - Canonical English names pass through unchanged
 *   - Empty/null input returns 'Unknown'
 */

import { normalizeCountry } from '@/lib/countries'

describe('normalizeCountry', () => {
  // ── Empty / null ────────────────────────────────────────────────────────
  test('returns Unknown for null', () => expect(normalizeCountry(null)).toBe('Unknown'))
  test('returns Unknown for empty string', () => expect(normalizeCountry('')).toBe('Unknown'))
  test('returns Unknown for whitespace only', () => expect(normalizeCountry('   ')).toBe('Unknown'))

  // ── Dutch names ─────────────────────────────────────────────────────────
  test('Duitsland → Germany', () => expect(normalizeCountry('Duitsland')).toBe('Germany'))
  test('duitsland (lowercase) → Germany', () => expect(normalizeCountry('duitsland')).toBe('Germany'))
  test('Holland → Netherlands', () => expect(normalizeCountry('Holland')).toBe('Netherlands'))
  test('Oostenrijk → Austria', () => expect(normalizeCountry('Oostenrijk')).toBe('Austria'))

  // ── French names ────────────────────────────────────────────────────────
  test('Allemagne → Germany', () => expect(normalizeCountry('Allemagne')).toBe('Germany'))
  test('Suisse → Switzerland', () => expect(normalizeCountry('Suisse')).toBe('Switzerland'))
  test('Belgique → Belgium', () => expect(normalizeCountry('Belgique')).toBe('Belgium'))
  test('Espagne → Spain', () => expect(normalizeCountry('Espagne')).toBe('Spain'))
  test('Royaume-Uni → United Kingdom', () => expect(normalizeCountry('Royaume-Uni')).toBe('United Kingdom'))

  // ── Italian ─────────────────────────────────────────────────────────────
  test('Italia → Italy', () => expect(normalizeCountry('Italia')).toBe('Italy'))

  // ── Abbreviations ────────────────────────────────────────────────────────
  test('Uk → United Kingdom', () => expect(normalizeCountry('Uk')).toBe('United Kingdom'))
  test('UK → United Kingdom', () => expect(normalizeCountry('UK')).toBe('United Kingdom'))
  test('UAE → United Arab Emirates', () => expect(normalizeCountry('UAE')).toBe('United Arab Emirates'))
  test('Uea → United Arab Emirates', () => expect(normalizeCountry('Uea')).toBe('United Arab Emirates'))

  // ── Cities stored as countries ───────────────────────────────────────────
  test('Dubai → United Arab Emirates', () => expect(normalizeCountry('Dubai')).toBe('United Arab Emirates'))
  test('Corse → France', () => expect(normalizeCountry('Corse')).toBe('France'))

  // ── Typos ────────────────────────────────────────────────────────────────
  test('Bulgary → Bulgaria', () => expect(normalizeCountry('Bulgary')).toBe('Bulgaria'))

  // ── Canonical English names pass through ─────────────────────────────────
  test('Germany passes through', () => expect(normalizeCountry('Germany')).toBe('Germany'))
  test('France passes through', () => expect(normalizeCountry('France')).toBe('France'))
  test('United Kingdom passes through', () => expect(normalizeCountry('United Kingdom')).toBe('United Kingdom'))
  test('Italy passes through', () => expect(normalizeCountry('Italy')).toBe('Italy'))
  test('Switzerland passes through', () => expect(normalizeCountry('Switzerland')).toBe('Switzerland'))
  test('Netherlands passes through', () => expect(normalizeCountry('Netherlands')).toBe('Netherlands'))
  test('Belgium passes through', () => expect(normalizeCountry('Belgium')).toBe('Belgium'))
  test('Austria passes through', () => expect(normalizeCountry('Austria')).toBe('Austria'))

  // ── Case insensitive for canonical names ─────────────────────────────────
  test('germany (lowercase) → Germany', () => expect(normalizeCountry('germany')).toBe('Germany'))
  test('FRANCE (uppercase) → France', () => expect(normalizeCountry('FRANCE')).toBe('France'))

  // ── Unknown value gets title-cased ───────────────────────────────────────
  test('completely unknown value is title-cased', () =>
    expect(normalizeCountry('nouvelle atlantide')).toBe('Nouvelle Atlantide'))
})
