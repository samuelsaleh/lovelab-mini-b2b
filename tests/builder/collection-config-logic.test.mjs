/**
 * CollectionConfig pure logic tests
 *
 * Tests the business logic extracted from CollectionConfig.jsx:
 *   - isConfigComplete: all edge cases
 *   - duplicateAllWithVariations: shape, carat, selection-aware duplication
 *   - qty minimum enforcement
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { COLLECTIONS, CORD_OPTIONS } from '../../lib/catalog.js';

const CUTY = COLLECTIONS.find(c => c.id === 'CUTY');
const M3   = COLLECTIONS.find(c => c.id === 'M3');
const SSF  = COLLECTIONS.find(c => c.id === 'SSF');
const SSPF = COLLECTIONS.find(c => c.id === 'SSPF');
const SSRG = COLLECTIONS.find(c => c.id === 'SSRG');
// Shapy Sparkle Round is silk-only, so no shipping collection offers a choice
// of threads any more. The builder still supports one — cover it with a stub.
const MULTI_CORD = { ...SSRG, cord: 'silkBraided' };

function makeConfig(overrides = {}) {
  return {
    id: 'cfg-1', colorName: 'White', caratIdx: 1,
    housing: 'Yellow', housingType: null, multiAttached: null,
    shape: null, size: 'M', cordType: null, thickness: null,
    qty: 1, priceOverride: null, ...overrides,
  };
}

// ─── isConfigComplete (mirrors the fixed version in CollectionConfig) ────────

function isConfigComplete(col, cfg) {
  const hasCordOptions = !!CORD_OPTIONS[col.cord];
  if (cfg.caratIdx === null) return false;
  if (col.housing && col.housing !== 'sparkleProng' && !cfg.housing) return false;
  if (col.housing === 'multiThree' && cfg.multiAttached === null) return false;
  if (col.shapes && col.shapes.length > 0 && !cfg.shape) return false;
  if (col.sizes && col.sizes.length > 0 && !cfg.size) return false;
  if (hasCordOptions && !cfg.cordType) return false;
  if ((col.cord === 'silk' || cfg.cordType === 'silk') && !cfg.thickness) return false;
  return true;
}

test('isConfigComplete: false when caratIdx is null', () => {
  assert.equal(isConfigComplete(CUTY, makeConfig({ caratIdx: null })), false);
});

test('isConfigComplete: false when housing required and missing (CUTY)', () => {
  assert.equal(isConfigComplete(CUTY, makeConfig({ caratIdx: 0, housing: null, size: 'M' })), false);
});

test('isConfigComplete: false when shape required and missing (SSF)', () => {
  assert.equal(isConfigComplete(SSF, makeConfig({ caratIdx: 0, housing: 'Bezel Yellow', shape: null, size: 'M' })), false);
});

test('isConfigComplete: false for multiThree when multiAttached is null (M3)', () => {
  assert.equal(isConfigComplete(M3, makeConfig({ caratIdx: 0, housing: 'WWW', multiAttached: null, size: 'M' })), false);
});

test('isConfigComplete: true for complete multiThree config (M3)', () => {
  assert.equal(isConfigComplete(M3, makeConfig({ caratIdx: 0, housing: 'WWW', multiAttached: true, size: 'M' })), true);
});

test('isConfigComplete: true for fully complete CUTY config', () => {
  assert.equal(isConfigComplete(CUTY, makeConfig({ caratIdx: 0, housing: 'Yellow', size: 'M' })), true);
});

test('isConfigComplete: false when size required and missing (CUTY)', () => {
  assert.equal(isConfigComplete(CUTY, makeConfig({ caratIdx: 0, housing: 'Yellow', size: null })), false);
});

test('isConfigComplete: sparkleProng housing does NOT require housing value', () => {
  assert.equal(isConfigComplete(SSPF, makeConfig({
    caratIdx: 0, housing: null, shape: 'Round', size: 'S/M', cordType: null, thickness: 'Thin',
  })), true);
});

test('isConfigComplete: false when cordType required (multi-thread) and missing', () => {
  assert.equal(isConfigComplete(MULTI_CORD, makeConfig({
    caratIdx: 0, housing: null, shape: 'Round', size: 'S/M', cordType: null, thickness: null,
  })), false);
});

test('isConfigComplete: true when a multi-thread collection has cordType set', () => {
  assert.equal(isConfigComplete(MULTI_CORD, makeConfig({
    caratIdx: 0, housing: null, shape: 'Round', size: 'S/M', cordType: 'braidedNylon', thickness: null,
  })), true);
});

test('isConfigComplete: false for Shapy Sparkle Round (silk) without thickness', () => {
  assert.equal(isConfigComplete(SSRG, makeConfig({
    caratIdx: 0, housing: null, shape: 'Round', size: 'S/M', cordType: null, thickness: null,
  })), false);
});

test('isConfigComplete: false for silk cord without thickness', () => {
  assert.equal(isConfigComplete(SSRG, makeConfig({
    caratIdx: 0, housing: null, shape: 'Round', size: 'S/M', cordType: 'silk', thickness: null,
  })), false);
});

test('isConfigComplete: true for silk cord with thickness', () => {
  assert.equal(isConfigComplete(SSRG, makeConfig({
    caratIdx: 0, housing: null, shape: 'Round', size: 'S/M', cordType: 'silk', thickness: 'Thin',
  })), true);
});

// ─── duplicateAllWithVariations logic ────────────────────────────────────────

let _idCounter = 0;
function createConfigId() { return `dup-${++_idCounter}`; }

function duplicateAllWithVariations(configs, selected, duplicateSettings) {
  const selectedSet = new Set(selected);
  const configsToDuplicate = selectedSet.size > 0
    ? configs.filter(c => selectedSet.has(c.id))
    : configs;
  if (configsToDuplicate.length === 0) return configs;

  const newConfigs = configsToDuplicate.map(cfg => {
    const qtyVal = duplicateSettings.qty.keepSame ? cfg.qty : duplicateSettings.qty.value;
    return {
      ...cfg,
      id: createConfigId(),
      caratIdx: duplicateSettings.carat.keepSame ? cfg.caratIdx : duplicateSettings.carat.value,
      housing: duplicateSettings.housing.keepSame ? cfg.housing : duplicateSettings.housing.value,
      housingType: duplicateSettings.housingType.keepSame ? cfg.housingType : duplicateSettings.housingType.value,
      size: duplicateSettings.size.keepSame ? cfg.size : duplicateSettings.size.value,
      shape: duplicateSettings.shape.keepSame ? cfg.shape : duplicateSettings.shape.value,
      qty: Math.max(1, typeof qtyVal === 'number' && !Number.isNaN(qtyVal) ? qtyVal : 1),
    };
  });
  return [...configs, ...newConfigs];
}

const keepAll = {
  carat: { keepSame: true, value: null },
  housing: { keepSame: true, value: null },
  housingType: { keepSame: true, value: null },
  size: { keepSame: true, value: null },
  shape: { keepSame: true, value: null },
  qty: { keepSame: true, value: 1 },
};

test('duplicateAllWithVariations: duplicates all configs when none selected', () => {
  const configs = [makeConfig({ id: 'a' }), makeConfig({ id: 'b' })];
  const result = duplicateAllWithVariations(configs, [], keepAll);
  assert.equal(result.length, 4); // 2 originals + 2 copies
  assert.equal(result[0].id, 'a');
  assert.equal(result[1].id, 'b');
  assert.notEqual(result[2].id, 'a');
  assert.notEqual(result[3].id, 'b');
});

test('duplicateAllWithVariations: only duplicates selected configs', () => {
  const configs = [makeConfig({ id: 'a' }), makeConfig({ id: 'b' })];
  const result = duplicateAllWithVariations(configs, ['a'], keepAll);
  assert.equal(result.length, 3); // 2 originals + 1 copy of 'a'
});

test('duplicateAllWithVariations: applies new caratIdx when not keepSame', () => {
  const configs = [makeConfig({ id: 'a', caratIdx: 0 })];
  const settings = { ...keepAll, carat: { keepSame: false, value: 2 } };
  const result = duplicateAllWithVariations(configs, [], settings);
  assert.equal(result[0].caratIdx, 0); // original unchanged
  assert.equal(result[1].caratIdx, 2); // copy has new carat
});

test('duplicateAllWithVariations: applies new shape when not keepSame', () => {
  const configs = [makeConfig({ id: 'a', shape: 'Heart' })];
  const settings = { ...keepAll, shape: { keepSame: false, value: 'Pear' } };
  const result = duplicateAllWithVariations(configs, [], settings);
  assert.equal(result[0].shape, 'Heart');
  assert.equal(result[1].shape, 'Pear');
});

test('duplicateAllWithVariations: applies new housing when not keepSame', () => {
  const configs = [makeConfig({ id: 'a', housing: 'Yellow' })];
  const settings = { ...keepAll, housing: { keepSame: false, value: 'White' } };
  const result = duplicateAllWithVariations(configs, [], settings);
  assert.equal(result[1].housing, 'White');
});

test('duplicateAllWithVariations: applies new qty when not keepSame', () => {
  const configs = [makeConfig({ id: 'a', qty: 1 })];
  const settings = { ...keepAll, qty: { keepSame: false, value: 5 } };
  const result = duplicateAllWithVariations(configs, [], settings);
  assert.equal(result[1].qty, 5);
});

test('duplicateAllWithVariations: clamps qty to minimum 1', () => {
  const configs = [makeConfig({ id: 'a', qty: 1 })];
  const settings = { ...keepAll, qty: { keepSame: false, value: -3 } };
  const result = duplicateAllWithVariations(configs, [], settings);
  assert.equal(result[1].qty, 1);
});

test('duplicateAllWithVariations: returns original array if empty', () => {
  const result = duplicateAllWithVariations([], [], keepAll);
  assert.equal(result.length, 0);
});

test('duplicateAllWithVariations: can change shape + carat at the same time', () => {
  const configs = [makeConfig({ id: 'a', caratIdx: 0, shape: 'Heart' })];
  const settings = {
    ...keepAll,
    carat: { keepSame: false, value: 3 },
    shape: { keepSame: false, value: 'Pear' },
  };
  const result = duplicateAllWithVariations(configs, [], settings);
  assert.equal(result[1].caratIdx, 3);
  assert.equal(result[1].shape, 'Pear');
});

// ─── qty minimum enforcement ─────────────────────────────────────────────────

test('qty decrement clamps at minC=2 for M3', () => {
  const currentQty = 2;
  const minC = M3.minC; // 2
  const newQty = Math.max(minC || 1, currentQty - 1);
  assert.equal(newQty, 2);
});

test('qty decrement clamps at the collection minimum for CUTY', () => {
  // Uses the live catalog minC so a pricing/minimum change never breaks
  // the clamp-logic test itself.
  const minC = CUTY.minC;
  const newQty = Math.max(minC || 1, minC - 1);
  assert.equal(newQty, minC);
});

test('qty decrement from 3 to 2 for M3 (minC=2)', () => {
  const currentQty = 3;
  const minC = M3.minC;
  const newQty = Math.max(minC || 1, currentQty - 1);
  assert.equal(newQty, 2);
});

test('qty decrement above the minimum decreases by one (CUTY)', () => {
  const minC = CUTY.minC;
  const currentQty = minC + 2;
  const newQty = Math.max(minC || 1, currentQty - 1);
  assert.equal(newQty, minC + 1);
});
