/**
 * @jest-environment node
 *
 * Shapy Sparkle Round threads.
 *
 * Reported from a real order built off the "Pack Man" pack: the Shapy Sparkle
 * Round rows had an empty MATERIAL cell and the Silver Grey row lost its
 * colour. Both came from the same cause — the collection was modelled as
 * silk-or-braided-nylon, nothing decided which, and the two palettes spell the
 * colour differently ('Silver grey' on silk, 'Silver Grey' on nylon), so the
 * dropdown could not match it.
 *
 * Shapy Sparkle ships on silk only (Sam, 2026-08-10); Shapy Shine ships on its
 * own Shine thread. These lock down both the catalog data and the helpers the
 * builder, packs and order form share.
 */

import {
  COLLECTIONS,
  CORD_COLORS,
  buildMaterialLabel,
  calculateQuote,
  cordPaletteFor,
  getDefaultCordType,
  getDefaultThickness,
  normalizeCordColorName,
  parseMaterialLabel,
} from '../catalog.js';
import { linesToFormRows } from '../packBuild.js';

const col = (id) => COLLECTIONS.find((c) => c.id === id);

const SSRG = col('SSRG'); // SHAPY SPARKLE RND G/H
const SSRD = col('SSRD'); // SHAPY SPARKLE D VVS
const SSPF = col('SSPF'); // SHAPY SPARKLE FANCY
const SSF = col('SSF');   // SHAPY SHINE FANCY
const CUBIX = col('CUBIX');

// No shipping collection uses more than one thread today, but the builder and
// order form still support it — exercise that path through a stub.
const MULTI_CORD = { ...SSRG, cord: 'silkBraided' };

describe('catalog data — Shapy Sparkle is silk, Shapy Shine is Shine', () => {
  test('every Shapy Sparkle variant is silk', () => {
    expect(SSRG.cord).toBe('silk');
    expect(SSRD.cord).toBe('silk');
    expect(SSPF.cord).toBe('silk');
  });

  test('Shapy Shine keeps its own Shine thread', () => {
    expect(SSF.cord).toBe('shine');
  });

  test('no collection is left on the ambiguous silk-or-nylon thread', () => {
    expect(COLLECTIONS.filter((c) => c.cord === 'silkBraided')).toEqual([]);
  });
});

describe('getDefaultCordType', () => {
  test('silk collections default to silk', () => {
    expect(getDefaultCordType(SSRG)).toBe('silk');
    expect(getDefaultCordType(SSRD)).toBe('silk');
    expect(getDefaultCordType(SSPF)).toBe('silk');
  });

  test('single-thread collections default to nothing', () => {
    expect(getDefaultCordType(SSF)).toBeNull();
    expect(getDefaultCordType(CUBIX)).toBeNull();
    expect(getDefaultCordType(null)).toBeNull();
  });

  test('a multi-thread collection takes its first option', () => {
    expect(getDefaultCordType(MULTI_CORD)).toBe('braidedNylon');
  });
});

describe('getDefaultThickness', () => {
  test('silk falls back to Thin so MATERIAL is never blank', () => {
    expect(getDefaultThickness(SSRG)).toBe('Thin');
    expect(getDefaultThickness(SSRG, 'silk')).toBe('Thin');
  });

  test('non-silk threads have no thickness', () => {
    expect(getDefaultThickness(SSF)).toBeNull();
    expect(getDefaultThickness(CUBIX)).toBeNull();
    expect(getDefaultThickness(MULTI_CORD, 'braidedNylon')).toBeNull();
  });

  test('Thin-only silk collections still resolve to Thin', () => {
    expect(getDefaultThickness(col('SI1'))).toBe('Thin');
  });
});

describe('material label round-trip', () => {
  test.each([
    ['silk', 'Thin', 'Silk (Thin)'],
    ['silk', 'Thick', 'Silk (Thick)'],
    ['braidedNylon', null, 'Braided Nylon'],
    ['shine', null, 'Shine'],
  ])('%s / %s <-> %s', (cordType, thickness, label) => {
    expect(buildMaterialLabel(cordType, thickness)).toBe(label);
    expect(parseMaterialLabel(label)).toEqual({
      cordType,
      thickness: thickness || '',
    });
  });

  test('an empty material parses to nothing rather than throwing', () => {
    expect(parseMaterialLabel('')).toEqual({ cordType: '', thickness: '' });
    expect(parseMaterialLabel(undefined)).toEqual({ cordType: '', thickness: '' });
    expect(buildMaterialLabel(null, null)).toBe('');
  });

  test('a thickness with no cord type still reads as silk', () => {
    expect(buildMaterialLabel(null, 'Thin')).toBe('Silk (Thin)');
  });
});

describe('cordPaletteFor', () => {
  test('Shapy Sparkle Round uses the silk palette', () => {
    expect(cordPaletteFor(SSRG, null)).toBe(CORD_COLORS.silk);
    expect(cordPaletteFor(SSRG, 'silk')).toBe(CORD_COLORS.silk);
  });

  test('single-thread collections ignore the cord type argument', () => {
    expect(cordPaletteFor(SSF, 'silk')).toBe(CORD_COLORS.shine);
    expect(cordPaletteFor(CUBIX, null)).toBe(CORD_COLORS.nylon);
  });

  test('a multi-thread collection follows the picked thread', () => {
    expect(cordPaletteFor(MULTI_CORD, null)).toBe(CORD_COLORS.braidedNylon);
    expect(cordPaletteFor(MULTI_CORD, 'silk')).toBe(CORD_COLORS.silk);
    // Older configs spelled the braided thread 'braided'.
    expect(cordPaletteFor(MULTI_CORD, 'braided')).toBe(CORD_COLORS.braidedNylon);
  });

  test('allowedColors still caps the palette', () => {
    // Kept in the nylon palette's own order, not the allowedColors order.
    expect(cordPaletteFor(col('HOLY_NECK'), null).map((c) => c.n))
      .toEqual(['Red', 'Black', 'Silver Grey', 'Ivory']);
  });
});

describe('normalizeCordColorName', () => {
  test('re-spells Silver Grey the way the silk palette writes it', () => {
    // The exact bug: a pack row saved as 'Silver Grey' vanished from the order.
    expect(normalizeCordColorName(SSRG, 'silk', 'Silver Grey')).toBe('Silver grey');
    expect(CORD_COLORS.silk.some((c) => c.n === 'Silver grey')).toBe(true);
  });

  test('colours spelled the same on both palettes are untouched', () => {
    expect(normalizeCordColorName(SSRG, 'silk', 'Black')).toBe('Black');
    expect(normalizeCordColorName(SSRG, 'silk', 'Navy Blue')).toBe('Navy Blue');
  });

  test('a colour that exists on neither palette is left alone, not blanked', () => {
    expect(normalizeCordColorName(SSRG, 'silk', 'Turquoise')).toBe('Turquoise');
    expect(normalizeCordColorName(SSRG, 'silk', '')).toBe('');
    expect(normalizeCordColorName(null, null, 'Black')).toBe('Black');
  });
});

describe('pack rows carry the thread through calculateQuote', () => {
  // The three Shapy Sparkle Round rows from Pack Man.
  const line = (extra = {}) => ({
    collectionId: 'SSRG',
    colorConfigs: [
      { id: 'a', caratIdx: 2, colorName: 'Black', size: 'L/XL', shape: 'Round', qty: 1, ...extra },
      { id: 'b', caratIdx: 1, colorName: 'Silver grey', size: 'L/XL', shape: 'Round', qty: 1, ...extra },
      { id: 'c', caratIdx: 0, colorName: 'Navy Blue', size: 'L/XL', shape: 'Round', qty: 1, ...extra },
    ],
  });

  test('silk reaches the order rows as a MATERIAL label', () => {
    const rows = linesToFormRows([line({ cordType: 'silk', thickness: 'Thin' })], { pricelistYear: '2026' });
    expect(rows.map((r) => r.material)).toEqual([
      'Silk (Thin)', 'Silk (Thin)', 'Silk (Thin)',
    ]);
    expect(rows.map((r) => r.colorCord)).toEqual(['Black', 'Silver grey', 'Navy Blue']);
  });

  test('every Shapy Sparkle Round colour survives the quote', () => {
    const quote = calculateQuote([line({ cordType: 'silk', thickness: 'Thin' })], { pricelistYear: '2026' });
    expect(quote.lines.map((l) => l.colorName)).toEqual(['Black', 'Silver grey', 'Navy Blue']);
    expect(quote.lines.map((l) => l.cordType)).toEqual(['silk', 'silk', 'silk']);
    expect(quote.lines.map((l) => l.unitB2B)).toEqual([225, 165, 125]);
  });
});
