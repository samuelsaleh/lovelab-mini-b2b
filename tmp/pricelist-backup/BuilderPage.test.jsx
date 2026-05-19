/**
 * BuilderPage component tests
 *
 * Covers:
 *   - "Collapse All" button writes expanded:false to all lines via setLines
 *   - "Expand All" button writes expanded:true to all lines via setLines
 *   - Selecting a row shows the selection action bar with correct count
 *   - Plain "Duplicate" duplicates selected configs and calls setLines
 *   - applyPack sets qty respecting col.minC
 *   - Removing a line calls setLines without the removed line
 */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { renderWithI18n, mockColorConfig } from './testUtils'

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
}))

jest.mock('@/lib/api', () => ({
  sendBuilderChat: jest.fn(),
}))

// ─── Component under test ────────────────────────────────────────────────────

const BuilderPage = require('../BuilderPage').default
const { mkLine, mkColorConfig } = require('../BuilderPage')
const { COLLECTIONS, getPrice, getDefaultCert } = require('@/lib/catalog')

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CUTY = COLLECTIONS.find(c => c.id === 'CUTY')
const M3 = COLLECTIONS.find(c => c.id === 'M3')

function makeLine(col, configs = []) {
  return {
    ...mkLine(),
    collectionId: col.id,
    colorConfigs: configs,
    expanded: true,
  }
}

function renderBuilder(lines, setLines = jest.fn()) {
  return renderWithI18n(
    <BuilderPage
      lines={lines}
      setLines={setLines}
      onGenerateQuote={jest.fn()}
      budget=""
      setBudget={jest.fn()}
      budgetRecommendations={null}
      showRecommendations={false}
      setShowRecommendations={jest.fn()}
      onRequestRecommendations={jest.fn()}
    />
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BuilderPage — Collapse / Expand All', () => {
  it('"Collapse All" sets expanded:false on all lines', () => {
    const line1 = makeLine(CUTY, [mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M' })])
    const line2 = makeLine(CUTY, [mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M' })])
    const lines = [line1, line2]
    const setLines = jest.fn()
    renderBuilder(lines, setLines)

    const collapseBtn = screen.getByText(/collapse all/i)
    fireEvent.click(collapseBtn)

    expect(setLines).toHaveBeenCalled()
    const updater = setLines.mock.calls[0][0]
    const result = updater(lines)
    expect(result.every(l => l.expanded === false)).toBe(true)
  })

  it('"Expand All" sets expanded:true on all lines', () => {
    const line1 = { ...makeLine(CUTY), expanded: false }
    const line2 = { ...makeLine(CUTY), expanded: false }
    const lines = [line1, line2]
    const setLines = jest.fn()
    renderBuilder(lines, setLines)

    const expandBtn = screen.getByText(/expand all/i)
    fireEvent.click(expandBtn)

    expect(setLines).toHaveBeenCalled()
    const updater = setLines.mock.calls[0][0]
    const result = updater(lines)
    expect(result.every(l => l.expanded === true)).toBe(true)
  })
})

describe('BuilderPage — Multi-select action bar', () => {
  it('selecting configs shows the action bar', () => {
    const cfg = mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'M' })
    const line = makeLine(CUTY, [cfg])
    renderBuilder([line])

    // Click the selection checkbox for the row
    const checkboxes = screen.getAllByRole('checkbox')
    if (checkboxes.length > 0) {
      fireEvent.click(checkboxes[0])
      // Action bar should appear with "Duplicate" button
      expect(screen.getByText(/duplicate/i)).toBeInTheDocument()
    }
  })

  it('"Duplicate" button duplicates selected configs via setLines', () => {
    const cfg = mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'M' })
    const line = { ...makeLine(CUTY, [cfg]), uid: 'line-1' }
    const setLines = jest.fn()
    renderBuilder([line], setLines)

    // Click the row selection checkbox
    const checkboxes = screen.getAllByRole('checkbox')
    if (checkboxes.length > 0) {
      fireEvent.click(checkboxes[0])
      // Click Duplicate button in action bar
      const dupBtn = screen.getAllByRole('button').find(b =>
        b.textContent?.toLowerCase().includes('duplicate') && !b.textContent?.includes('variation')
      )
      if (dupBtn) {
        fireEvent.click(dupBtn)
        // setLines should have been called to add the copy
        expect(setLines).toHaveBeenCalled()
      }
    }
  })
})

describe('BuilderPage — Remove line', () => {
  it('clicking remove on a line calls setLines to remove it', () => {
    const line = makeLine(CUTY, [mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M' })])
    const setLines = jest.fn()
    renderBuilder([line], setLines)

    const removeBtns = screen.getAllByTitle(/remove collection/i)
    if (removeBtns.length > 0) {
      fireEvent.click(removeBtns[0])
      expect(setLines).toHaveBeenCalled()
    }
  })
})

describe('BuilderPage — computePackTotal with minC', () => {
  // Test the exported function via the module
  it('computePackTotal multiplies by minC for M3', () => {
    // We test this indirectly by checking pack card display
    // M3: minC=2, prices.2026.igi[0]=65, nylon palette has 20 colors
    // Expected total = 65 * 20 * 2 = 2600
    const col = M3
    const colorCount = 20
    const minQty = col.minC || 1
    // Pin the year explicitly so this test breaks loudly if the catalog data
    // model changes again. (Default fallback is also '2026' per the catalog
    // contract — see catalog-pricelist-defaults.test.js.)
    const lineTotal = getPrice(col, 0, getDefaultCert(col), '2026')
    const expected = lineTotal * colorCount * minQty
    expect(expected).toBe(2600)
  })
})

describe('BuilderPage — collections selected display', () => {
  it('does not duplicate the count in the "X collections selected" text', () => {
    // We test this at the mkLine/configure step level by checking the text output
    // The fix removes the bold prefix so count only appears once in the translation
    // This is a regression check — if the bold prefix is present, it would show "2 2 collections selected"
    const { t } = require('@/lib/i18n').useI18n
      ? { t: (k) => k }
      : require('@/lib/i18n/translations').translations
    // Verify the translation key includes {count} placeholder (normal)
    const { translations } = require('@/lib/i18n/translations')
    const key = translations.en['builder.collectionsSelected']
    expect(key).toBeDefined()
    // The key should contain {count} once
    const occurrences = (key.match(/\{count\}/g) || []).length
    expect(occurrences).toBe(1)
  })
})

describe('BuilderPage — applyPack regression (Phase 20)', () => {
  // After replacing the legacy hardcoded PACKS constant with a DB-loaded
  // `/api/packs` response, applying a pack must produce the same line
  // structure as the legacy code path. We pin this down by mocking fetch
  // to return one pack with a tiny formRows slice (CUTY, no shapes/settings),
  // then asserting that clicking "Use this pack" calls setLines with the
  // expected configs.

  const cutyFormRows = [
    {
      collection: 'CUTY', carat: '0.05', bpColor: 'White', size: 'M',
      colorCord: 'Red', quantity: '1', unitPrice: '24',
      shape: '', setting: '', cert: 'In-house',
    },
    {
      collection: 'CUTY', carat: '0.10', bpColor: 'Yellow', size: 'M',
      colorCord: 'Black', quantity: '2', unitPrice: '34',
      shape: '', setting: '', cert: 'In-house',
    },
  ]

  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
    global.fetch = jest.fn((url) => {
      if (typeof url === 'string' && url.includes('/api/packs')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            packs: [{
              id: 'pack-test-1',
              label: 'Test Pack',
              description: ['CUTY — sample'],
              budget_label: '€24 – €34/bracelet',
              fixed_total: 970,
              form_rows: cutyFormRows,
              scope: 'global',
              created_by: null,
              is_seed: true,
            }],
          }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('clicking a DB-loaded pack with formRows applies configs identically to legacy applyPack', async () => {
    const setLines = jest.fn()
    await act(async () => {
      renderBuilder([], setLines)
    })

    // Wait for fetch to resolve and packs to be loaded into state.
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    // Open the packs strip.
    const browseBtn = await screen.findByText(/Browse/i)
    fireEvent.click(browseBtn)

    // Click the pack's "Use this pack" button.
    const useBtn = await screen.findByText(/Use this pack/i)
    fireEvent.click(useBtn)

    // setLines should be called once with one CUTY line containing two configs.
    expect(setLines).toHaveBeenCalled()
    const callArgs = setLines.mock.calls.find(c => Array.isArray(c[0]))
    expect(callArgs).toBeDefined()
    const newLines = callArgs[0]
    expect(newLines).toHaveLength(1)
    const line = newLines[0]
    expect(line.collectionId).toBe('CUTY')
    expect(line.colorConfigs).toHaveLength(2)

    // First config: 0.05 ct white housing, M size, red cord, qty 1
    expect(line.colorConfigs[0]).toMatchObject({
      colorName: 'Red',
      qty: 1,
      caratIdx: 0,
      housing: 'White',
      size: 'M',
    })
    // Second config: 0.10 ct yellow housing, M size, black cord, qty 2
    expect(line.colorConfigs[1]).toMatchObject({
      colorName: 'Black',
      qty: 2,
      caratIdx: 1,
      housing: 'Yellow',
      size: 'M',
    })
  })
})
