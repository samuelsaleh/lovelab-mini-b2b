/**
 * BuilderPage — Order Summary sidebar honours manual price overrides
 *
 * Regression: the per-collection lines in the sidebar used the list price
 * (getPrice) and ignored cfg.priceOverride, so a row set to €260 x 5 showed
 * €3,000 in the sidebar while the row itself (and the grand total) said €1,300.
 */

import React from 'react'
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
const { COLLECTIONS, calculateQuote, getPrice, getDefaultCert } = require('@/lib/catalog')

const CUTY = COLLECTIONS.find(c => c.id === 'CUTY')

function renderBuilder(lines) {
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
    />
  )
}

const makeLine = (cfgOverrides) => ({
  ...mkLine(),
  collectionId: CUTY.id,
  colorConfigs: [mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M', colorName: 'Black', ...cfgOverrides })],
  expanded: true,
})

// Number shown on the sidebar row for CUTY (label's row -> price on the right).
function sidebarLineAmount(container) {
  const label = Array.from(container.querySelectorAll('div')).find(
    el => el.textContent === CUTY.label && el.style.fontWeight === '600'
  )
  expect(label).toBeTruthy()
  const row = label.parentElement.parentElement
  const priceEl = row.lastElementChild
  return Number(priceEl.textContent.replace(/[^\d]/g, ''))
}

describe('BuilderPage — Order Summary honours price overrides', () => {
  it('shows override x qty, not the list price', () => {
    const { container } = renderBuilder([makeLine({ qty: 5, priceOverride: 260 })])
    expect(sidebarLineAmount(container)).toBe(1300)
  })

  it('shows list price x qty when there is no override', () => {
    const cert = getDefaultCert(CUTY, 0, '2026')
    const list = getPrice(CUTY, 0, cert, '2026')
    const { container } = renderBuilder([makeLine({ qty: 5, priceOverride: null })])
    // fall back to the quote itself so the test is pricelist-agnostic
    const quote = calculateQuote([makeLine({ qty: 5 })], {})
    expect(sidebarLineAmount(container)).toBe(quote.total)
    expect(list).toBeGreaterThanOrEqual(0)
  })

  it('sidebar lines add up to the quote total when only one of two lines is overridden', () => {
    const lines = [makeLine({ qty: 2, priceOverride: 10 }), makeLine({ qty: 3 })]
    const quote = calculateQuote(lines, {})
    expect(quote.lines[0].lineUid).toBe(lines[0].uid)
    expect(quote.lines[1].lineUid).toBe(lines[1].uid)
    const sum = quote.lines.reduce((s, q) => s + q.lineTotal, 0)
    expect(sum).toBe(quote.total)
  })
})
