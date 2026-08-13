/**
 * @jest-environment node
 *
 * The October 2026 price list is hidden from most agents in the UI only — there
 * is no server-side check on `pricelistYear`. That is safe *because of an
 * invariant*, not by luck: October differs from 2026 only for Moonlight /
 * Sienna / Za-Ha, and those collections are already gated per-agent. So an
 * agent who forged pricelistYear='2026-10' would get byte-identical prices for
 * everything they are allowed to sell, and nothing leaks.
 *
 * This suite pins that invariant. If someone later reprices a publicly visible
 * collection in October, these tests fail — which is the signal that the UI gate
 * is no longer sufficient and the API needs a real check.
 */

import {
  COLLECTIONS,
  ADMIN_ONLY_COLLECTION_IDS,
  calculateQuote,
  getAvailableCarats,
  getPrice,
  getRetail,
} from '../catalog.js';
import { canSeePricelist, getVisibleCollections, getPromptPreviewOptions } from '../collectionAccess.js';
import { buildPricesBlock, buildSystemPrompt } from '../prompt.js';

const OTHER_AGENT = { role: 'agent', email: 'other.agent@example.com' };

// Everything this agent may put on an order.
const sellable = getVisibleCollections(OTHER_AGENT);

describe('the October list is invisible to an agent who cannot sell what it reprices', () => {
  test('the agent is indeed denied the October list', () => {
    expect(canSeePricelist('2026-10', OTHER_AGENT)).toBe(false);
  });

  test('every collection repriced in October is one the agent cannot sell', () => {
    const repriced = COLLECTIONS.filter((c) => c.prices['2026-10'] || c.retail['2026-10']);
    expect(repriced.length).toBeGreaterThan(0);
    const leaked = repriced
      .filter((c) => sellable.some((s) => s.id === c.id))
      .map((c) => c.id);
    expect(leaked).toEqual([]);
    for (const c of repriced) {
      expect(`${c.id} is preview-only: ${ADMIN_ONLY_COLLECTION_IDS.has(c.id)}`)
        .toBe(`${c.id} is preview-only: true`);
    }
  });

  test('every sellable collection prices identically on 2026 and October', () => {
    const differing = [];
    for (const c of sellable) {
      for (const cert of ['igi', 'inhouse']) {
        for (let i = 0; i < c.carats.length; i += 1) {
          const a = [getPrice(c, i, cert, '2026'), getRetail(c, i, cert, '2026')];
          const b = [getPrice(c, i, cert, '2026-10'), getRetail(c, i, cert, '2026-10')];
          if (a[0] !== b[0] || a[1] !== b[1]) {
            differing.push(`${c.id} ${c.carats[i]} ct ${cert}: ${a} vs ${b}`);
          }
        }
      }
    }
    expect(differing).toEqual([]);
  });

  test('every sellable collection offers the same sizes on 2026 and October', () => {
    for (const c of sellable) {
      expect(`${c.id}: ${getAvailableCarats(c, '2026-10').map((o) => o.carat)}`)
        .toBe(`${c.id}: ${getAvailableCarats(c, '2026').map((o) => o.carat)}`);
    }
  });

  test('a forged October year quotes the same total as 2026', () => {
    const lines = sellable.map((c) => ({
      collectionId: c.id,
      colorConfigs: [{ caratIdx: 0, qty: 2, certType: 'igi', colorName: 'Black' }],
    }));
    const y26 = calculateQuote(lines, { pricelistYear: '2026' });
    const oct = calculateQuote(lines, { pricelistYear: '2026-10' });
    expect(oct.subtotal).toBe(y26.subtotal);
    expect(oct.totalRetail).toBe(y26.totalRetail);
    expect(oct.warnings).toEqual(y26.warnings);
  });

  test("the AI advisor's price table is identical on both lists for this agent", () => {
    const opts = getPromptPreviewOptions(OTHER_AGENT);
    expect(buildPricesBlock('2026-10', opts)).toBe(buildPricesBlock('2026', opts));
    expect(buildSystemPrompt('2026-10', opts)).toBe(buildSystemPrompt('2026', opts));
  });

  test('an admin, by contrast, does see a difference (proves the checks bite)', () => {
    const adminOpts = getPromptPreviewOptions({ role: 'admin' });
    expect(buildPricesBlock('2026-10', adminOpts)).not.toBe(buildPricesBlock('2026', adminOpts));
  });
});
