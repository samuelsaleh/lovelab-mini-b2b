/**
 * "Add all colours" — the fair-stand shortcut on every collection card.
 *
 * The button exists so an agent writing an order at a stand does not tap
 * twenty swatches. What has to hold:
 *   - it adds the WHOLE active palette in one onChange
 *   - it adds only what is missing, so it can never double a colour
 *   - it respects the collection's own palette (allowedColors, cord type)
 *   - every added row carries the same rules a hand-clicked swatch would
 *   - it flips to a remove action once the palette is complete
 *   - silk blocks it until a thickness is chosen, exactly like the swatches
 */

import React from 'react'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithI18n } from './testUtils'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))

const { COLLECTIONS, CORD_COLORS, HOUSING } = require('@/lib/catalog')
const CollectionConfig = require('../CollectionConfig').default

// CUTY — plain nylon, the full 21-colour palette, no allowedColors cap.
const CUTY = COLLECTIONS.find((c) => c.id === 'CUTY')
// Moonlight Original — nylon but capped to four colours by allowedColors.
const MFM = COLLECTIONS.find((c) => c.id === 'MFM')
// Shapy Sparkle Round G/H — silk, so nothing can be added without a thickness.
const SSRG = COLLECTIONS.find((c) => c.id === 'SSRG')

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

const addedConfigs = (onChange) => onChange.mock.calls.at(-1)[1].colorConfigs

describe('Add all colours', () => {
  it('adds every colour of the palette in a single click', () => {
    const onChange = jest.fn()
    renderConfig(CUTY, mockLine(CUTY), onChange)

    fireEvent.click(screen.getByTestId('add-all-colors'))

    const configs = addedConfigs(onChange)
    const palette = CORD_COLORS[CUTY.cord]
    expect(configs).toHaveLength(palette.length)
    expect(configs.map((c) => c.colorName)).toEqual(palette.map((c) => c.n))
  })

  it('gives every colour a unique id so the rows stay addressable', () => {
    const onChange = jest.fn()
    renderConfig(CUTY, mockLine(CUTY), onChange)

    fireEvent.click(screen.getByTestId('add-all-colors'))

    const ids = addedConfigs(onChange).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('adds only the missing colours, never a duplicate', () => {
    const onChange = jest.fn()
    const palette = CORD_COLORS[CUTY.cord]
    const existing = {
      id: 'already-here', colorName: palette[0].n, qty: 3, caratIdx: null,
    }
    renderConfig(CUTY, mockLine(CUTY, [existing]), onChange)

    fireEvent.click(screen.getByTestId('add-all-colors'))

    const configs = addedConfigs(onChange)
    expect(configs).toHaveLength(palette.length)
    // The pre-existing row survives untouched — its quantity is not reset.
    expect(configs[0]).toEqual(existing)
    const names = configs.map((c) => c.colorName)
    expect(new Set(names).size).toBe(names.length)
  })

  it('counts down as colours are added', () => {
    const palette = CORD_COLORS[CUTY.cord]
    const one = [{ id: 'a', colorName: palette[0].n, qty: 1, caratIdx: null }]
    renderConfig(CUTY, mockLine(CUTY, one))
    expect(screen.getByTestId('add-all-colors')).toHaveTextContent(String(palette.length - 1))
  })

  it('respects a collection that only sells some colours', () => {
    const onChange = jest.fn()
    renderConfig(MFM, mockLine(MFM), onChange)

    fireEvent.click(screen.getByTestId('add-all-colors'))

    // Order follows the palette (the swatch grid), not the declaration order.
    const names = addedConfigs(onChange).map((c) => c.colorName)
    expect(new Set(names)).toEqual(new Set(MFM.allowedColors))
    expect(names).toHaveLength(4)
  })

  it('applies the same per-row rules a hand-clicked swatch would', () => {
    const onChange = jest.fn()
    renderConfig(MFM, mockLine(MFM), onChange)

    fireEvent.click(screen.getByTestId('add-all-colors'))

    // MFM is metalEight — every row must be pre-filled with the first tile.
    const firstTile = HOUSING.metalEight[0]
    addedConfigs(onChange).forEach((cfg) => {
      expect(cfg.housing).toBe(firstTile)
      expect(cfg.qty).toBeGreaterThanOrEqual(1)
    })
  })

  it('carries a locked shape onto every colour it adds', () => {
    const onChange = jest.fn()
    const line = mockLine(MFM, [], { presetShape: 'Pear' })
    renderConfig(MFM, line, onChange, { presetShape: 'Pear' })

    fireEvent.click(screen.getByTestId('add-all-colors'))

    addedConfigs(onChange).forEach((cfg) => expect(cfg.shape).toBe('Pear'))
  })

  it('turns into a remove action once the whole palette is on the line', () => {
    const onChange = jest.fn()
    const full = MFM.allowedColors.map((n, i) => ({
      id: `c${i}`, colorName: n, qty: 1, caratIdx: null,
    }))
    renderConfig(MFM, mockLine(MFM, full), onChange)

    const btn = screen.getByTestId('add-all-colors')
    expect(btn).toHaveTextContent(/remove/i)

    fireEvent.click(btn)
    expect(addedConfigs(onChange)).toHaveLength(0)
  })

  it('removing the palette leaves an off-palette colour alone', () => {
    const onChange = jest.fn()
    const rows = [
      ...MFM.allowedColors.map((n, i) => ({ id: `c${i}`, colorName: n, qty: 1, caratIdx: null })),
      { id: 'odd', colorName: 'Turquoise', qty: 2, caratIdx: null },
    ]
    renderConfig(MFM, mockLine(MFM, rows), onChange)

    fireEvent.click(screen.getByTestId('add-all-colors'))

    const left = addedConfigs(onChange)
    expect(left).toHaveLength(1)
    expect(left[0].colorName).toBe('Turquoise')
  })

  it('is disabled on silk until a thickness is chosen', () => {
    const onChange = jest.fn()
    renderConfig(SSRG, mockLine(SSRG), onChange)

    const btn = screen.getByTestId('add-all-colors')
    expect(btn).toBeDisabled()

    fireEvent.click(btn)
    expect(onChange).not.toHaveBeenCalled()
  })
})
