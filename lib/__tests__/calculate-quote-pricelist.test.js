/**
 * @jest-environment node
 *
 * Same line set, two different pricelist years, two different totals — proves
 * the year flag actually flows into the quote calculation. Also validates that
 * a `priceOverride` line keeps its override regardless of the active year
 * (the toggle's "manual overrides preserved" promise).
 */

import { calculateQuote, COLLECTIONS } from '../catalog.js';

function findId(id) {
  const c = COLLECTIONS.find((x) => x.id === id);
  if (!c) throw new Error(`No collection ${id}`);
  return c;
}

describe('calculateQuote — pricelist year switching', () => {
  // Three lines covering three different B2B-changed collections so we know
  // multiple deltas land. CUTY 0.30 (€90→100), M3 0.30 (€85→95), MF 1.00 (€290→310).
  const lines = [
    {
      collectionId: 'CUTY',
      colorConfigs: [{ caratIdx: 3, qty: 3, certType: 'igi', colorName: 'Black' }],
    },
    {
      collectionId: 'M3',
      colorConfigs: [{ caratIdx: 1, qty: 2, certType: 'igi', colorName: 'Red' }],
    },
    {
      collectionId: 'MF',
      colorConfigs: [{ caratIdx: 1, qty: 2, certType: 'igi', colorName: 'Gold', shape: 'Heart' }],
    },
  ];

  test('2025 vs 2026 produces different totals', () => {
    const q25 = calculateQuote(lines, { pricelistYear: '2025' });
    const q26 = calculateQuote(lines, { pricelistYear: '2026' });
    // 2025: 90×3 + 85×2 + 290×2 = 270+170+580 = 1020
    // 2026: 100×3 + 95×2 + 310×2 = 300+190+620 = 1110
    expect(q25.subtotal).toBe(1020);
    expect(q26.subtotal).toBe(1110);
    expect(q26.subtotal - q25.subtotal).toBe(90);
  });

  test('CUTY-only delta is exact — €90 (2025) vs €100 (2026) per piece', () => {
    const oneCuty = [
      {
        collectionId: 'CUTY',
        colorConfigs: [{ caratIdx: 3, qty: 1, certType: 'igi', colorName: 'Black' }],
      },
    ];
    expect(calculateQuote(oneCuty, { pricelistYear: '2025' }).subtotal).toBe(90);
    expect(calculateQuote(oneCuty, { pricelistYear: '2026' }).subtotal).toBe(100);
  });

  test('priceOverride lines keep their override across both years', () => {
    const overridden = [
      {
        collectionId: 'CUTY',
        colorConfigs: [
          { caratIdx: 3, qty: 1, certType: 'igi', colorName: 'Black', priceOverride: 77 },
        ],
      },
    ];
    expect(calculateQuote(overridden, { pricelistYear: '2025' }).subtotal).toBe(77);
    expect(calculateQuote(overridden, { pricelistYear: '2026' }).subtotal).toBe(77);
  });

  test('HOLY is identical between years (per product-team confirmation)', () => {
    const holy = [
      {
        collectionId: 'HOLY',
        colorConfigs: [{ caratIdx: 2, qty: 2, certType: 'igi', colorName: 'Black', shape: 'Cross' }],
      },
    ];
    expect(calculateQuote(holy, { pricelistYear: '2025' }).subtotal).toBe(
      calculateQuote(holy, { pricelistYear: '2026' }).subtotal,
    );
  });

  test('CUBIX is identical between years (no B2B change in PDFs)', () => {
    const cubix = [
      {
        collectionId: 'CUBIX',
        colorConfigs: [{ caratIdx: 2, qty: 3, certType: 'igi', colorName: 'White' }],
      },
    ];
    expect(calculateQuote(cubix, { pricelistYear: '2025' }).subtotal).toBe(
      calculateQuote(cubix, { pricelistYear: '2026' }).subtotal,
    );
  });

  test('the discount tier (10% at €1600+) is unchanged across years', () => {
    // Build a line large enough to clear €1600 in 2025: HOLY 1.00 IGI ×4 = 2200 (2025) and 2200 (2026)
    // (HOLY identical between years), discount kicks at >= €1600.
    const big = [
      {
        collectionId: 'HOLY',
        colorConfigs: [{ caratIdx: 2, qty: 4, certType: 'igi', colorName: 'Black', shape: 'Cross' }],
      },
    ];
    const q25 = calculateQuote(big, { pricelistYear: '2025' });
    const q26 = calculateQuote(big, { pricelistYear: '2026' });
    expect(q25.discountPercent).toBe(q26.discountPercent);
    expect(q25.discountAmount).toBe(q26.discountAmount);
  });
});

// The October 2026 list is the first one whose SIZES differ from its neighbours.
// An agent can pick Moonlight Multi 0.70 ct there, switch back to 2026 and
// confirm — the config still points at a size that list does not sell. Quoting
// it at €0 without saying so would put a free line on a client's PDF.
describe('calculateQuote — a size the active pricelist does not sell', () => {
  const octoberOnly = [
    {
      collectionId: 'MNH',
      colorConfigs: [{ caratIdx: 2, qty: 2, certType: 'igi', colorName: 'Black' }],
    },
  ];

  test('quotes the October price on the October list, with no warning', () => {
    const q = calculateQuote(octoberOnly, { pricelistYear: '2026-10' });
    expect(q.subtotal).toBe(400); // €200 × 2
    expect(q.warnings).toEqual([]);
  });

  test('warns by name and size when the size is not on the active list', () => {
    const q = calculateQuote(octoberOnly, { pricelistYear: '2026' });
    expect(q.warnings).toHaveLength(1);
    expect(q.warnings[0]).toContain('Multi Moonlight');
    expect(q.warnings[0]).toContain('0.70 ct');
    expect(q.warnings[0]).toContain('2026 prices');
  });

  test('a manual price override is honoured and silences the warning', () => {
    const overridden = [
      {
        collectionId: 'MNH',
        colorConfigs: [
          { caratIdx: 2, qty: 2, certType: 'igi', colorName: 'Black', priceOverride: 210 },
        ],
      },
    ];
    const q = calculateQuote(overridden, { pricelistYear: '2026' });
    expect(q.subtotal).toBe(420);
    expect(q.warnings).toEqual([]);
  });

  test('a normal size on a normal list still warns about nothing', () => {
    const q = calculateQuote(
      [{ collectionId: 'MNH', colorConfigs: [{ caratIdx: 1, qty: 1, certType: 'igi', colorName: 'Black' }] }],
      { pricelistYear: '2026' },
    );
    expect(q.subtotal).toBe(130);
    expect(q.warnings).toEqual([]);
  });

  test('an out-of-range index is still clamped and reported separately', () => {
    const q = calculateQuote(
      [{ collectionId: 'MNH', colorConfigs: [{ caratIdx: 99, qty: 1, certType: 'igi', colorName: 'Black' }] }],
      { pricelistYear: '2026-10' },
    );
    expect(q.lines[0].carat).toBe('1.10');
    expect(q.warnings.some((w) => w.includes('out of range'))).toBe(true);
  });
});

describe('calculateQuote — the October pricelist', () => {
  test('reports the October key back on the quote so the PDF prints it', () => {
    const q = calculateQuote(
      [{ collectionId: 'CUTY', colorConfigs: [{ caratIdx: 3, qty: 1, certType: 'igi', colorName: 'Black' }] }],
      { pricelistYear: '2026-10' },
    );
    expect(q.pricelistYear).toBe('2026-10');
  });

  test('Sienna One costs more in October than on 2026', () => {
    const sienna = [
      { collectionId: 'SI1', colorConfigs: [{ caratIdx: 1, qty: 2, certType: 'igi', colorName: 'Black' }] },
    ];
    expect(calculateQuote(sienna, { pricelistYear: '2026' }).subtotal).toBe(300);    // €150 × 2
    expect(calculateQuote(sienna, { pricelistYear: '2026-10' }).subtotal).toBe(344); // €172 × 2
  });

  test('a classic collection costs the same on October as on 2026', () => {
    const cuty = [
      { collectionId: 'CUTY', colorConfigs: [{ caratIdx: 3, qty: 3, certType: 'igi', colorName: 'Black' }] },
    ];
    expect(calculateQuote(cuty, { pricelistYear: '2026-10' }).subtotal).toBe(
      calculateQuote(cuty, { pricelistYear: '2026' }).subtotal,
    );
  });
});
