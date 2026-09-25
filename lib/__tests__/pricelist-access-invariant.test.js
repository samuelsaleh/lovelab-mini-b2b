/**
 * @jest-environment node
 *
 * October 2026 is the current / default price list — everyone can see it.
 * The older 2025 and 2026 lists are legacy-only (Alberto / Dionne). This suite
 * still pins the catalog invariant behind October: every collection that
 * carries a 2026-10 bucket must be one the October audience can actually sell
 * (admin-only or Iconix grant), so the list never "secretly" changes a legacy SKU.
 */

import {
  COLLECTIONS,
  ADMIN_ONLY_COLLECTION_IDS,
  calculateQuote,
  getPrice,
  getRetail,
} from '../catalog.js';
import {
  canSeePricelist,
  getVisibleCollections,
  getPromptPreviewOptions,
  ICONIX_PREVIEW_COLLECTION_IDS,
  MOONLIGHT_SIENNA_ZAHA_IDS,
} from '../collectionAccess.js';
import { buildPricesBlock, buildSystemPrompt } from '../prompt.js';

const OTHER_AGENT = { role: 'agent', email: 'other.agent@example.com' };
const PIOTR = { role: 'agent', email: 'piotr.kicinski84@gmail.com' };

describe('October list audience follows the collections it reprices', () => {
  test('everyone sees October, including unsigned surfaces', () => {
    expect(canSeePricelist('2026-10', OTHER_AGENT)).toBe(true);
    expect(canSeePricelist('2026-10', PIOTR)).toBe(true);
    expect(canSeePricelist('2026-10', { role: 'admin' })).toBe(true);
    expect(canSeePricelist('2026-10', null)).toBe(true);
    expect(canSeePricelist('2026-10', undefined)).toBe(true);
  });

  test('every collection repriced in October is admin-preview (or Iconix grant)', () => {
    const repriced = COLLECTIONS.filter((c) => c.prices['2026-10'] || c.retail['2026-10']);
    expect(repriced.length).toBeGreaterThan(0);
    for (const c of repriced) {
      expect(`${c.id} is preview-gated: ${ADMIN_ONLY_COLLECTION_IDS.has(c.id)}`)
        .toBe(`${c.id} is preview-gated: true`);
    }
  });

  test('a regular agent sees Iconix October prices differ from 2026', () => {
    const sellable = getVisibleCollections(OTHER_AGENT);
    const iconix = sellable.filter((c) => ICONIX_PREVIEW_COLLECTION_IDS.has(c.id));
    expect(iconix.length).toBe(ICONIX_PREVIEW_COLLECTION_IDS.size);
    const differing = [];
    for (const c of iconix) {
      for (let i = 0; i < c.carats.length; i += 1) {
        const a = getPrice(c, i, 'igi', '2026');
        const b = getPrice(c, i, 'igi', '2026-10');
        if (a !== b) differing.push(`${c.id} ${c.carats[i]}`);
      }
    }
    expect(differing.length).toBeGreaterThan(0);
  });

  test('a regular agent still cannot sell Moonlight / Sienna / Za-Ha', () => {
    const sellableIds = getVisibleCollections(OTHER_AGENT).map((c) => c.id);
    for (const id of MOONLIGHT_SIENNA_ZAHA_IDS) {
      expect(sellableIds).not.toContain(id);
    }
  });

  test('Piotr can sell Moonlight and quotes its October price', () => {
    const sellableIds = getVisibleCollections(PIOTR).map((c) => c.id);
    expect(sellableIds).toContain('MFM');
    const q = calculateQuote(
      [{ collectionId: 'MFM', colorConfigs: [{ caratIdx: 1, qty: 1, certType: 'igi', colorName: 'Black' }] }],
      { pricelistYear: '2026-10' },
    );
    expect(q.subtotal).toBe(90); // Original Moonlight 0.20 Oct B2B
  });

  test("a regular agent's AI price table differs on October only for Iconix", () => {
    const opts = getPromptPreviewOptions(OTHER_AGENT);
    const y26 = buildPricesBlock('2026', opts);
    const oct = buildPricesBlock('2026-10', opts);
    expect(oct).not.toBe(y26);
    expect(oct).toContain('Flower Heart');
    expect(oct).toContain('0.40=€170/€510');
    expect(oct).not.toContain('Original Moonlight');
  });

  test('an admin sees Moonlight + Iconix differences on October', () => {
    const adminOpts = getPromptPreviewOptions({ role: 'admin' });
    expect(buildPricesBlock('2026-10', adminOpts)).not.toBe(buildPricesBlock('2026', adminOpts));
    expect(buildSystemPrompt('2026-10', adminOpts)).toContain('Original Moonlight');
  });
});
