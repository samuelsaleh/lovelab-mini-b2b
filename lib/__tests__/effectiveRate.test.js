import { resolveEffectiveRate } from '@/lib/effectiveRate';
import { calculateCommission } from '@/lib/commission';

describe('resolveEffectiveRate', () => {
  test('a positive personal rate overrides the organization default', () => {
    expect(resolveEffectiveRate(
      { commission_rate: 20 },
      { commission_rate: 15 },
    )).toEqual({ rate: 20, source: 'agent' });
  });

  test('zero or missing personal rate inherits the organization default', () => {
    expect(resolveEffectiveRate(
      { commission_rate: 0 },
      { commission_rate: 15 },
    )).toEqual({ rate: 15, source: 'organization' });
    expect(resolveEffectiveRate(
      {},
      { commission_rate: '12.5' },
    )).toEqual({ rate: 12.5, source: 'organization' });
  });

  test('returns an explicit unconfigured result when neither side has a rate', () => {
    expect(resolveEffectiveRate(
      { commission_rate: null },
      { commission_rate: 0 },
    )).toEqual({ rate: 0, source: 'none' });
  });

  test('Silke INHORGENTA rows total the settled €2,745.75 at 15%', () => {
    const orderTotals = [1159, 1360, 2930, 2200, 3002, 2034, 5620];
    const total = orderTotals.reduce(
      (sum, orderTotal) => sum + calculateCommission(orderTotal, null, 15).amount,
      0,
    );
    expect(Math.round(total * 100) / 100).toBe(2745.75);
  });
});
