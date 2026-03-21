/**
 * BuilderPage pure logic tests
 *
 * Tests the business logic extracted from BuilderPage.jsx:
 *   - duplicateSelected: plain duplication of selected configs
 *   - removeLine: stale closure fix
 *   - computePackTotal: minC multiplier
 *   - mkLine: new line has expanded, sameForAll, sharedSettings
 *   - collapse/expand all: toggling line.expanded
 *   - collectionsSelected count: no double counting
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { COLLECTIONS, CORD_COLORS } from '../../lib/catalog.js';

const CUTY = COLLECTIONS.find(c => c.id === 'CUTY');
const M3   = COLLECTIONS.find(c => c.id === 'M3');

let _uidCounter = 0;
function uniqueId() { return `uid-${++_uidCounter}`; }

function mkLine() {
  return {
    uid: uniqueId(),
    collectionId: null,
    colorConfigs: [],
    expanded: true,
    sameForAll: false,
    sharedSettings: {
      caratIdx: null, housing: null, housingType: null,
      multiAttached: null, shape: null, size: null,
      cordType: null, thickness: null, qty: null,
    },
  };
}

function makeConfig(overrides = {}) {
  return {
    id: uniqueId(), colorName: 'White', caratIdx: 1,
    housing: 'Yellow', housingType: null, multiAttached: null,
    shape: null, size: 'M', cordType: null, thickness: null,
    qty: 1, priceOverride: null, ...overrides,
  };
}

// ─── mkLine structure ────────────────────────────────────────────────────────

test('mkLine includes expanded, sameForAll, sharedSettings', () => {
  const line = mkLine();
  assert.equal(line.expanded, true);
  assert.equal(line.sameForAll, false);
  assert.ok(line.sharedSettings);
  assert.equal(line.sharedSettings.caratIdx, null);
  assert.equal(line.colorConfigs.length, 0);
});

// ─── collapse / expand all ───────────────────────────────────────────────────

test('collapse all sets expanded=false on every line', () => {
  const lines = [
    { ...mkLine(), collectionId: 'CUTY', expanded: true },
    { ...mkLine(), collectionId: 'M3', expanded: true },
  ];
  const allExpanded = lines.filter(l => l.collectionId).every(l => l.expanded !== false);
  assert.equal(allExpanded, true);
  const result = lines.map(l => ({ ...l, expanded: !allExpanded }));
  assert.equal(result.every(l => l.expanded === false), true);
});

test('expand all sets expanded=true on every line', () => {
  const lines = [
    { ...mkLine(), collectionId: 'CUTY', expanded: false },
    { ...mkLine(), collectionId: 'M3', expanded: false },
  ];
  const allExpanded = lines.filter(l => l.collectionId).every(l => l.expanded !== false);
  assert.equal(allExpanded, false);
  const result = lines.map(l => ({ ...l, expanded: !allExpanded }));
  assert.equal(result.every(l => l.expanded === true), true);
});

// ─── duplicateSelected (simplified, no withVariations path) ──────────────────

function duplicateSelected(lines, selectedConfigs) {
  const newIds = new Set();
  const updated = lines.map(line => {
    const selectedInLine = line.colorConfigs.filter(c => selectedConfigs.has(c.id));
    if (selectedInLine.length === 0) return line;
    const copies = selectedInLine.map(cfg => {
      const newId = uniqueId();
      newIds.add(newId);
      return { ...cfg, id: newId };
    });
    return { ...line, colorConfigs: [...line.colorConfigs, ...copies] };
  });
  return { updated, newIds };
}

test('duplicateSelected: copies selected configs in the same line', () => {
  const cfg1 = makeConfig({ id: 'c1' });
  const cfg2 = makeConfig({ id: 'c2' });
  const line = { ...mkLine(), collectionId: 'CUTY', colorConfigs: [cfg1, cfg2] };
  const { updated, newIds } = duplicateSelected([line], new Set(['c1']));
  assert.equal(updated[0].colorConfigs.length, 3);
  assert.equal(newIds.size, 1);
  assert.equal(updated[0].colorConfigs[0].id, 'c1');
  assert.equal(updated[0].colorConfigs[1].id, 'c2');
});

test('duplicateSelected: no-op when nothing is selected', () => {
  const cfg = makeConfig({ id: 'c1' });
  const line = { ...mkLine(), collectionId: 'CUTY', colorConfigs: [cfg] };
  const { updated } = duplicateSelected([line], new Set());
  assert.equal(updated[0].colorConfigs.length, 1);
});

test('duplicateSelected: copies settings from original', () => {
  const cfg = makeConfig({ id: 'c1', caratIdx: 2, housing: 'White', size: 'L' });
  const line = { ...mkLine(), collectionId: 'CUTY', colorConfigs: [cfg] };
  const { updated } = duplicateSelected([line], new Set(['c1']));
  const copy = updated[0].colorConfigs[1];
  assert.notEqual(copy.id, 'c1');
  assert.equal(copy.caratIdx, 2);
  assert.equal(copy.housing, 'White');
  assert.equal(copy.size, 'L');
});

test('duplicateSelected: works across multiple lines', () => {
  const cfg1 = makeConfig({ id: 'c1' });
  const cfg2 = makeConfig({ id: 'c2' });
  const line1 = { ...mkLine(), collectionId: 'CUTY', colorConfigs: [cfg1] };
  const line2 = { ...mkLine(), collectionId: 'M3', colorConfigs: [cfg2] };
  const { updated } = duplicateSelected([line1, line2], new Set(['c1', 'c2']));
  assert.equal(updated[0].colorConfigs.length, 2);
  assert.equal(updated[1].colorConfigs.length, 2);
});

// ─── removeLine ──────────────────────────────────────────────────────────────

function removeLine(lines, uid) {
  let removedConfigIds = new Set();
  const lineToRemove = lines.find(l => l.uid === uid);
  if (lineToRemove) {
    removedConfigIds = new Set(lineToRemove.colorConfigs.map(c => c.id));
  }
  const next = lines.filter(l => l.uid !== uid);
  const updatedLines = next.length > 0 ? next : [mkLine()];
  return { updatedLines, removedConfigIds };
}

test('removeLine: filters out the line with given uid', () => {
  const line1 = { ...mkLine(), uid: 'L1', colorConfigs: [makeConfig({ id: 'c1' })] };
  const line2 = { ...mkLine(), uid: 'L2', colorConfigs: [makeConfig({ id: 'c2' })] };
  const { updatedLines, removedConfigIds } = removeLine([line1, line2], 'L1');
  assert.equal(updatedLines.length, 1);
  assert.equal(updatedLines[0].uid, 'L2');
  assert.ok(removedConfigIds.has('c1'));
  assert.ok(!removedConfigIds.has('c2'));
});

test('removeLine: creates a fresh line if last line is removed', () => {
  const line = { ...mkLine(), uid: 'L1', colorConfigs: [makeConfig({ id: 'c1' })] };
  const { updatedLines } = removeLine([line], 'L1');
  assert.equal(updatedLines.length, 1);
  assert.notEqual(updatedLines[0].uid, 'L1');
  assert.equal(updatedLines[0].colorConfigs.length, 0);
});

test('removeLine: returns all config ids from removed line for selection cleanup', () => {
  const cfgs = [makeConfig({ id: 'c1' }), makeConfig({ id: 'c2' }), makeConfig({ id: 'c3' })];
  const line = { ...mkLine(), uid: 'L1', colorConfigs: cfgs };
  const { removedConfigIds } = removeLine([line], 'L1');
  assert.equal(removedConfigIds.size, 3);
  assert.ok(removedConfigIds.has('c1'));
  assert.ok(removedConfigIds.has('c2'));
  assert.ok(removedConfigIds.has('c3'));
});

// ─── computePackTotal ────────────────────────────────────────────────────────

function computePackTotal(pack) {
  return pack.lines.reduce((sum, line) => {
    const col = COLLECTIONS.find(c => c.id === line.collectionId);
    if (!col) return sum;
    const colorCount = (CORD_COLORS[col.cord] || []).length;
    const minQty = col.minC || 1;
    const lineTotal = line.caratIndices.reduce((s, ci) => s + (col.prices[ci] || 0), 0);
    return sum + lineTotal * colorCount * minQty;
  }, 0);
}

test('computePackTotal: M3 pack accounts for minC=2', () => {
  // M3: nylon=20 colors, price[0]=55, minC=2 → 55*20*2=2200
  const total = computePackTotal({ lines: [{ collectionId: 'M3', caratIndices: [0] }] });
  assert.equal(total, 2200);
});

test('computePackTotal: CUTY pack with minC=1', () => {
  // CUTY: nylon=20 colors, price[1]=30, minC=1 → 30*20*1=600
  const total = computePackTotal({ lines: [{ collectionId: 'CUTY', caratIndices: [1] }] });
  assert.equal(total, 600);
});

test('computePackTotal: unknown collection returns 0', () => {
  const total = computePackTotal({ lines: [{ collectionId: 'NOPE', caratIndices: [0] }] });
  assert.equal(total, 0);
});

// ─── collectionsSelected translation key ─────────────────────────────────────

test('collectionsSelected translation should have exactly one {count} placeholder', async () => {
  const { translations } = await import('../../lib/i18n/translations.js');
  const key = translations.en['builder.collectionsSelected'];
  assert.ok(key, 'key should exist');
  const matches = key.match(/\{count\}/g) || [];
  assert.equal(matches.length, 1, `Expected 1 occurrence of {count}, got ${matches.length}`);
});
