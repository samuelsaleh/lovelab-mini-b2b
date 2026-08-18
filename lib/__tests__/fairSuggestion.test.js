/**
 * @jest-environment node
 *
 * suggestFairForDate — date-based fair suggestion (pure).
 *   ✓ returns the fair whose [start,end] window contains the order date
 *   ✓ inclusive on both ends
 *   ✓ ignores non-fair events and fairs missing dates
 *   ✓ returns null when nothing matches / bad input
 *   ✓ prefers the most specific (shortest) window on overlap
 */

import { suggestFairForDate } from '@/lib/fairSuggestion';

const events = [
  { id: 'nordstil', name: 'Nordstil', type: 'fair', start_date: '2026-07-25', end_date: '2026-07-27' },
  { id: 'trend', name: 'Trend up West', type: 'fair', start_date: '2026-06-27', end_date: '2026-06-29' },
  { id: 'agentFolder', name: 'Bastian', type: 'agent', start_date: null, end_date: null },
  { id: 'nodate', name: 'No Dates Fair', type: 'fair', start_date: null, end_date: null },
];

describe('suggestFairForDate', () => {
  test('matches a date inside a fair window', () => {
    expect(suggestFairForDate('2026-07-26', events)).toMatchObject({ id: 'nordstil' });
    expect(suggestFairForDate('2026-06-28T14:00:00Z', events)).toMatchObject({ id: 'trend' });
  });

  test('is inclusive on both ends', () => {
    expect(suggestFairForDate('2026-07-25', events)).toMatchObject({ id: 'nordstil' });
    expect(suggestFairForDate('2026-07-27', events)).toMatchObject({ id: 'nordstil' });
  });

  test('returns null when no fair contains the date', () => {
    expect(suggestFairForDate('2026-01-01', events)).toBeNull();
    expect(suggestFairForDate('2026-07-28', events)).toBeNull();
  });

  test('ignores non-fair events and fairs with no dates', () => {
    // A date that only "matches" the dateless agent folder / fair → null
    expect(suggestFairForDate('2030-01-01', events)).toBeNull();
  });

  test('returns null for empty / invalid input', () => {
    expect(suggestFairForDate('', events)).toBeNull();
    expect(suggestFairForDate('not-a-date', events)).toBeNull();
    expect(suggestFairForDate('2026-07-26', [])).toBeNull();
    expect(suggestFairForDate('2026-07-26', null)).toBeNull();
  });

  test('prefers the most specific (shortest) window on overlap', () => {
    const overlapping = [
      { id: 'broad', name: 'Broad', type: 'fair', start_date: '2026-07-01', end_date: '2026-07-31' },
      { id: 'narrow', name: 'Narrow', type: 'fair', start_date: '2026-07-25', end_date: '2026-07-27' },
    ];
    expect(suggestFairForDate('2026-07-26', overlapping)).toMatchObject({ id: 'narrow' });
  });
});
