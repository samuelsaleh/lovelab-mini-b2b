/**
 * BuilderPage — step 1 fixed Continue bar on compact viewports.
 *
 * The "Continue to Configure" action must stay pinned at the bottom of the
 * screen on phone/iPad so agents never have to scroll past the collection grid.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { renderWithI18n } from './testUtils'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => true,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: true, isTablet: false, isDesktop: false, isCompact: true }),
}))

jest.mock('@/lib/api', () => ({ sendBuilderChat: jest.fn() }))

const BuilderPage = require('../BuilderPage').default

function renderBuilder() {
  return renderWithI18n(
    <BuilderPage
      lines={[]}
      setLines={jest.fn()}
      onGenerateQuote={jest.fn()}
      budget=""
      setBudget={jest.fn()}
      budgetRecommendations={null}
      showRecommendations={false}
      setShowRecommendations={jest.fn()}
      onRequestRecommendations={jest.fn()}
      orderChannel="b2b"
      pricelistYear="2026"
      setPricelistYear={jest.fn()}
      isAdmin={false}
    />
  )
}

describe('BuilderPage — fixed Continue bar (compact step 1)', () => {
  it('renders the pinned continue bar on compact when on the select step', () => {
    renderBuilder()
    expect(screen.getByTestId('continue-to-configure-bar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continue to Configure/i })).toBeInTheDocument()
  })
})
