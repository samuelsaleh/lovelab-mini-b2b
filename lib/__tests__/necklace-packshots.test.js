/**
 * @jest-environment node
 *
 * Ensures supplied dedicated necklace images win over bracelet aliases, while
 * retaining the approved temporary fallbacks for missing necklace imagery.
 */

const fs = require('fs');
const path = require('path');
const manifest = require('../packshot-manifest.json');
const { findPackshot } = require('../packshot-lookup.js');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

function publicPath(url) {
  return path.join(PUBLIC_DIR, decodeURIComponent(url).replace(/^\//, ''));
}

describe('necklace packshots', () => {
  test.each([
    ['CUTY_NECK', { color: 'Black', housing: 'White' }],
    ['CUBIX_NECK', { color: 'Black', housing: 'Yellow' }],
    ['M3_NECK', { color: 'Gold', housing: 'Yellow' }],
    ['M4_NECK', { color: 'Red', housing: 'White' }],
    ['M5_NECK', { color: 'Gold', housing: 'Rose' }],
    ['MF_NECK', { color: 'Black', housing: 'Yellow', shape: 'Heart', subgroup: 'Bezel' }],
    ['SSF_NECK', { color: 'Black', housing: 'Yellow', shape: 'Emerald', subgroup: 'Bezel' }],
  ])('%s resolves to a supplied necklace asset', (id, options) => {
    const url = findPackshot(id, options);
    expect(url).toContain('/Packshot%20Folder/Necklaces/');
    expect(fs.existsSync(publicPath(url))).toBe(true);
  });

  it('indexes every dedicated necklace collection in the manifest', () => {
    for (const id of ['CUTY_NECK', 'CUBIX_NECK', 'M3_NECK', 'M4_NECK', 'M5_NECK', 'MF_NECK', 'SSF_NECK']) {
      expect(manifest[id]?.length).toBeGreaterThan(0);
    }
  });

  it('uses Long Cushion yellow-gold necklace imagery for Cushion, including white gold', () => {
    const url = findPackshot('SSF_NECK', {
      color: 'Black',
      housing: 'White',
      shape: 'Cushion',
      subgroup: 'Bezel',
    });
    expect(url).toContain('/Necklaces/shapyshine_necks/long_cushion/Yellow%20Gold/')
    expect(url).toContain('Black_yellow_gold_')
    expect(fs.existsSync(publicPath(url))).toBe(true);
  });

  it('uses yellow-gold necklace imagery when a Shapey Shine white-gold variant is unavailable', () => {
    const url = findPackshot('SSF_NECK', {
      color: 'Black',
      housing: 'White',
      shape: 'Emerald',
      subgroup: 'Bezel',
    });
    expect(url).toContain('/Necklaces/shapyshine_necks/Emerald/YG/')
    expect(url).toContain('Black_yellow_gold_')
  });

  it('keeps bracelet fallback images for necklaces without supplied assets', () => {
    expect(findPackshot('SSPF_NECK', { color: 'Black', shape: 'Round' }))
      .toEqual(findPackshot('SSPF', { color: 'Black', shape: 'Round' }));
    expect(findPackshot('HOLY_NECK', { color: 'Red' }))
      .toEqual(findPackshot('HOLY', { color: 'Red' }));
  });

  it('only contains URLs that resolve to a public asset', () => {
    for (const images of Object.values(manifest)) {
      for (const image of images) {
        expect(fs.existsSync(publicPath(image.url))).toBe(true);
      }
    }
  });
});
