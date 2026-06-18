/**
 * CollectionConfig — shape-locked lines (line.presetShape)
 *
 * When a shape is chosen on the selection grid (SHAPY SHINE NECKLACE — Heart),
 * the resulting line carries `presetShape`. The config panel then:
 *   - shows the shape in the header label
 *   - hides every shape-picking UI (strip, shared selector, table column)
 *   - pre-fills each newly added colour's shape to the preset value
 *
 * Covers the above plus a calculateQuote round-trip that preserves the shape.
 */

import React from 'react'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithI18n } from './testUtils'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))

const CollectionConfig = require('../CollectionConfig').default
const { COLLECTIONS, CORD_COLORS, calculateQuote } = require('@/lib/catalog')

const SSF_NECK = COLLECTIONS.find(c => c.id === 'SSF_NECK')

// SSF_NECK now exposes the full Shine palette (no allowedColors cap), so pick
// the first colour straight from the Shine palette.
const SHINE_COLORS = CORD_COLORS['shine'] || []
const FIRST_ALLOWED = (SHINE_COLORS[0] || {}).n

function mockLine(configs = [], overrides = {}) {
  return {
    uid: 'line-1',
    collectionId: SSF_NECK.id,
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

function renderConfig(line, onChange = jest.fn()) {
  return renderWithI18n(
    <CollectionConfig
      line={line}
      col={SSF_NECK}
      onChange={onChange}
      onRemove={jest.fn()}
      selectedConfigs={new Set()}
      onToggleConfigSelect={jest.fn()}
      onToggleLineSelect={jest.fn()}
      recentlyDuplicated={new Set()}
    />
  )
}

describe('CollectionConfig — shape-locked header & hidden selectors', () => {
  it('shows the preset shape in the header label', () => {
    renderConfig(mockLine([], { presetShape: 'Heart' }))
    expect(screen.getByText('SHAPY SHINE NECKLACE — Heart')).toBeInTheDocument()
  })

  it('hides the "Shapes available" strip when the shape is preset', () => {
    renderConfig(mockLine([], { presetShape: 'Heart' }))
    expect(screen.queryByText(/Shapes available/i)).not.toBeInTheDocument()
  })

  it('still shows the "Shapes available" strip when no shape is preset', () => {
    renderConfig(mockLine([]))
    expect(screen.getByText(/Shapes available/i)).toBeInTheDocument()
  })

  it('does not render a Shape column header for a shape-locked line', () => {
    const line = mockLine([
      { id: 'c1', colorName: FIRST_ALLOWED, caratIdx: 0, housing: null, shape: 'Heart', size: null, qty: 1 },
    ], { presetShape: 'Heart' })
    renderConfig(line)
    // The shape table column header is gone.
    expect(screen.queryByRole('columnheader', { name: /^Shape$/i })).not.toBeInTheDocument()
  })
})

describe('CollectionConfig — addColor inherits the preset shape', () => {
  it('clicking a colour swatch creates a colorConfig with shape = presetShape', () => {
    const onChange = jest.fn()
    renderConfig(mockLine([], { presetShape: 'Heart' }), onChange)

    expect(FIRST_ALLOWED).toBeTruthy()
    fireEvent.click(screen.getByTitle(FIRST_ALLOWED))

    expect(onChange).toHaveBeenCalledWith(
      'line-1',
      expect.objectContaining({
        colorConfigs: expect.arrayContaining([
          expect.objectContaining({ colorName: FIRST_ALLOWED, shape: 'Heart' }),
        ]),
      })
    )
  })
})

describe('CollectionConfig — size stays selectable on a shape-locked line', () => {
  it('renders the size dropdown once carat + housing are chosen, even before cfg.shape is set', () => {
    // cfg.shape intentionally null: the size selector must NOT be gated off by
    // the shape requirement, because the line shape is preset on the grid.
    // Housing is set (SSF_NECK has shapyShine housing) so the housing gate passes.
    const line = mockLine([
      { id: 'c1', colorName: FIRST_ALLOWED, caratIdx: 0, housing: 'Bezel Yellow', housingType: 'bezel', shape: null, size: null, qty: 1 },
    ], { presetShape: 'Heart' })
    renderConfig(line)
    // Necklace size options render their cm metadata (e.g. "22 cm (max 62 cm)").
    expect(screen.getAllByText(/cm/).length).toBeGreaterThan(0)
  })

  it('backfills cfg.shape = presetShape for a row missing it (heals stale/restored lines)', () => {
    const onChange = jest.fn()
    const line = mockLine([
      { id: 'c1', colorName: FIRST_ALLOWED, caratIdx: 0, housing: null, shape: null, size: null, qty: 1 },
    ], { presetShape: 'Heart' })
    renderConfig(line, onChange)
    // The normalization effect rewrites the config with the preset shape.
    expect(onChange).toHaveBeenCalledWith(
      'line-1',
      expect.objectContaining({
        colorConfigs: expect.arrayContaining([
          expect.objectContaining({ id: 'c1', shape: 'Heart' }),
        ]),
      })
    )
  })
})

describe('CollectionConfig — calculateQuote preserves the preset shape', () => {
  it('keeps shape on the priced row', () => {
    const cfg = { id: 'c1', colorName: FIRST_ALLOWED, caratIdx: 0, housing: null, shape: 'Heart', size: SSF_NECK.sizes[0], qty: 2 }
    const line = mockLine([cfg], { presetShape: 'Heart' })
    const quote = calculateQuote([line], { pricelistYear: '2026' })
    const heartRow = quote.lines.find(r => r.product === SSF_NECK.label && r.shape === 'Heart')
    expect(heartRow).toBeTruthy()
    expect(heartRow.qty).toBe(2)
  })
})
