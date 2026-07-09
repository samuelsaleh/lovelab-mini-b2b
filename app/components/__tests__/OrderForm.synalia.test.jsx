/**
 * OrderForm — jeweler group dropdown tests.
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

  it('shows jeweler group dropdown for Nicolas', () => {
    renderForm({ currentUser: { email: 'nicolas.vial@ascension-france.com' } })
    expect(screen.getByLabelText('Jeweler group')).toBeInTheDocument()
  })

  it('shows jeweler group dropdown for admins', () => {
    renderForm({ currentUser: { email: 'admin@example.com', role: 'admin' } })
    expect(screen.getByLabelText('Jeweler group')).toBeInTheDocument()
  })

  it('hides jeweler group dropdown for other agents', () => {
    renderForm({ currentUser: { email: 'other@example.com', role: 'agent' } })
    expect(screen.queryByLabelText('Jeweler group')).not.toBeInTheDocument()
  })

  it('persists SYNALIA group and derived synalia metadata when selected', () => {
    renderForm({ currentUser: { email: 'nicolas.vial@ascension-france.com' } })
    fireEvent.change(screen.getByLabelText('Jeweler group'), { target: { value: 'SYNALIA' } })
    expect(mockModal.props.metadata.jewelerGroup).toBe('SYNALIA')
    expect(mockModal.props.metadata.formState.jewelerGroup).toBe('SYNALIA')
    expect(mockModal.props.metadata.synalia).toBe(true)
    expect(mockModal.props.metadata.formState.synalia).toBe(true)
  })

  it('persists non-SYNALIA groups without including them in SYNALIA reporting', () => {
    renderForm({ currentUser: { email: 'nicolas.vial@ascension-france.com' } })
    fireEvent.change(screen.getByLabelText('Jeweler group'), { target: { value: 'MG' } })
    expect(mockModal.props.metadata.jewelerGroup).toBe('MG')
    expect(mockModal.props.metadata.formState.jewelerGroup).toBe('MG')
    expect(mockModal.props.metadata.synalia).toBe(false)
    expect(mockModal.props.metadata.formState.synalia).toBe(false)

    fireEvent.change(screen.getByLabelText('Jeweler group'), { target: { value: 'JOAILLIERS_ORFEVRES' } })
    expect(mockModal.props.metadata.jewelerGroup).toBe('JOAILLIERS_ORFEVRES')
    expect(mockModal.props.metadata.synalia).toBe(false)
  })

  it('restores legacy synalia from saved formState as SYNALIA', () => {
    renderForm({
      currentUser: { email: 'nicolas.vial@ascension-france.com' },
      savedFormState: { synaliaEnabled: true },
    })
    expect(screen.getByLabelText('Jeweler group')).toHaveValue('SYNALIA')
    expect(mockModal.props.metadata.jewelerGroup).toBe('SYNALIA')
    expect(mockModal.props.metadata.synalia).toBe(true)
  })
})
