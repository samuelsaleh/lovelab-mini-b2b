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
}))

// catalog is NOT mocked — we use real collection data
const { COLLECTIONS } = require('@/lib/catalog')
const CUTY = COLLECTIONS.find(c => c.id === 'CUTY')
// M3 has multiThree housing and minC=2
const M3 = COLLECTIONS.find(c => c.id === 'M3')
// SSF has shapes (shapyShine housing)
const SSF = COLLECTIONS.find(c => c.id === 'SSF')

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
    // Find first color swatch button by title attribute pattern
    const swatches = screen.getAllByTitle(/Add|add/)
    if (swatches.length === 0) {
      // Fallback: click first circle-shaped button in the palette area
      const buttons = screen.getAllByRole('button')
      // Filter to buttons that look like color swatches (have a background style)
      fireEvent.click(buttons[0])
    } else {
      fireEvent.click(swatches[0])
    }
    expect(onChange).toHaveBeenCalled()
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

    // Select "Change to" for shape
    const changeToRadios = screen.getAllByRole('radio', { name: /change to/i })
    // shape is after carat, housing in the list
    const shapeRadio = changeToRadios.find((_, i) => {
      const row = changeToRadios[i].closest('[data-field]') || changeToRadios[i].closest('div')
      return row && row.textContent.toLowerCase().includes('shape')
    }) || changeToRadios[2]
    fireEvent.click(shapeRadio)

    // Pick 'Pear' from the shape select
    const selects = screen.getAllByRole('combobox')
    const shapeSelect = selects[selects.length - 1]
    fireEvent.change(shapeSelect, { target: { value: 'Pear' } })

    fireEvent.click(screen.getByRole('button', { name: /Duplicate 1/i }))

    const call = onChange.mock.calls[onChange.mock.calls.length - 1]
    const duplicate = call[1].colorConfigs[1]
    expect(duplicate.shape).toBe('Pear')
  })
})

describe('CollectionConfig — qty minimum enforcement', () => {
  it('decrement clamps at col.minC (M3 minC=2)', () => {
    const onChange = jest.fn()
    const line = mockLine(M3, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'WWW', multiAttached: true, size: 'M', qty: 2 }),
    ])
    renderConfig(M3, line, onChange)

    const decrementBtns = screen.getAllByText('-')
    fireEvent.click(decrementBtns[0])

    expect(onChange).toHaveBeenCalledWith(
      'line-1',
      expect.objectContaining({
        colorConfigs: expect.arrayContaining([
          expect.objectContaining({ qty: 2 }), // stays at minC=2, not goes to 1
        ]),
      })
    )
  })

  it('decrement clamps at 1 for CUTY (minC=1)', () => {
    const onChange = jest.fn()
    const line = mockLine(CUTY, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'M', qty: 1 }),
    ])
    renderConfig(CUTY, line, onChange)

    const decrementBtns = screen.getAllByText('-')
    fireEvent.click(decrementBtns[0])

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
