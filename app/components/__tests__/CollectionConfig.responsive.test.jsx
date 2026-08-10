/**
 * CollectionConfig — responsive layout (iPhone / iPad / desktop).
 *
 * Guarantees the mobile/iPad overhaul:
 *   - Compact viewports (phone < 768 AND iPad portrait 768-1023) render the
 *     stacked CARD layout, never the wide horizontal-scroll table.
 *   - Desktop (>= 1024) still renders the table.
 *   - The Material/Thickness control — previously only in the desktop table —
 *     is now present in the card path for silk collections, so silk orders are
 *     fully configurable on touch. This is the one functional regression risk
 *     of switching iPad to the card layout, so it is guarded explicitly.
 *   - Key interactive controls in the card meet the 44px touch-target minimum.
 */

import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithI18n, mockColorConfig } from './testUtils'

// Controllable viewport mock. `mockCompact` is read lazily inside the hook
// implementations, so each test can flip it before rendering.
let mockCompact = false
jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => mockCompact,
  useIsTablet: () => false,
  useResponsive: () => ({
    isMobile: mockCompact,
    isTablet: false,
    isDesktop: !mockCompact,
    isCompact: mockCompact,
  }),
}))

const { COLLECTIONS } = require('@/lib/catalog')
const SILK = COLLECTIONS.find(c => c.cord === 'silk')          // single dropdown: Thin/Thick (label "Thickness")
// No shipping collection offers a choice of threads today (Shapy Sparkle Round
// moved to silk-only), but the combined "Material" select still has to work if
// one is added back — exercise it through a stub.
const SILK_BRAIDED = { ...SILK, cord: 'silkBraided' }
const CUTY = COLLECTIONS.find(c => c.id === 'CUTY')            // nylon, no thickness

const CollectionConfig = require('../CollectionConfig').default

function mockLine(col, configs = [], overrides = {}) {
  return {
    uid: 'line-1',
    collectionId: col.id,
    colorConfigs: configs,
    expanded: true,
    sameForAll: false,
    sharedSettings: {
      caratIdx: null, housing: null, housingType: null,
      multiAttached: null, shape: null, size: null, cordType: null, thickness: null,
      closureType: null, qty: null,
    },
    ...overrides,
  }
}

function renderConfig(col, line, extra = {}) {
  return renderWithI18n(
    <CollectionConfig
      line={line}
      col={col}
      onChange={jest.fn()}
      onRemove={jest.fn()}
      selectedConfigs={new Set()}
      onToggleConfigSelect={jest.fn()}
      onToggleLineSelect={jest.fn()}
      recentlyDuplicated={new Set()}
      {...extra}
    />
  )
}

afterEach(() => { mockCompact = false })

describe('CollectionConfig — card vs table by viewport', () => {
  it('renders the table layout on desktop (>= 1024px)', () => {
    mockCompact = false
    const { container } = renderConfig(CUTY, mockLine(CUTY, [
      mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M', closureType: 'braided' }),
    ]))
    expect(container.querySelector('table')).toBeInTheDocument()
  })

  it('renders the card layout (no table) on compact viewports — phone and iPad portrait', () => {
    mockCompact = true
    const { container } = renderConfig(CUTY, mockLine(CUTY, [
      mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M', closureType: 'braided' }),
    ]))
    expect(container.querySelector('table')).not.toBeInTheDocument()
  })
})

describe('CollectionConfig — Material/Thickness reachable on touch (silk)', () => {
  it('shows the Thickness control in the card layout for silk-only collections', () => {
    expect(SILK).toBeTruthy()
    mockCompact = true
    renderConfig(SILK, mockLine(SILK, [mockColorConfig({ caratIdx: 0, thickness: null, size: null, housing: null })]))
    // Label rendered as "Thickness" for cord:'silk'. It appears both in the
    // add-colour picker and the per-row card field, so assert presence (>=1).
    expect(screen.getAllByText('Thickness').length).toBeGreaterThanOrEqual(1)
    // The per-row card exposes the Thin/Thick options so silk is configurable.
    expect(screen.getAllByRole('option', { name: 'Thin' }).length).toBeGreaterThanOrEqual(1)
  })

  it('shows the Material control (with Braided Nylon option) in the card layout for silkBraided collections', () => {
    expect(SILK_BRAIDED).toBeTruthy()
    mockCompact = true
    renderConfig(SILK_BRAIDED, mockLine(SILK_BRAIDED, [mockColorConfig({ caratIdx: 0, thickness: null, size: null, housing: null })]))
    expect(screen.getByText('Material')).toBeInTheDocument()
    // The combined dropdown exposes the Braided Nylon material option.
    expect(screen.getByRole('option', { name: 'Braided Nylon' })).toBeInTheDocument()
  })
})

describe('CollectionConfig — touch targets in card layout', () => {
  it('gives the row remove/duplicate buttons a >= 44px tap target', () => {
    mockCompact = true
    renderConfig(CUTY, mockLine(CUTY, [
      mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M', closureType: 'braided' }),
    ]))
    const removeBtn = screen.getByRole('button', { name: 'Remove row' })
    const dupBtn = screen.getByRole('button', { name: 'Duplicate row' })
    expect(removeBtn).toHaveStyle({ width: '44px', height: '44px' })
    expect(dupBtn).toHaveStyle({ width: '44px', height: '44px' })
  })
})
