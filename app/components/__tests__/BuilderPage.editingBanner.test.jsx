/**
 * The Builder must say when it is modifying an existing order.
 *
 * Editing and creating used to look identical in the Builder, and Finalize
 * treated both as new — which is how an edit ended up saved as a second
 * document under the wrong client. The banner is the visible half of the
 * fix; the state half lives in lib/editFlow.js.
 */

import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithI18n } from './testUtils'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))
jest.mock('@/lib/api', () => ({ sendBuilderChat: jest.fn() }))

const BuilderPage = require('../BuilderPage').default

function renderBuilder(props = {}) {
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
      {...props}
    />
  )
}

describe('BuilderPage — editing banner', () => {
  it('shows nothing for a new build', () => {
    renderBuilder()
    expect(screen.queryByTestId('builder-editing-banner')).not.toBeInTheDocument()
  })

  it('names the order being edited and says Finalize will update it', () => {
    renderBuilder({ editingLabel: 'Editing order for Cerise' })
    const banner = screen.getByTestId('builder-editing-banner')
    expect(banner).toHaveTextContent('Editing order for Cerise')
    expect(banner).toHaveTextContent(/update the saved order/i)
  })

  it('stacks with the channel banner rather than replacing it', () => {
    renderBuilder({ editingLabel: 'Editing order for Cerise', orderChannel: 'consignment' })
    expect(screen.getByTestId('builder-editing-banner')).toBeInTheDocument()
    expect(screen.getByText(/Building: Consignment/i)).toBeInTheDocument()
  })
})
