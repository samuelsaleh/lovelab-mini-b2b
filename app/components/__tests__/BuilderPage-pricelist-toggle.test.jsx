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

const ALBERTO = { role: 'admin', email: 'alberto@love-lab.com' }
const DIONNE = { role: 'agent', email: 'dionne@love-lab.com' }
const ADMIN = { role: 'admin', email: 'admin@example.com' }
const PIOTR = { role: 'agent', email: 'piotr.kicinski84@gmail.com' }
const PLAIN_AGENT = { role: 'agent', email: 'agent@example.com' }

// Defaults to Alberto because toggle-mechanics cases need all three lists.
function renderToggle({
  lines = [],
  setPricelistYear = jest.fn(),
  pricelistYear = '2026-10',
  profile = ALBERTO,
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
  it('renders a button per pricelist in the Step 2 header for Alberto', () => {
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

  // October is the default for everyone. 2025 / 2026 stay Alberto/Dionne-only.
  describe('who is offered which lists', () => {
    it('Alberto and Dionne are offered all three lists', () => {
      for (const profile of [ALBERTO, DIONNE]) {
        const { unmount } = renderToggle({ lines: [makeFilledLine()], profile })
        expect(screen.getByTestId('pricelist-toggle-2025')).toBeInTheDocument()
        expect(screen.getByTestId('pricelist-toggle-2026')).toBeInTheDocument()
        expect(screen.getByTestId('pricelist-toggle-2026-10')).toBeInTheDocument()
        unmount()
      }
    })

    it('Dionne is matched regardless of how her email is capitalised', () => {
      renderToggle({
        lines: [makeFilledLine()],
        profile: { role: 'agent', email: '  Dionne@Love-Lab.COM ' },
      })
      expect(screen.getByTestId('pricelist-toggle-2025')).toBeInTheDocument()
    })

    it('a plain agent only has October — toggle is hidden (single choice)', () => {
      renderToggle({ lines: [makeFilledLine()], profile: PLAIN_AGENT, pricelistYear: '2026-10' })
      expect(screen.queryByTestId('pricelist-toggle')).not.toBeInTheDocument()
      expect(screen.queryByTestId('pricelist-toggle-2026-10')).not.toBeInTheDocument()
      expect(screen.queryByTestId('pricelist-toggle-2025')).not.toBeInTheDocument()
    })

    it('Piotr and non-allowlisted admins also only get October (toggle hidden)', () => {
      for (const profile of [PIOTR, ADMIN]) {
        const { unmount } = renderToggle({ lines: [makeFilledLine()], profile, pricelistYear: '2026-10' })
        expect(screen.queryByTestId('pricelist-toggle')).not.toBeInTheDocument()
        unmount()
      }
    })

    it('a signed-out / profile-less render hides the toggle (October only)', () => {
      renderToggle({ lines: [makeFilledLine()], profile: null, pricelistYear: '2026-10' })
      expect(screen.queryByTestId('pricelist-toggle')).not.toBeInTheDocument()
    })

    it('mentions October in the tooltip when the toggle is shown', () => {
      renderToggle({ lines: [makeFilledLine()], profile: ALBERTO })
      expect(screen.getByTestId('pricelist-toggle')).toHaveAttribute(
        'title', expect.stringContaining('October'),
      )
    })

    // A document priced on a legacy list may be reopened by anyone. The active
    // list is always offered, so the toggle reappears with two choices.
    it('still shows the toggle when a plain agent reopens a 2025-priced document', () => {
      renderToggle({ lines: [makeFilledLine()], profile: PLAIN_AGENT, pricelistYear: '2025' })
      expect(screen.getByTestId('pricelist-toggle')).toBeInTheDocument()
      expect(screen.getByTestId('pricelist-toggle-2025')).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByTestId('pricelist-toggle-2026-10')).toBeInTheDocument()
      expect(screen.queryByTestId('pricelist-toggle-2026')).not.toBeInTheDocument()
    })

    it('lets an agent move off a legacy list onto October', () => {
      const setPricelistYear = jest.fn()
      renderToggle({
        lines: [makeFilledLine()], profile: PLAIN_AGENT, pricelistYear: '2026', setPricelistYear,
      })
      fireEvent.click(screen.getByTestId('pricelist-toggle-2026-10'))
      fireEvent.click(screen.getByTestId('pricelist-switch-confirm'))
      expect(setPricelistYear).toHaveBeenCalledWith('2026-10')
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
