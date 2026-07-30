/**
 * @jest-environment node
 *
 * Sam, July 2026: remove the Gold thread colour from Moonlight, Sienna and
 * Za-Ha in the Builder. Iconix (Flower Heart / Luma / Riviera) and Linea keep
 * Gold. CollectionConfig filters the cord palette via allowedColors, so this
 * pin is the whole UI guarantee.
 */

const { COLLECTIONS } = require('../catalog.js');

const NO_GOLD = [
  'MFM', 'MNO', 'MNH',           // Moonlight
  'SI1', 'SI2P', 'SI3', 'SI4', 'SI5', // Sienna
  'ZAHA',                       // Za-Ha
];

const STILL_HAS_GOLD = ['LUVA', 'LUMA', 'RIV4', 'RIV8', 'LIN3', 'LIN5'];

describe('Moonlight / Sienna / Za-Ha — no Gold thread', () => {
  test.each(NO_GOLD.map((id) => [id]))('%s does not offer Gold cord', (id) => {
    const col = COLLECTIONS.find((c) => c.id === id);
    expect(col).toBeTruthy();
    expect(col.allowedColors).toBeDefined();
    expect(col.allowedColors).not.toContain('Gold');
  });

  test.each(STILL_HAS_GOLD.map((id) => [id]))('%s still offers Gold cord', (id) => {
    const col = COLLECTIONS.find((c) => c.id === id);
    expect(col).toBeTruthy();
    expect(col.allowedColors).toContain('Gold');
  });

  test('Moonlight / Sienna / Za-Ha keep the other four cord colours', () => {
    for (const id of NO_GOLD) {
      const col = COLLECTIONS.find((c) => c.id === id);
      const names = col.allowedColors;
      // casing differs nylon vs silk for silver grey
      expect(names.some((n) => /^Silver [Gg]rey$/.test(n))).toBe(true);
      expect(names).toEqual(expect.arrayContaining(['Black', 'Bordeaux', 'Brown']));
      expect(names).toHaveLength(4);
    }
  });
});
