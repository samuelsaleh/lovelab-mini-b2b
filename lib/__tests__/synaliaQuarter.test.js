/**
 * @jest-environment node
 */

const {
  getQuarterBounds,
  getCurrentQuarter,
  getPreviousQuarter,
  listSynaliaQuarterOptions,
  filterSynaliaOrdersForQuarter,
  isSynaliaOrder,
} = require('../synaliaQuarter.js');

describe('synaliaQuarter', () => {
  test('getQuarterBounds T1 2026', () => {
    const q = getQuarterBounds(2026, 1);
    expect(q.key).toBe('2026-T1');
    expect(q.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(q.end.getUTCMonth()).toBe(2);
    expect(q.end.getUTCDate()).toBe(31);
  });

  test('getCurrentQuarter in June 2026 returns T2', () => {
    const q = getCurrentQuarter(new Date(Date.UTC(2026, 5, 15)));
    expect(q.quarter).toBe(2);
    expect(q.year).toBe(2026);
  });

  test('listSynaliaQuarterOptions starts at current quarter and goes forward', () => {
    const ref = new Date(Date.UTC(2026, 5, 1)); // June 2026
    const list = listSynaliaQuarterOptions(ref, 8);
    expect(list[0].year).toBe(2026);
    expect(list[0].quarter).toBe(2);
    expect(list[0].isCurrent).toBe(true);
    expect(list[1].quarter).toBe(3);
    expect(list[1].year).toBe(2026);
    expect(list[list.length - 1].year).toBe(2028);
    expect(list[list.length - 1].quarter).toBe(1);
    expect(list.every((q) => q.year >= 2026)).toBe(true);
  });

  test('isSynaliaOrder reads jewelerGroup and legacy metadata flags', () => {
    expect(isSynaliaOrder({ metadata: { jewelerGroup: 'SYNALIA' } })).toBe(true);
    expect(isSynaliaOrder({ metadata: { formState: { jewelerGroup: 'SYNALIA' } } })).toBe(true);
    expect(isSynaliaOrder({ metadata: { jewelerGroup: 'MG', synalia: true } })).toBe(false);
    expect(isSynaliaOrder({ metadata: { jewelerGroup: 'JOAILLIERS_ORFEVRES' } })).toBe(false);
    expect(isSynaliaOrder({ metadata: { jewelerGroup: 'AUCUN' } })).toBe(false);
    expect(isSynaliaOrder({ metadata: { synalia: true } })).toBe(true);
    expect(isSynaliaOrder({ metadata: { formState: { synalia: true } } })).toBe(true);
    expect(isSynaliaOrder({ metadata: {} })).toBe(false);
  });

  test('filterSynaliaOrdersForQuarter', () => {
    const docs = [
      {
        id: '1',
        created_at: '2026-02-01T00:00:00.000Z',
        metadata: { jewelerGroup: 'SYNALIA', synalia: true, formState: { date: '2026-02-15' } },
        total_amount: 100,
      },
      {
        id: '2',
        created_at: '2026-05-01T00:00:00.000Z',
        metadata: { synalia: true },
        total_amount: 200,
      },
      {
        id: '3',
        created_at: '2026-02-01T00:00:00.000Z',
        metadata: { jewelerGroup: 'MG', synalia: false },
        total_amount: 50,
      },
      {
        id: '4',
        created_at: '2026-02-01T00:00:00.000Z',
        metadata: { jewelerGroup: 'JOAILLIERS_ORFEVRES' },
        total_amount: 75,
      },
    ];
    const filtered = filterSynaliaOrdersForQuarter(docs, 2026, 1);
    expect(filtered.map((d) => d.id)).toEqual(['1']);
  });
});
