/**
 * Unit tests for lib/catalog.js — calculateQuote
 *
 * All numeric expectations below pin the 2026 pricelist (the current default).
 * Per the pricelist toggle plan, every assertion now passes '2026' explicitly
 * so the meaning is obvious and so a future change to DEFAULT_PRICELIST can't
 * silently break this file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateQuote, COLLECTIONS, getPrice, getDefaultCert } from '../../lib/catalog.js';

const Y = '2026';
const CUTY = COLLECTIONS.find(c => c.id === 'CUTY');
const M3   = COLLECTIONS.find(c => c.id === 'M3');

// Sanity ground-truth pulled live from the catalog so a future re-pricing
// updates these tests in lockstep with the catalog.
const CUTY_PRICE_2026 = [0, 1, 2, 3].map(i => getPrice(CUTY, i, getDefaultCert(CUTY), Y));
// → [30, 40, 70, 100] in 2026
const M3_PRICE_2026 = [0, 1, 2, 3].map(i => getPrice(M3, i, getDefaultCert(M3), Y));
// → [65, 95, 175, 250] in 2026

function makeLine(collectionId, configs) {
  return { collectionId, colorConfigs: configs };
}

function makeConfig(overrides = {}) {
  return {
    id: 'cfg-1', colorName: 'White', caratIdx: 1,
    housing: 'Yellow', housingType: null, multiAttached: null,
    shape: null, size: 'M', cordType: null, thickness: null,
    qty: 1, priceOverride: null, ...overrides,
  };
}

// ─── calculateQuote ──────────────────────────────────────────────────────────

test('returns zero totals for empty lines array', () => {
  const r = calculateQuote([], { pricelistYear: Y });
  assert.equal(r.total, 0);
  assert.equal(r.lines.length, 0);
  assert.equal(r.warnings.length, 0);
});

test('returns zero totals when lines have no collectionId', () => {
  const r = calculateQuote([{ collectionId: null, colorConfigs: [] }], { pricelistYear: Y });
  assert.equal(r.total, 0);
});

test('returns zero totals when lines have no colorConfigs', () => {
  const r = calculateQuote([makeLine('CUTY', [])], { pricelistYear: Y });
  assert.equal(r.total, 0);
});

test('skips configs with null caratIdx — does not inflate total', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: null })])], { pricelistYear: Y });
  assert.equal(r.total, 0);
  assert.equal(r.lines.length, 0);
});

test('skips configs with undefined caratIdx', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: undefined })])], { pricelistYear: Y });
  assert.equal(r.total, 0);
});

test('correct total for single config (CUTY caratIdx=1 IGI 2026 → €40)', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: 1, qty: 1 })])], { pricelistYear: Y });
  assert.equal(r.total, CUTY_PRICE_2026[1]); // 40
  assert.equal(r.lines[0].unitB2B, CUTY_PRICE_2026[1]);
});

test('multiplies by qty correctly', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: 0, qty: 5 })])], { pricelistYear: Y });
  assert.equal(r.total, CUTY_PRICE_2026[0] * 5); // 30 × 5
});

test('respects priceOverride when set', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: 1, qty: 2, priceOverride: 10 })])], { pricelistYear: Y });
  assert.equal(r.total, 20); // 10 × 2, ignoring catalog price
  assert.equal(r.lines[0].unitOverride, 10);
});

test('uses catalog price when priceOverride is null', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: 1, qty: 1, priceOverride: null })])], { pricelistYear: Y });
  assert.equal(r.total, CUTY_PRICE_2026[1]);
  assert.equal(r.lines[0].unitOverride, null);
});

test('clamps out-of-range caratIdx and adds a warning', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: 99, qty: 1 })])], { pricelistYear: Y });
  assert.equal(r.total, CUTY_PRICE_2026[3]); // clamped to last index
  assert.ok(r.warnings.length > 0);
  assert.ok(r.warnings[0].includes('out of range'));
});

test('sums multiple configs in the same line', () => {
  const r = calculateQuote([makeLine('CUTY', [
    makeConfig({ id: 'a', caratIdx: 0, qty: 1 }),
    makeConfig({ id: 'b', caratIdx: 1, qty: 2 }),
  ])], { pricelistYear: Y });
  assert.equal(r.total, CUTY_PRICE_2026[0] * 1 + CUTY_PRICE_2026[1] * 2); // 30 + 80 = 110
});

test('sums across multiple lines', () => {
  const r = calculateQuote([
    makeLine('CUTY', [makeConfig({ caratIdx: 0, qty: 1 })]),
    makeLine('M3',   [makeConfig({ caratIdx: 0, qty: 1 })]),
  ], { pricelistYear: Y });
  assert.equal(r.total, CUTY_PRICE_2026[0] + M3_PRICE_2026[0]); // 30 + 65 = 95
});

test('totalPieces is the sum of qty across all configs', () => {
  const r = calculateQuote([makeLine('CUTY', [
    makeConfig({ id: 'a', caratIdx: 0, qty: 3 }),
    makeConfig({ id: 'b', caratIdx: 1, qty: 2 }),
  ])], { pricelistYear: Y });
  assert.equal(r.totalPieces, 5);
});

test('null-carat configs are excluded when mixed with valid ones', () => {
  const r = calculateQuote([makeLine('CUTY', [
    makeConfig({ id: 'a', caratIdx: null }),
    makeConfig({ id: 'b', caratIdx: 0, qty: 1 }),
  ])], { pricelistYear: Y });
  assert.equal(r.total, CUTY_PRICE_2026[0]);
  assert.equal(r.lines.length, 1);
});

// ─── Pricelist year switching (canary for the 2025/2026 toggle) ─────────────

test('omitting opts.pricelistYear defaults to 2026', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: 3, qty: 1 })])]);
  assert.equal(r.pricelistYear, '2026');
  assert.equal(r.total, 100); // CUTY 0.30 IGI 2026
});

test('explicit pricelistYear="2025" produces the 2025 numbers', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: 3, qty: 1 })])], { pricelistYear: '2025' });
  assert.equal(r.pricelistYear, '2025');
  assert.equal(r.total, 90); // CUTY 0.30 IGI 2025
});

// ─── computePackTotal logic (re-implemented to match BuilderPage) ───────────
// The BuilderPage helper uses the year-aware getPrice() now. We mirror that
// here so the test asserts the same shape the production code expects.

function computePackTotal(pack, pricelistYear = Y) {
  return pack.lines.reduce((sum, line) => {
    const col = COLLECTIONS.find(c => c.id === line.collectionId);
    if (!col) return sum;
    const colorCount = line.colorCount;
    const minQty = col.minC || 1;
    const cert = getDefaultCert(col);
    const lineTotal = line.caratIndices.reduce((s, ci) => s + getPrice(col, ci, cert, pricelistYear), 0);
    return sum + lineTotal * colorCount * minQty;
  }, 0);
}

test('computePackTotal returns 0 for unknown collection', () => {
  assert.equal(computePackTotal({ lines: [{ collectionId: 'UNKNOWN', colorCount: 5, caratIndices: [0] }] }), 0);
});

test('computePackTotal returns 0 for empty lines', () => {
  assert.equal(computePackTotal({ lines: [] }), 0);
});

test('computePackTotal multiplies by minC for M3 (minC=2) — 2026 numbers', () => {
  // M3 2026 IGI [0]=65, colorCount=3, minC=2 → 65 × 3 × 2 = 390
  assert.equal(
    computePackTotal({ lines: [{ collectionId: 'M3', colorCount: 3, caratIndices: [0] }] }),
    M3_PRICE_2026[0] * 3 * 2,
  );
});

test('computePackTotal uses minC=3 for CUTY — 2026 numbers', () => {
  // CUTY 2026 IGI [1]=40, colorCount=2, minC=3 → 40 × 2 × 3 = 240
  assert.equal(
    computePackTotal({ lines: [{ collectionId: 'CUTY', colorCount: 2, caratIndices: [1] }] }),
    CUTY_PRICE_2026[1] * 2 * 3,
  );
});

test('computePackTotal sums multiple caratIndices', () => {
  // CUTY 2026 IGI (30 + 40) × 2 × 3 = 420
  assert.equal(
    computePackTotal({ lines: [{ collectionId: 'CUTY', colorCount: 2, caratIndices: [0, 1] }] }),
    (CUTY_PRICE_2026[0] + CUTY_PRICE_2026[1]) * 2 * 3,
  );
});

test('computePackTotal sums across multiple lines', () => {
  // CUTY 2026: 40 × 1 × 3 = 120 + M3 2026: 65 × 1 × 2 = 130 → 250
  assert.equal(
    computePackTotal({ lines: [
      { collectionId: 'CUTY', colorCount: 1, caratIndices: [1] },
      { collectionId: 'M3',   colorCount: 1, caratIndices: [0] },
    ] }),
    CUTY_PRICE_2026[1] * 1 * 3 + M3_PRICE_2026[0] * 1 * 2,
  );
});

test('computePackTotal switches numbers when given pricelistYear="2025"', () => {
  // CUTY 0.30 IGI: 2025=€90, 2026=€100. With colorCount=1 and minC=3:
  // 2025 → 270, 2026 → 300.
  const pack = { lines: [{ collectionId: 'CUTY', colorCount: 1, caratIndices: [3] }] };
  assert.equal(computePackTotal(pack, '2025'), 270);
  assert.equal(computePackTotal(pack, '2026'), 300);
});
