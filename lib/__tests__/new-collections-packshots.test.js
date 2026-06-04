/**
 * @jest-environment node
 *
 * Guarantee 2 — every picture is in the right place.
 *
 * For the 15 new collections this asserts:
 *  - every (housing tile x allowed cord color) resolves via findPackshot to a
 *    NON-null url whose manifest entry has the EXACT housing AND EXACT color
 *    (no silently-wrong finish/color fallback),
 *  - shiny vs matte tiles never collapse onto each other,
 *  - every url in the manifest actually exists on disk,
 *  - Sienna One (SI1) has no images yet -> findPackshot returns null.
 */

import fs from 'fs';
import path from 'path';
import manifest from '../packshot-manifest.json';
import { findPackshot } from '../packshot-lookup.js';
import { COLLECTIONS, HOUSING } from '../catalog.js';

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

const COMBINED_HOUSING = new Set(['metalEight', 'metalThree']);

function col(id) {
  const c = COLLECTIONS.find((x) => x.id === id);
  if (!c) throw new Error(`No collection ${id}`);
  return c;
}

// New collections that have housing combined tiles.
const NEW_COLS = COLLECTIONS.filter((c) => COMBINED_HOUSING.has(c.housing));

// Resolve a manifest url back to disk and confirm the file is present.
function urlExistsOnDisk(url) {
  const rel = url.replace(/^\//, '').split('/').map(decodeURIComponent).join(path.sep);
  return fs.existsSync(path.join(PUBLIC_DIR, rel));
}

// Find the manifest entry that a url points to (so we can assert exact match).
function entryForUrl(id, url) {
  return (manifest[id] || []).find((e) => e.url === url) || null;
}

describe('new collections — packshot coverage', () => {
  test('sanity: the 15 new collections are present in the catalog', () => {
    expect(NEW_COLS.map((c) => c.id).sort()).toEqual(
      ['LIN3', 'LIN5', 'LUMA', 'LUVA', 'MFM', 'MNH', 'MNO', 'RIV4', 'RIV8', 'SI1', 'SI2P', 'SI3', 'SI4', 'SI5', 'ZAHA'].sort()
    );
  });

  test('Sienna One (SI1) has no images yet -> findPackshot returns null', () => {
    expect(manifest.SI1).toBeUndefined();
    expect(findPackshot('SI1', { housing: 'Yellow Gold', color: 'Gold' })).toBeNull();
  });

  describe.each(NEW_COLS.filter((c) => c.id !== 'SI1').map((c) => [c.id]))('%s', (id) => {
    const c = col(id);
    const tiles = HOUSING[c.housing];
    const colors = c.allowedColors;

    test(`manifest exists with the expected housing tiles`, () => {
      const housings = [...new Set((manifest[id] || []).map((e) => e.housing))].sort();
      expect(housings).toEqual([...tiles].sort());
    });

    test.each(
      tiles.flatMap((h) => colors.map((color) => [h, color]))
    )(`housing=%s color=%s resolves to an exact, on-disk image`, (housing, color) => {
      const url = findPackshot(id, { housing, color });
      expect(`${id} ${housing}/${color} url`).not.toBe(`${id} ${housing}/${color} null`);
      expect(url).toBeTruthy();

      const entry = entryForUrl(id, url);
      expect(entry).toBeTruthy();
      // Exact housing — shiny vs matte must never alias.
      expect(`${id} ${housing}/${color} -> housing ${entry.housing}`)
        .toBe(`${id} ${housing}/${color} -> housing ${housing}`);
      // Exact color — no wrong-color fallback.
      expect(`${id} ${housing}/${color} -> color ${entry.color}`)
        .toBe(`${id} ${housing}/${color} -> color ${color}`);
      // File present on disk.
      expect(`${id} ${housing}/${color} on disk: ${urlExistsOnDisk(url)}`)
        .toBe(`${id} ${housing}/${color} on disk: true`);
    });
  });

  test('every manifest url for new collections exists on disk', () => {
    const missing = [];
    for (const c of NEW_COLS) {
      for (const e of manifest[c.id] || []) {
        if (!urlExistsOnDisk(e.url)) missing.push(`${c.id}: ${e.url}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
