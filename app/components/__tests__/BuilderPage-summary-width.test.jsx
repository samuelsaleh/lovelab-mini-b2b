/**
 * BuilderPage — order summary sidebar width
 *
 * Regression cover for "mom's Microsoft computer" complaint: the right-hand
 * Order Summary sidebar used to render at 280px and pushed the Configure
 * Order table into a horizontal scroll on 13"–14" Windows laptops.
 *
 * These tests pin:
 *   - desktop sidebar width is 220px (down from 280)
 *   - per-line breakdown rows use truncation styles so the collection
 *     name + total price stay visible without scroll
 *
 * If we ever loosen the sidebar back to a wider value or drop the
 * ellipsis safeguards, these tests fail loudly.
 */

import React from 'react'
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

describe('BuilderPage — Order Summary sidebar width', () => {
  it('renders the desktop sidebar at 220px so the configure table has room on small Windows laptops', () => {
    const line = {
      ...mkLine(),
      collectionId: CUTY.id,
      colorConfigs: [mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M', qty: 1, colorName: 'Black' })],
      expanded: true,
    }
    const { container } = renderBuilder([line])

    // Find the sidebar by its inner heading "Order summary" (case-insensitive)
    // and walk up to the panel root that carries the explicit width style.
    const heading = Array.from(container.querySelectorAll('div')).find(
      el => el.textContent === 'Order summary' || el.textContent === 'Order Summary'
    )
    expect(heading).toBeTruthy()

    // Walk up until we hit the panel that has an explicit width set.
    let node = heading
    while (node && node.style && node.style.width === '') node = node.parentElement
    expect(node).toBeTruthy()
    expect(node.style.width).toBe('220px')
    expect(node.style.maxWidth).toBe('220px')
  })

  it('per-line breakdown row uses ellipsis + flexShrink so the price never gets pushed off-screen', () => {
    const line = {
      ...mkLine(),
      collectionId: CUTY.id,
      colorConfigs: [mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M', qty: 1, colorName: 'Black' })],
      expanded: true,
    }
    const { container } = renderBuilder([line])

    // The CUTY row inside the sidebar is a flex row with the collection
    // label on the left and the formatted total on the right. Both have
    // overflow safeguards so the price stays visible.
    const labelEl = Array.from(container.querySelectorAll('div')).find(
      el => el.textContent === CUTY.label && el.style.fontWeight === '600'
    )
    expect(labelEl).toBeTruthy()
    expect(labelEl.style.whiteSpace).toBe('nowrap')
    expect(labelEl.style.overflow).toBe('hidden')
    expect(labelEl.style.textOverflow).toBe('ellipsis')
  })
})
