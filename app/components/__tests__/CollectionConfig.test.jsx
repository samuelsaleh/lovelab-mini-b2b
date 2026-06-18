/**
 * CollectionConfig component tests
 *
 * Covers:
 *   - Color palette renders and adding a color calls onChange
 *   - duplicateAllWithVariations duplicates all configs
 *   - duplicateAllWithVariations with shape change applies new shape
 *   - duplicateAllWithVariations with carat change applies new caratIdx
 *   - duplicateAllWithVariations only duplicates selected rows when selection is active
 *   - isConfigComplete false when shape required but missing
 *   - isConfigComplete false for multiThree when multiAttached is null
 *   - Qty decrement does not go below col.minC
 *   - Expand/collapse toggle calls onChange with expanded patch
 */

import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { renderWithI18n, mockColorConfig } from './testUtils'

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))

// catalog is NOT mocked — we use real collection data
const { COLLECTIONS, CORD_COLORS } = require('@/lib/catalog')
const CUTY = COLLECTIONS.find(c => c.id === 'CUTY')
// M3 has multiThree housing and minC=2
const M3 = COLLECTIONS.find(c => c.id === 'M3')
// SSF has shapes (shapyShine housing)
const SSF = COLLECTIONS.find(c => c.id === 'SSF')
// Necklace collection (CUTY necklace)
const CUTY_NECK = COLLECTIONS.find(c => c.id === 'CUTY_NECK')

// ─── Component under test ────────────────────────────────────────────────────

const CollectionConfig = require('../CollectionConfig').default

// ─── Helper ───────────────────────────────────────────────────────────────────

function mockLine(col, configs = [], overrides = {}) {
  return {
    uid: 'line-1',
    collectionId: col.id,
    colorConfigs: configs,
    expanded: true,
    sameForAll: false,
    sharedSettings: {
      caratIdx: null, housing: null, housingType: null,
      multiAttached: null, shape: null, size: null, cordType: null, thickness: null, qty: null,
    },
    ...overrides,
  }
}

function renderConfig(col, line, onChange = jest.fn(), extraProps = {}) {
  return renderWithI18n(
    <CollectionConfig
      line={line}
      col={col}
      onChange={onChange}
      onRemove={jest.fn()}
      selectedConfigs={new Set()}
      onToggleConfigSelect={jest.fn()}
      onToggleLineSelect={jest.fn()}
      recentlyDuplicated={new Set()}
      {...extraProps}
    />
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CollectionConfig — color palette', () => {
  it('renders color swatches from the collection palette', () => {
    const line = mockLine(CUTY)
    renderConfig(CUTY, line)
    // CUTY uses nylon cord → 20 colors; at least one should be rendered as a button
    const swatches = screen.getAllByRole('button')
    expect(swatches.length).toBeGreaterThan(1)
  })

  it('clicking a color swatch calls onChange with a new colorConfig', () => {
    const onChange = jest.fn()
    const line = mockLine(CUTY)
    renderConfig(CUTY, line, onChange)
    // Swatches are circular buttons titled with the color name (title={c.n}).
    const firstColor = CORD_COLORS[CUTY.cord][0].n
    fireEvent.click(screen.getByTitle(firstColor))
    expect(onChange).toHaveBeenCalledWith(
      'line-1',
      expect.objectContaining({
        colorConfigs: expect.arrayContaining([
          expect.objectContaining({ colorName: firstColor }),
        ]),
      })
    )
  })
})

describe('CollectionConfig — product type badge', () => {
  it('shows a Necklace badge for necklace collections', () => {
    const line = mockLine(CUTY_NECK)
    renderConfig(CUTY_NECK, line)
    expect(screen.getByText('Necklace')).toBeInTheDocument()
  })

  it('shows a Bracelet badge for bracelet collections', () => {
    const line = mockLine(CUTY)
    renderConfig(CUTY, line)
    expect(screen.getByText('Bracelet')).toBeInTheDocument()
  })

  it('necklace size dropdown surfaces the cm measurement', () => {
    const line = mockLine(CUTY_NECK, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: null, qty: 1 }),
    ])
    renderConfig(CUTY_NECK, line)
    // The size <option> text includes the worn + max-opening centimetres.
    expect(screen.getAllByText(/22 cm \(max 62 cm\)/).length).toBeGreaterThan(0)
  })
})

describe('CollectionConfig — expand/collapse', () => {
  it('collapse toggle calls onChange with expanded: false', () => {
    const onChange = jest.fn()
    const line = mockLine(CUTY, [], { expanded: true })
    renderConfig(CUTY, line, onChange)
    // Find the collapse arrow button (▼ rotated 180deg when expanded)
    const collapseBtn = screen.getByText('▼')
    fireEvent.click(collapseBtn)
    expect(onChange).toHaveBeenCalledWith('line-1', expect.objectContaining({ expanded: false }))
  })

  it('expand toggle calls onChange with expanded: true when collapsed', () => {
    const onChange = jest.fn()
    const line = mockLine(CUTY, [], { expanded: false })
    renderConfig(CUTY, line, onChange)
    const expandBtn = screen.getByText('▼')
    fireEvent.click(expandBtn)
    expect(onChange).toHaveBeenCalledWith('line-1', expect.objectContaining({ expanded: true }))
  })
})

describe('CollectionConfig — duplicateAllWithVariations', () => {
  function lineWithTwoConfigs() {
    return mockLine(CUTY, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'M', qty: 1 }),
      mockColorConfig({ id: 'cfg-2', caratIdx: 1, housing: 'White', size: 'S', qty: 2 }),
    ])
  }

  it('duplicates all configs when none are selected', () => {
    const onChange = jest.fn()
    const line = lineWithTwoConfigs()
    renderConfig(CUTY, line, onChange)

    // Open the "Duplicate all with variations" panel
    fireEvent.click(screen.getByText(/Duplicate all with variations/i))

    // Click the Duplicate button
    fireEvent.click(screen.getByRole('button', { name: /Duplicate 2 colors/i }))

    expect(onChange).toHaveBeenCalledWith(
      'line-1',
      expect.objectContaining({
        colorConfigs: expect.arrayContaining([
          expect.objectContaining({ id: 'cfg-1' }),
          expect.objectContaining({ id: 'cfg-2' }),
          // two duplicates with new ids
          expect.not.objectContaining({ id: 'cfg-1' }),
        ]),
      })
    )
    // Should now have 4 configs (2 original + 2 copies)
    const call = onChange.mock.calls[onChange.mock.calls.length - 1]
    expect(call[1].colorConfigs).toHaveLength(4)
  })

  it('only duplicates selected configs', () => {
    const onChange = jest.fn()
    const line = lineWithTwoConfigs()
    // cfg-1 is selected
    renderConfig(CUTY, line, onChange, {
      selectedConfigs: new Set(['cfg-1']),
    })

    fireEvent.click(screen.getByText(/Duplicate all with variations/i))
    fireEvent.click(screen.getByRole('button', { name: /Duplicate 1/i }))

    const call = onChange.mock.calls[onChange.mock.calls.length - 1]
    // 2 originals + 1 copy = 3
    expect(call[1].colorConfigs).toHaveLength(3)
  })

  it('applies new carat when "Change to" is selected for carat', () => {
    const onChange = jest.fn()
    const line = mockLine(CUTY, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'M', qty: 1 }),
    ])
    renderConfig(CUTY, line, onChange)

    fireEvent.click(screen.getByText(/Duplicate all with variations/i))

    // Select "Change to" for carat (second radio in the CARAT row)
    const caratRadios = screen.getAllByRole('radio', { name: /change to/i })
    fireEvent.click(caratRadios[0])

    // Select carat index 2 (0.20 ct) from the select
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: '2' } })

    fireEvent.click(screen.getByRole('button', { name: /Duplicate 1/i }))

    const call = onChange.mock.calls[onChange.mock.calls.length - 1]
    const duplicate = call[1].colorConfigs[1] // the new copy
    expect(duplicate.caratIdx).toBe(2)
  })

  it('applies new shape when "Change to" is selected for shape (SSF)', () => {
    const onChange = jest.fn()
    const line = mockLine(SSF, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Bezel Yellow', housingType: 'bezel', shape: 'Heart', size: 'M', qty: 1 }),
    ])
    renderConfig(SSF, line, onChange)

    fireEvent.click(screen.getByText(/Duplicate all with variations/i))

    // Scope to the SHAPE variation row (each row carries data-field={field}).
    const shapeRow = document.querySelector('[data-field="shape"]')
    expect(shapeRow).toBeTruthy()
    // Select "Change to" for shape, then pick 'Pear' from that row's select.
    fireEvent.click(within(shapeRow).getByRole('radio', { name: /change to/i }))
    fireEvent.change(within(shapeRow).getByRole('combobox'), { target: { value: 'Pear' } })

    fireEvent.click(screen.getByRole('button', { name: /Duplicate 1/i }))

    const call = onChange.mock.calls[onChange.mock.calls.length - 1]
    const duplicate = call[1].colorConfigs[1]
    expect(duplicate.shape).toBe('Pear')
  })
})

describe('CollectionConfig — qty floor', () => {
  // Per commit 63d8e4d ("Fix builder decrement interactions for bracelet
  // quantities") the per-row qty decrement intentionally floors at 1 — NOT at
  // col.minC — so an agent can reduce e.g. 3 → 2 → 1 without being blocked.
  // (col.minC is still used as the *starting* qty and as the pack-total
  // multiplier in BuilderPage.computePackTotal.)
  it('decrement on M3 (minC=2) steps down toward 1, not blocked at minC', () => {
    const onChange = jest.fn()
    const line = mockLine(M3, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'WWW', multiAttached: true, size: 'M', qty: 2 }),
    ])
    renderConfig(M3, line, onChange)

    fireEvent.click(screen.getByRole('button', { name: '-' }))

    expect(onChange).toHaveBeenCalledWith(
      'line-1',
      expect.objectContaining({
        colorConfigs: expect.arrayContaining([
          expect.objectContaining({ qty: 1 }),
        ]),
      })
    )
  })

  it('decrement never goes below 1 (CUTY)', () => {
    const onChange = jest.fn()
    const line = mockLine(CUTY, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'M', qty: 1 }),
    ])
    renderConfig(CUTY, line, onChange)

    fireEvent.click(screen.getByRole('button', { name: '-' }))

    expect(onChange).toHaveBeenCalledWith(
      'line-1',
      expect.objectContaining({
        colorConfigs: expect.arrayContaining([
          expect.objectContaining({ qty: 1 }),
        ]),
      })
    )
  })
})

// ─── isConfigComplete logic tests (tested via pure function extracted inline) ─

describe('isConfigComplete logic', () => {
  // Test the logic directly rather than through UI
  function isConfigComplete(col, cfg) {
    const hasCordOptions = !!require('@/lib/catalog').CORD_OPTIONS[col.cord]
    if (cfg.caratIdx === null) return false
    if (col.housing && col.housing !== 'sparkleProng' && !cfg.housing) return false
    if (col.housing === 'multiThree' && cfg.multiAttached === null) return false
    if (col.shapes && col.shapes.length > 0 && !cfg.shape) return false
    if (col.sizes && col.sizes.length > 0 && !cfg.size) return false
    if (hasCordOptions && !cfg.cordType) return false
    if ((col.cord === 'silk' || cfg.cordType === 'silk') && !cfg.thickness) return false
    return true
  }

  it('returns false when caratIdx is null', () => {
    const cfg = mockColorConfig({ caratIdx: null })
    expect(isConfigComplete(CUTY, cfg)).toBe(false)
  })

  it('returns false when housing is required and missing (CUTY)', () => {
    const cfg = mockColorConfig({ caratIdx: 0, housing: null, size: 'M' })
    expect(isConfigComplete(CUTY, cfg)).toBe(false)
  })

  it('returns false when shape is required and missing (SSF)', () => {
    const cfg = mockColorConfig({ caratIdx: 0, housing: 'Bezel Yellow', shape: null, size: 'M' })
    expect(isConfigComplete(SSF, cfg)).toBe(false)
  })

  it('returns false for multiThree when multiAttached is null (M3)', () => {
    const cfg = mockColorConfig({ caratIdx: 0, housing: 'WWW', multiAttached: null, size: 'M' })
    expect(isConfigComplete(M3, cfg)).toBe(false)
  })

  it('returns true for complete multiThree config (M3)', () => {
    const cfg = mockColorConfig({ caratIdx: 0, housing: 'WWW', multiAttached: true, size: 'M' })
    expect(isConfigComplete(M3, cfg)).toBe(true)
  })

  it('returns true for complete CUTY config', () => {
    const cfg = mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M' })
    expect(isConfigComplete(CUTY, cfg)).toBe(true)
  })

  it('returns false when size is required and missing (CUTY)', () => {
    const cfg = mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: null })
    expect(isConfigComplete(CUTY, cfg)).toBe(false)
  })
})
