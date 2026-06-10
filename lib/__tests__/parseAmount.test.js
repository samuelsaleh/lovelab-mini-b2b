import { parseAmount } from '@/lib/parseAmount';

describe('parseAmount', () => {
  test('plain integers and dot decimals', () => {
    expect(parseAmount('1000')).toBe(1000);
    expect(parseAmount('146.55')).toBeCloseTo(146.55, 2);
    expect(parseAmount('0.55')).toBeCloseTo(0.55, 2);
  });

  test('comma as decimal separator (fr/be locale)', () => {
    expect(parseAmount('146,55')).toBeCloseTo(146.55, 2);
    expect(parseAmount('0,55')).toBeCloseTo(0.55, 2);
    expect(parseAmount('1469,5')).toBeCloseTo(1469.5, 2);
  });

  test('dot thousands + comma decimal (1.469,55)', () => {
    expect(parseAmount('1.469,55')).toBeCloseTo(1469.55, 2);
    expect(parseAmount('1.000.000,00')).toBeCloseTo(1000000, 2);
  });

  test('comma thousands + dot decimal (1,469.55)', () => {
    expect(parseAmount('1,469.55')).toBeCloseTo(1469.55, 2);
    expect(parseAmount('1,000,000.00')).toBeCloseTo(1000000, 2);
  });

  test('space / nbsp thousands separators', () => {
    expect(parseAmount('1 469,55')).toBeCloseTo(1469.55, 2);
    expect(parseAmount('1\u00a0469,55')).toBeCloseTo(1469.55, 2);
  });

  test('multiple commas with no dot are thousands grouping', () => {
    expect(parseAmount('1,469')).toBeCloseTo(1.469, 3); // single comma => decimal
    expect(parseAmount('1,000,000')).toBe(1000000); // multiple => grouping
  });

  test('strips currency symbols and stray characters', () => {
    expect(parseAmount('€ 146,55')).toBeCloseTo(146.55, 2);
    expect(parseAmount('146,55 EUR')).toBeCloseTo(146.55, 2);
  });

  test('passes through finite numbers', () => {
    expect(parseAmount(146.55)).toBeCloseTo(146.55, 2);
    expect(parseAmount(0)).toBe(0);
  });

  test('returns NaN for empty / invalid input', () => {
    expect(Number.isNaN(parseAmount(''))).toBe(true);
    expect(Number.isNaN(parseAmount('   '))).toBe(true);
    expect(Number.isNaN(parseAmount(null))).toBe(true);
    expect(Number.isNaN(parseAmount(undefined))).toBe(true);
    expect(Number.isNaN(parseAmount('abc'))).toBe(true);
    expect(Number.isNaN(parseAmount(Infinity))).toBe(true);
  });

  test('negative values', () => {
    expect(parseAmount('-146,55')).toBeCloseTo(-146.55, 2);
  });
});
