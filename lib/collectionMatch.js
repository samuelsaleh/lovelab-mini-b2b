/**
 * Match a free-text collection name from a saved order row back to the live
 * catalogue (lib/catalog.js).
 *
 * Order rows store whatever was in the "Collection" cell at save time, so a
 * renamed or hand-typed collection stops matching. Anything that fails to
 * match is invisible in Top Products and Quick Stats — the audit script counts
 * those misses so the gap is measurable instead of silent.
 *
 * Two strictnesses, matching the two dashboard panels:
 *   - isKnownCollection: exact label/id only (Quick Stats)
 *   - matchCollectionLabel: exact, then substring (Top Products)
 */

import { COLLECTIONS } from './catalog.js';

function upper(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

// Old catalogue names that still appear on saved quotes / packs / analytics
// rows after a rename. Key is the historical string; value is the live id.
export const COLLECTION_ALIASES = {
  'SHAPY SPARKLE RND D VVS': 'SSRD',
  'SHAPY SPARKLE ROUND(D VVS)': 'SSRD',
}

function collectionFromAlias(u) {
  const id = COLLECTION_ALIASES[u]
  return id ? COLLECTIONS.find((c) => c.id === id) || null : null
}

/** Exact (case-insensitive) match on a collection label, id, or old alias. */
export function exactCollection(name) {
  const u = upper(name);
  if (!u) return null;
  const alias = collectionFromAlias(u)
  if (alias) return alias
  return COLLECTIONS.find((c) => upper(c.label) === u || upper(c.id) === u) || null;
}

/**
 * Quick Stats gate: does this row name a catalogue collection exactly?
 * Rows that fail are dropped from the carat / shape / size / cord tallies.
 */
export function isKnownCollection(name) {
  return exactCollection(name) !== null;
}

/**
 * Top Products gate: exact match first, then a substring match so
 * "MULTI THREE 0.30ct" still rolls up under "MULTI THREE".
 *
 * The substring pass walks COLLECTIONS in catalogue order and takes the
 * LONGEST match rather than the first, so "SHAPY SPARKLE FANCY 0.70" cannot be
 * captured by a shorter overlapping label.
 *
 * @returns {string|null} the canonical collection label, or null when unknown
 */
export function matchCollectionLabel(name) {
  const exact = exactCollection(name);
  if (exact) return exact.label;

  const u = upper(name);
  if (!u) return null;

  let best = null;
  let bestLen = 0;
  for (const c of COLLECTIONS) {
    for (const candidate of [upper(c.label), upper(c.id)]) {
      if (candidate && u.includes(candidate) && candidate.length > bestLen) {
        best = c.label;
        bestLen = candidate.length;
      }
    }
  }
  for (const [alias, id] of Object.entries(COLLECTION_ALIASES)) {
    if (u.includes(alias) && alias.length > bestLen) {
      const c = COLLECTIONS.find((x) => x.id === id)
      if (c) {
        best = c.label
        bestLen = alias.length
      }
    }
  }
  return best;
}
