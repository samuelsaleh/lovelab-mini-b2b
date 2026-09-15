/**
 * BuilderPage — Pricelist toggle
 *
 * Sam, 15 Sep 2026: only the October 2026 list is offered for a new order.
 * The 2025 and pre-October 2026 lists are retired from the picker but an
 * order saved on one keeps it: the toggle then shows that list beside
 * October so the agent can leave it there or move it to the current list.
 *
 * Contract guarantees of the toggle itself are unchanged:
 *   1. Empty builder → switching is silent (no confirm modal, immediately commits).
 *   2. Non-empty builder → switching opens a confirm modal first; only Continue commits.
 *   3. Confirming propagates the new year to setPricelistYear.
 */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { renderWithI18n, mockColorConfig } from './testUtils'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))

jest.mock('@/lib/api', () => ({
  sendBuilderChat: jest.fn(),
}))

const BuilderPage = require('../BuilderPage').default
const { mkLine } = require('../BuilderPage')
const { COLLECTIONS, PRICELISTS, PRICELIST_LABELS, NEW_ORDER_PRICELIST } = require('@/lib/catalog')

const CUTY = COLLECTIONS.find((c) => c.id === 'CUTY')

const ADMIN = { role: 'admin', email: 'admin@example.com' }
const PLAIN_AGENT = { role: 'agent', email: 'agent@example.com' }

function renderToggle({
  lines = [],
  setPricelistYear = jest.fn(),
  pricelistYear = NEW_ORDER_PRICELIST,
  profile = ADMIN,
} = {}) {
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
      isAdmin={profile?.role === 'admin'}
      profile={profile}
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
  return {
    ...mkLine(),
    collectionId: CUTY.id,
    colorConfigs: [mockColorConfig({ caratIdx: null, qty: 1, certType: 'igi', colorName: 'Black' })],
    expanded: true,
  }
}

describe('BuilderPage — Pricelist toggle', () => {
  it('a new order is on the October list and sees no toggle at all', () => {
    expect(NEW_ORDER_PRICELIST).toBe('2026-10')
    for (const profile of [ADMIN, PLAIN_AGENT, null]) {
      const { unmount } = renderToggle({ lines: [makeFilledLine()], profile })
      expect(screen.queryByTestId('pricelist-toggle')).not.toBeInTheDocument()
      for (const year of PRICELISTS) {
        expect(screen.queryByTestId(`pricelist-toggle-${year}`)).not.toBeInTheDocument()
      }
      unmount()
    }
  })

  // An order saved on 2025 or on the pre-October 2026 list keeps that list.
  // The toggle then shows exactly that list and October, nothing else.
  it.each(['2025', '2026'])('an order saved on %s shows that list beside October, checked', (year) => {
    renderToggle({ lines: [makeFilledLine()], pricelistYear: year, profile: PLAIN_AGENT })
    expect(screen.getByTestId('pricelist-toggle')).toBeInTheDocument()
    expect(screen.getByTestId(`pricelist-toggle-${year}`)).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('pricelist-toggle-2026-10')).toHaveAttribute('aria-checked', 'false')
    const other = PRICELISTS.filter((y) => y !== year && y !== '2026-10')
    for (const y of other) expect(screen.queryByTestId(`pricelist-toggle-${y}`)).not.toBeInTheDocument()
    expect(screen.getByTestId('pricelist-toggle')).toHaveAttribute('title', expect.stringContaining('earlier price list'))
  })

  it('the October button is labelled so an agent can tell it apart', () => {
    renderToggle({ lines: [makeFilledLine()], pricelistYear: '2025' })
    const btn = screen.getByTestId('pricelist-toggle-2026-10')
    expect(btn).toHaveTextContent(PRICELIST_LABELS['2026-10'])
    expect(btn).toHaveTextContent(/oct/i)
  })

  it('moving an old order to October confirms first, then commits that exact key', () => {
    const setPricelistYear = jest.fn()
    renderToggle({ lines: [makeFilledLine()], setPricelistYear, pricelistYear: '2026' })
    fireEvent.click(screen.getByTestId('pricelist-toggle-2026-10'))
    expect(screen.getByTestId('pricelist-switch-modal')).toBeInTheDocument()
    expect(setPricelistYear).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('pricelist-switch-confirm'))
    expect(setPricelistYear).toHaveBeenCalledWith('2026-10')
  })

  it('once on October, the retired list is no longer offered (one-way)', () => {
    renderToggle({ lines: [makeFilledLine()], pricelistYear: '2026-10', profile: ADMIN })
    expect(screen.queryByTestId('pricelist-toggle')).not.toBeInTheDocument()
  })

  it('clicking the active year is a no-op (no modal, no setter call)', () => {
    const setPricelistYear = jest.fn()
    renderToggle({ lines: [makeFilledLine()], setPricelistYear, pricelistYear: '2025' })
    fireEvent.click(screen.getByTestId('pricelist-toggle-2025'))
    expect(screen.queryByTestId('pricelist-switch-modal')).not.toBeInTheDocument()
    expect(setPricelistYear).not.toHaveBeenCalled()
  })

  it('switching with an UNFILLED line (no carat) commits silently', () => {
    const setPricelistYear = jest.fn()
    renderToggle({ lines: [makeUnfilledLine()], setPricelistYear, pricelistYear: '2025' })
    fireEvent.click(screen.getByTestId('pricelist-toggle-2026-10'))
    expect(screen.queryByTestId('pricelist-switch-modal')).not.toBeInTheDocument()
    expect(setPricelistYear).toHaveBeenCalledWith('2026-10')
  })

  it('switching with NON-EMPTY lines opens the confirm modal first', () => {
    const setPricelistYear = jest.fn()
    renderToggle({ lines: [makeFilledLine()], setPricelistYear, pricelistYear: '2025' })
    fireEvent.click(screen.getByTestId('pricelist-toggle-2026-10'))
    expect(screen.getByTestId('pricelist-switch-modal')).toBeInTheDocument()
    expect(setPricelistYear).not.toHaveBeenCalled()
  })

  it('cancelling the modal does not commit the switch', () => {
    const setPricelistYear = jest.fn()
    renderToggle({ lines: [makeFilledLine()], setPricelistYear, pricelistYear: '2025' })
    fireEvent.click(screen.getByTestId('pricelist-toggle-2026-10'))
    fireEvent.click(screen.getByTestId('pricelist-switch-cancel'))
    expect(setPricelistYear).not.toHaveBeenCalled()
    expect(screen.queryByTestId('pricelist-switch-modal')).not.toBeInTheDocument()
  })

  it('confirming the modal commits the new year via setPricelistYear', () => {
    const setPricelistYear = jest.fn()
    renderToggle({ lines: [makeFilledLine()], setPricelistYear, pricelistYear: '2025' })
    fireEvent.click(screen.getByTestId('pricelist-toggle-2026-10'))
    fireEvent.click(screen.getByTestId('pricelist-switch-confirm'))
    expect(setPricelistYear).toHaveBeenCalledWith('2026-10')
    expect(screen.queryByTestId('pricelist-switch-modal')).not.toBeInTheDocument()
  })
})
