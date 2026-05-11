/**
 * BuilderPage — Pricelist toggle (2025 vs 2026)
 *
 * Validates the three contract guarantees of the toggle:
 *   1. Empty builder → toggle is silent (no confirm modal, immediately commits).
 *   2. Non-empty builder → toggle opens a confirm modal first; only Continue commits.
 *   3. Confirming the switch propagates the new year to setPricelistYear; the
 *      OrderForm-side `priceOverride` preservation contract is covered by the
 *      lib-level `calculate-quote-pricelist.test.js` (we only need to verify the
 *      year handoff here).
 */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { renderWithI18n, mockColorConfig } from './testUtils'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
}))

jest.mock('@/lib/api', () => ({
  sendBuilderChat: jest.fn(),
}))

const BuilderPage = require('../BuilderPage').default
const { mkLine } = require('../BuilderPage')
const { COLLECTIONS } = require('@/lib/catalog')

const CUTY = COLLECTIONS.find((c) => c.id === 'CUTY')

function renderToggle({ lines = [], setPricelistYear = jest.fn(), pricelistYear = '2026' } = {}) {
  return renderWithI18n(
    <BuilderPage
      lines={lines}
      setLines={jest.fn()}
      onGenerateQuote={jest.fn()}
      budget=""
      setBudget={jest.fn()}
      budgetRecommendations={null}
      showRecommendations={false}
      setShowRecommendations={jest.fn()}
      onRequestRecommendations={jest.fn()}
      pricelistYear={pricelistYear}
      setPricelistYear={setPricelistYear}
    />,
  )
}

function makeFilledLine() {
  return {
    ...mkLine(),
    collectionId: CUTY.id,
    colorConfigs: [mockColorConfig({ caratIdx: 3, qty: 3, certType: 'igi', colorName: 'Black', housing: 'Yellow', size: 'M' })],
    expanded: true,
  }
}

function makeUnfilledLine() {
  // Has a collection but no carat picked yet → counts as empty for the toggle.
  return {
    ...mkLine(),
    collectionId: CUTY.id,
    colorConfigs: [mockColorConfig({ caratIdx: null, qty: 1, certType: 'igi', colorName: 'Black' })],
    expanded: true,
  }
}

describe('BuilderPage — Pricelist toggle', () => {
  it('renders both year buttons in the Step 2 header', () => {
    renderToggle({ lines: [makeFilledLine()] })
    expect(screen.getByTestId('pricelist-toggle-2025')).toBeInTheDocument()
    expect(screen.getByTestId('pricelist-toggle-2026')).toBeInTheDocument()
  })

  it('clicking the active year is a no-op (no modal, no setter call)', () => {
    const setPricelistYear = jest.fn()
    renderToggle({ lines: [makeFilledLine()], setPricelistYear, pricelistYear: '2026' })
    fireEvent.click(screen.getByTestId('pricelist-toggle-2026'))
    expect(screen.queryByTestId('pricelist-switch-modal')).not.toBeInTheDocument()
    expect(setPricelistYear).not.toHaveBeenCalled()
  })

  it('switching with an UNFILLED line (no carat) ALSO commits silently', () => {
    // A line with collectionId but no caratIdx is "in progress" but not yet
    // priced — the toggle treats this as empty so the agent isn't pestered.
    const setPricelistYear = jest.fn()
    renderToggle({ lines: [makeUnfilledLine()], setPricelistYear, pricelistYear: '2026' })
    fireEvent.click(screen.getByTestId('pricelist-toggle-2025'))
    expect(screen.queryByTestId('pricelist-switch-modal')).not.toBeInTheDocument()
    expect(setPricelistYear).toHaveBeenCalledWith('2025')
  })

  it('switching with NON-EMPTY lines opens the confirm modal first', () => {
    const setPricelistYear = jest.fn()
    renderToggle({ lines: [makeFilledLine()], setPricelistYear, pricelistYear: '2026' })
    fireEvent.click(screen.getByTestId('pricelist-toggle-2025'))
    expect(screen.getByTestId('pricelist-switch-modal')).toBeInTheDocument()
    expect(setPricelistYear).not.toHaveBeenCalled()
  })

  it('cancelling the modal does not commit the switch', () => {
    const setPricelistYear = jest.fn()
    renderToggle({ lines: [makeFilledLine()], setPricelistYear, pricelistYear: '2026' })
    fireEvent.click(screen.getByTestId('pricelist-toggle-2025'))
    fireEvent.click(screen.getByTestId('pricelist-switch-cancel'))
    expect(setPricelistYear).not.toHaveBeenCalled()
    expect(screen.queryByTestId('pricelist-switch-modal')).not.toBeInTheDocument()
  })

  it('confirming the modal commits the new year via setPricelistYear', () => {
    const setPricelistYear = jest.fn()
    renderToggle({ lines: [makeFilledLine()], setPricelistYear, pricelistYear: '2026' })
    fireEvent.click(screen.getByTestId('pricelist-toggle-2025'))
    fireEvent.click(screen.getByTestId('pricelist-switch-confirm'))
    expect(setPricelistYear).toHaveBeenCalledWith('2025')
    expect(screen.queryByTestId('pricelist-switch-modal')).not.toBeInTheDocument()
  })
})
