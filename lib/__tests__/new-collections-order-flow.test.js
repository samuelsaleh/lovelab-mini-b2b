/**
 * @jest-environment node
 *
 * Guarantee 3 — building a test order works end-to-end.
 *
 * For every one of the 15 new collections this drives the real pipeline the
 * builder uses:
 *   builder lines (mimicking CollectionConfig.addColor defaults)
 *     -> calculateQuote  (pricing)
 *     -> linesToFormRows (the persisted order-grid rows)
 *     -> validateOrder   (the Save-button hard gate)
 * and asserts the resulting order has ZERO missing fields, plus that the quote
 * priced every line from the catalog. SI1 (no photos) must still order fine.
 */

import { COLLECTIONS, HOUSING, calculateQuote, getPrice } from '../catalog.js';
import { linesToFormRows } from '../packBuild.js';
import { validateOrder } from '../orderRowValidation.js';

const NEW_IDS = [
  'MFM', 'MNO', 'MNH',
  'SI1', 'SI2P', 'SI3', 'SI4', 'SI5',
  'ZAHA', 'LUVA', 'LUMA', 'RIV4', 'RIV8', 'LIN3', 'LIN5',
];

function col(id) {
  const c = COLLECTIONS.find((x) => x.id === id);
  if (!c) throw new Error(`No collection ${id}`);
  return c;
}

// Build a builder-shaped colorConfig the way CollectionConfig.addColor would:
// default housing tile = first tile, first carat/size/allowed color, silk gets a
// thickness, qty respects the collection minimum.
function makeLine(id, caratIdx = 0) {
  const c = col(id);
  const isSilk = c.cord === 'silk';
  const cfg = {
    id: `${id}-cfg`,
    caratIdx,
    housing: HOUSING[c.housing][0], // 'Yellow Gold'
    size: c.sizes[0],
    colorName: c.allowedColors[0],
    certType: 'igi',
    qty: c.minC || 1,
  };
  if (isSilk) {
    cfg.cordType = 'silk';
    cfg.thickness = 'Thin';
  }
  return { collectionId: id, colorConfigs: [cfg] };
}

describe('new collections — order builds and validates clean', () => {
  test.each(NEW_IDS.map((id) => [id]))('%s: full builder->quote->rows->validate', (id) => {
    const c = col(id);
    const lines = [makeLine(id)];

    const quote = calculateQuote(lines, { pricelistYear: '2026' });
    expect(quote.lines).toHaveLength(1);
    const ql = quote.lines[0];
    expect(ql.product).toBe(c.label);
    expect(ql.housing).toBe(HOUSING[c.housing][0]);
    // Price came from the catalog, not a fallback / zero.
    expect(ql.unitB2B).toBe(getPrice(c, 0, 'igi', '2026'));
    expect(ql.unitB2B).toBeGreaterThan(0);
    expect(ql.lineTotal).toBe(ql.unitB2B * (c.minC || 1));

    const rows = linesToFormRows(lines, { pricelistYear: '2026' });
    expect(rows).toHaveLength(1);

    const result = validateOrder(rows);
    // Surface the exact missing fields if any, for a readable failure.
    expect(`${id} missing: ${JSON.stringify(result.issues)}`).toBe(`${id} missing: []`);
    expect(result.ok).toBe(true);
  });

  test('a mixed multi-collection order (all 15 at once) validates clean', () => {
    const lines = NEW_IDS.map((id) => makeLine(id));
    const quote = calculateQuote(lines, { pricelistYear: '2026' });
    expect(quote.lines).toHaveLength(NEW_IDS.length);
    expect(quote.total).toBeGreaterThan(0);

    const rows = linesToFormRows(lines, { pricelistYear: '2026' });
    expect(rows).toHaveLength(NEW_IDS.length);

    const result = validateOrder(rows);
    expect(`mixed order missing: ${JSON.stringify(result.issues)}`).toBe('mixed order missing: []');
    expect(result.ok).toBe(true);
  });

  test('silk rows carry a Silk (thickness) material; nylon rows do not require one', () => {
    const silkRows = linesToFormRows([makeLine('SI1')], { pricelistYear: '2026' });
    expect(silkRows[0].material).toBe('Silk (Thin)');

    const nylonRows = linesToFormRows([makeLine('MFM')], { pricelistYear: '2026' });
    // Nylon collections don't populate material, and the validator doesn't require it.
    expect(nylonRows[0].material).toBe('');
    expect(validateOrder(nylonRows).ok).toBe(true);
  });

  test('housing tile is preserved as bpColor with no setting (shiny/matte both)', () => {
    const rows = linesToFormRows([
      { collectionId: 'MFM', colorConfigs: [
        { id: 'a', caratIdx: 0, housing: 'Black Matte', size: 'M', colorName: 'Black', certType: 'igi', qty: 2 },
        { id: 'b', caratIdx: 0, housing: 'White', size: 'M', colorName: 'Gold', certType: 'igi', qty: 2 },
      ] },
    ], { pricelistYear: '2026' });
    expect(rows[0].bpColor).toBe('Black Matte');
    expect(rows[0].setting).toBe('');
    expect(rows[1].bpColor).toBe('White');
    expect(validateOrder(rows).ok).toBe(true);
  });
});
