/**
 * BuilderPage — Pricelist toggle (2025 / 2026 / 2026 from October)
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
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))

jest.mock('@/lib/api', () => ({
  sendBuilderChat: jest.fn(),
}))

const BuilderPage = require('../BuilderPage').default
const { mkLine } = require('../BuilderPage')
const { COLLECTIONS, PRICELISTS, PRICELIST_LABELS } = require('@/lib/catalog')

const CUTY = COLLECTIONS.find((c) => c.id === 'CUTY')

const ADMIN = { role: 'admin', email: 'admin@example.com' }
const PIOTR = { role: 'agent', email: 'piotr.kicinski84@gmail.com' }
const PLAIN_AGENT = { role: 'agent', email: 'agent@example.com' }

// Defaults to an admin because these cases exercise the toggle mechanics, not
// who is allowed to see which list — that is the last describe block.
function renderToggle({
  lines = [],
  setPricelistYear = jest.fn(),
  pricelistYear = '2026',
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
  // Has a collection but no carat picked yet → counts as empty for the toggle.
  return {
    ...mkLine(),
    collectionId: CUTY.id,
    colorConfigs: [mockColorConfig({ caratIdx: null, qty: 1, certType: 'igi', colorName: 'Black' })],
    expanded: true,
  }
}

describe('BuilderPage — Pricelist toggle', () => {
  it('renders a button per pricelist in the Step 2 header', () => {
    renderToggle({ lines: [makeFilledLine()] })
    expect(PRICELISTS).toContain('2026-10')
    for (const year of PRICELISTS) {
      expect(screen.getByTestId(`pricelist-toggle-${year}`)).toBeInTheDocument()
    }
  })

  it('the October button is labelled so an agent can tell it apart', () => {
    renderToggle({ lines: [makeFilledLine()] })
    const btn = screen.getByTestId('pricelist-toggle-2026-10')
    expect(btn).toHaveTextContent(PRICELIST_LABELS['2026-10'])
    expect(btn).toHaveTextContent(/oct/i)
  })

  it('marks only the active list as checked', () => {
    renderToggle({ lines: [makeFilledLine()], pricelistYear: '2026-10' })
    expect(screen.getByTestId('pricelist-toggle-2026-10')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('pricelist-toggle-2026')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByTestId('pricelist-toggle-2025')).toHaveAttribute('aria-checked', 'false')
  })

  it('switching to October confirms first, then commits that exact key', () => {
    const setPricelistYear = jest.fn()
    renderToggle({ lines: [makeFilledLine()], setPricelistYear, pricelistYear: '2026' })
    fireEvent.click(screen.getByTestId('pricelist-toggle-2026-10'))
    expect(screen.getByTestId('pricelist-switch-modal')).toBeInTheDocument()
    expect(setPricelistYear).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('pricelist-switch-confirm'))
    expect(setPricelistYear).toHaveBeenCalledWith('2026-10')
  })

  it('switching away from October back to 2026 works too', () => {
    const setPricelistYear = jest.fn()
    renderToggle({ lines: [makeFilledLine()], setPricelistYear, pricelistYear: '2026-10' })
    fireEvent.click(screen.getByTestId('pricelist-toggle-2026'))
    fireEvent.click(screen.getByTestId('pricelist-switch-confirm'))
    expect(setPricelistYear).toHaveBeenCalledWith('2026')
  })

  // The October list only reprices Moonlight / Sienna / Za-Ha, which most
  // agents cannot sell — for them it is identical to 2026, so Sam asked that
  // only admins and Piotr be offered it.
  describe('who is offered the October list', () => {
    it('an admin is offered it', () => {
      renderToggle({ lines: [makeFilledLine()], profile: ADMIN })
      expect(screen.getByTestId('pricelist-toggle-2026-10')).toBeInTheDocument()
    })

    it('Piotr is offered it', () => {
      renderToggle({ lines: [makeFilledLine()], profile: PIOTR })
      expect(screen.getByTestId('pricelist-toggle-2026-10')).toBeInTheDocument()
    })

    it('Piotr is matched regardless of how his email is capitalised', () => {
      renderToggle({
        lines: [makeFilledLine()],
        profile: { role: 'agent', email: '  Piotr.Kicinski84@Gmail.COM ' },
      })
      expect(screen.getByTestId('pricelist-toggle-2026-10')).toBeInTheDocument()
    })

    it('any other agent is not, and still gets 2025 and 2026', () => {
      renderToggle({ lines: [makeFilledLine()], profile: PLAIN_AGENT })
      expect(screen.queryByTestId('pricelist-toggle-2026-10')).not.toBeInTheDocument()
      expect(screen.getByTestId('pricelist-toggle-2025')).toBeInTheDocument()
      expect(screen.getByTestId('pricelist-toggle-2026')).toBeInTheDocument()
    })

    it('a signed-out / profile-less render is not offered it either', () => {
      renderToggle({ lines: [makeFilledLine()], profile: null })
      expect(screen.queryByTestId('pricelist-toggle-2026-10')).not.toBeInTheDocument()
    })

    it('mentions October in the tooltip only for those who can pick it', () => {
      const { unmount } = renderToggle({ lines: [makeFilledLine()], profile: ADMIN })
      expect(screen.getByTestId('pricelist-toggle')).toHaveAttribute(
        'title', expect.stringContaining('October'),
      )
      unmount()

      renderToggle({ lines: [makeFilledLine()], profile: PLAIN_AGENT })
      expect(screen.getByTestId('pricelist-toggle').getAttribute('title'))
        .not.toContain('October')
    })

    // A document priced in October may be reopened by anyone. Dropping the
    // button would leave no list highlighted while October prices are on
    // screen, so the active list is always shown even when it is off-limits.
    it('still shows the October button to an agent already on that list', () => {
      renderToggle({ lines: [makeFilledLine()], profile: PLAIN_AGENT, pricelistYear: '2026-10' })
      const btn = screen.getByTestId('pricelist-toggle-2026-10')
      expect(btn).toBeInTheDocument()
      expect(btn).toHaveAttribute('aria-checked', 'true')
    })

    it('lets that agent move off October, but not back onto it', () => {
      const setPricelistYear = jest.fn()
      const { unmount } = renderToggle({
        lines: [makeFilledLine()], profile: PLAIN_AGENT, pricelistYear: '2026-10', setPricelistYear,
      })
      fireEvent.click(screen.getByTestId('pricelist-toggle-2026'))
      fireEvent.click(screen.getByTestId('pricelist-switch-confirm'))
      expect(setPricelistYear).toHaveBeenCalledWith('2026')
      unmount()

      renderToggle({ lines: [makeFilledLine()], profile: PLAIN_AGENT, pricelistYear: '2026' })
      expect(screen.queryByTestId('pricelist-toggle-2026-10')).not.toBeInTheDocument()
    })
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
