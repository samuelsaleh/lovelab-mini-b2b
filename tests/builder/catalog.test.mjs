/**
 * Unit tests for lib/catalog.js — calculateQuote
 *
 * Covers:
 *   - Empty input, null-carat skipping, priceOverride
 *   - Out-of-range caratIdx clamping and warnings
 *   - Multi-line / multi-config summing
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateQuote, COLLECTIONS } from '../../lib/catalog.js';

const CUTY = COLLECTIONS.find(c => c.id === 'CUTY');
const M3   = COLLECTIONS.find(c => c.id === 'M3');

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
  const r = calculateQuote([]);
  assert.equal(r.total, 0);
  assert.equal(r.lines.length, 0);
  assert.equal(r.warnings.length, 0);
});

test('returns zero totals when lines have no collectionId', () => {
  const r = calculateQuote([{ collectionId: null, colorConfigs: [] }]);
  assert.equal(r.total, 0);
});

test('returns zero totals when lines have no colorConfigs', () => {
  const r = calculateQuote([makeLine('CUTY', [])]);
  assert.equal(r.total, 0);
});

test('skips configs with null caratIdx — does not inflate total', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: null })])]);
  assert.equal(r.total, 0);
  assert.equal(r.lines.length, 0);
});

test('skips configs with undefined caratIdx', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: undefined })])]);
  assert.equal(r.total, 0);
});

test('correct total for single config (CUTY idx=1 → €30)', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: 1, qty: 1 })])]);
  assert.equal(r.total, 30);
  assert.equal(r.lines[0].unitB2B, 30);
});

test('multiplies by qty correctly', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: 0, qty: 5 })])]);
  assert.equal(r.total, 100); // 20 * 5
});

test('respects priceOverride when set', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: 1, qty: 2, priceOverride: 10 })])]);
  assert.equal(r.total, 20); // 10 * 2, not 30 * 2
  assert.equal(r.lines[0].unitOverride, 10);
});

test('uses catalog price when priceOverride is null', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: 1, qty: 1, priceOverride: null })])]);
  assert.equal(r.total, 30);
  assert.equal(r.lines[0].unitOverride, null);
});

test('clamps out-of-range caratIdx and adds a warning', () => {
  const r = calculateQuote([makeLine('CUTY', [makeConfig({ caratIdx: 99, qty: 1 })])]);
  assert.equal(r.total, 90); // clamped to last index → price 90
  assert.ok(r.warnings.length > 0);
  assert.ok(r.warnings[0].includes('out of range'));
});

test('sums multiple configs in the same line', () => {
  const r = calculateQuote([makeLine('CUTY', [
    makeConfig({ id: 'a', caratIdx: 0, qty: 1 }),
    makeConfig({ id: 'b', caratIdx: 1, qty: 2 }),
  ])]);
  assert.equal(r.total, 80); // 20 + 60
});

test('sums across multiple lines', () => {
  const r = calculateQuote([
    makeLine('CUTY', [makeConfig({ caratIdx: 0, qty: 1 })]),
    makeLine('M3',   [makeConfig({ caratIdx: 0, qty: 1 })]),
  ]);
  assert.equal(r.total, 75); // 20 + 55
});

test('totalPieces is the sum of qty across all configs', () => {
  const r = calculateQuote([makeLine('CUTY', [
    makeConfig({ id: 'a', caratIdx: 0, qty: 3 }),
    makeConfig({ id: 'b', caratIdx: 1, qty: 2 }),
  ])]);
  assert.equal(r.totalPieces, 5);
});

test('null-carat configs are excluded when mixed with valid ones', () => {
  const r = calculateQuote([makeLine('CUTY', [
    makeConfig({ id: 'a', caratIdx: null }),
    makeConfig({ id: 'b', caratIdx: 0, qty: 1 }),
  ])]);
  assert.equal(r.total, 20);
  assert.equal(r.lines.length, 1);
});

// ─── computePackTotal logic (re-implemented to match fixed code) ─────────────

function computePackTotal(pack) {
  return pack.lines.reduce((sum, line) => {
    const col = COLLECTIONS.find(c => c.id === line.collectionId);
    if (!col) return sum;
    const colorCount = line.colorCount;
    const minQty = col.minC || 1;
    const lineTotal = line.caratIndices.reduce((s, ci) => s + (col.prices[ci] || 0), 0);
    return sum + lineTotal * colorCount * minQty;
  }, 0);
}

test('computePackTotal returns 0 for unknown collection', () => {
  assert.equal(computePackTotal({ lines: [{ collectionId: 'UNKNOWN', colorCount: 5, caratIndices: [0] }] }), 0);
});

test('computePackTotal returns 0 for empty lines', () => {
  assert.equal(computePackTotal({ lines: [] }), 0);
});

test('computePackTotal multiplies by minC for M3 (minC=2)', () => {
  // M3 price[0]=55, colorCount=3, minC=2 → 55*3*2=330
  assert.equal(computePackTotal({ lines: [{ collectionId: 'M3', colorCount: 3, caratIndices: [0] }] }), 330);
});

test('computePackTotal uses minC=1 for CUTY', () => {
  // CUTY price[1]=30, colorCount=2, minC=1 → 30*2*1=60
  assert.equal(computePackTotal({ lines: [{ collectionId: 'CUTY', colorCount: 2, caratIndices: [1] }] }), 60);
});

test('computePackTotal sums multiple caratIndices', () => {
  // CUTY (20+30)*2*1 = 100
  assert.equal(computePackTotal({ lines: [{ collectionId: 'CUTY', colorCount: 2, caratIndices: [0, 1] }] }), 100);
});

test('computePackTotal sums across multiple lines', () => {
  // CUTY: 30*1*1=30 + M3: 55*1*2=110 = 140
  assert.equal(computePackTotal({ lines: [
    { collectionId: 'CUTY', colorCount: 1, caratIndices: [1] },
    { collectionId: 'M3',   colorCount: 1, caratIndices: [0] },
  ] }), 140);
});
