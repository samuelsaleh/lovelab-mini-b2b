/**
 * OrderForm — Synalia toggle tests (mirrors DZB pattern).
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))

jest.mock('@/lib/pdf', () => ({
  generatePDF: jest.fn(),
  downloadPDF: jest.fn(),
  formatDocumentFilename: jest.fn(() => 'order.pdf'),
}))
jest.mock('@/lib/vat', () => ({ validateVAT: jest.fn() }))
jest.mock('@/lib/packshot-lookup', () => ({ findPackshot: () => null }))
jest.mock('../PackshotThumb', () => ({
  __esModule: true,
  default: () => <div data-testid="packshot-thumb" />,
}))

const mockModal = { props: null }
jest.mock('../SaveDocumentModal', () => ({
  __esModule: true,
  default: (props) => {
    mockModal.props = props
    return null
  },
}))

const OrderForm = require('../OrderForm').default
const EMPTY_QUOTE = { lines: [], total: 0, totalPieces: 0 }

function renderForm({ currentUser, savedFormState = null } = {}) {
  return render(
    <I18nProvider>
      <OrderForm
        quote={EMPTY_QUOTE}
        client={{}}
        onClose={jest.fn()}
        currentUser={currentUser}
        savedFormState={savedFormState}
        editingDocumentId={savedFormState ? 'doc-1' : null}
        onEditInBuilder={jest.fn()}
        initialOrderChannel="b2b"
      />
    </I18nProvider>,
  )
}

describe('OrderForm — Synalia option', () => {
  beforeEach(() => {
    mockModal.props = null
  })

  it('shows Synalia toggle for Nicolas', () => {
    renderForm({ currentUser: { email: 'nicolas.vial@ascension-france.com' } })
    expect(screen.getByText(/Synalia/)).toBeInTheDocument()
  })

  it('hides Synalia toggle for other agents', () => {
    renderForm({ currentUser: { email: 'other@example.com', role: 'agent' } })
    expect(screen.queryByText(/^Synalia/)).not.toBeInTheDocument()
  })

  it('persists synalia in metadata when yes is selected', () => {
    renderForm({ currentUser: { email: 'nicolas.vial@ascension-france.com' } })
    fireEvent.click(screen.getAllByText('yes').find((el) => el.closest('div')?.textContent?.includes('Synalia')))
    expect(mockModal.props.metadata.synalia).toBe(true)
    expect(mockModal.props.metadata.formState.synalia).toBe(true)
  })

  it('restores synalia from saved formState', () => {
    renderForm({
      currentUser: { email: 'nicolas.vial@ascension-france.com' },
      savedFormState: { synaliaEnabled: true },
    })
    expect(mockModal.props.metadata.synalia).toBe(true)
  })
})
