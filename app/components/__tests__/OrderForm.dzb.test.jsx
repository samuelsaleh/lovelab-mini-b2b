/**
 * OrderForm — DZB Bank invoice option tests.
 *
 * Guarantees:
 *   - The DZB yes/no toggle is gated to Nicolas + admins only.
 *   - When enabled, the fixed DZB payment block (supplier number, client
 *     adhérent number, subrogation sentence) renders inside the printable
 *     area so it lands on the PDF.
 *   - The DZB fields are persisted in metadata (both formState and top-level,
 *     the latter being what gets forwarded to Hardik's system).
 *   - A saved order with dzbEnabled round-trips back into the form on re-edit.
 */

import React from 'react'
import { render, screen, within, fireEvent } from '@testing-library/react'
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

// Capture the props handed to SaveDocumentModal so we can assert on the
// metadata payload the order form assembles. The holder is prefixed with
// "mock" so Jest allows referencing it inside the hoisted factory.
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

function getDzbRow() {
  const label = screen.getByText(/DZB Bank/)
  return label.closest('div')
}

describe('OrderForm — DZB Bank option gating', () => {
  it('shows the DZB toggle for Nicolas', () => {
    renderForm({ currentUser: { full_name: 'Nicolas', email: 'nicolas.vial@ascension-france.com' } })
    expect(screen.getByText(/DZB Bank/)).toBeInTheDocument()
  })

  it('shows the DZB toggle for an admin', () => {
    renderForm({ currentUser: { full_name: 'Admin', email: 'admin@love-lab.com', role: 'admin' } })
    expect(screen.getByText(/DZB Bank/)).toBeInTheDocument()
  })

  it('hides the DZB toggle for a regular agent', () => {
    renderForm({ currentUser: { full_name: 'Marc', email: 'marc@love-lab.com' } })
    expect(screen.queryByText(/DZB Bank/)).not.toBeInTheDocument()
  })
})

describe('OrderForm — DZB payment block on the PDF', () => {
  it('renders the fixed DZB block when enabled with a client number', () => {
    renderForm({ currentUser: { email: 'nicolas.vial@ascension-france.com' } })

    // Block is hidden until the toggle is set to "yes".
    expect(screen.queryByText(/Numéro fournisseur DZB/)).not.toBeInTheDocument()

    const row = getDzbRow()
    fireEvent.click(within(row).getByText('yes'))

    const input = within(getDzbRow()).getByPlaceholderText('Client DZB number')
    fireEvent.change(input, { target: { value: '9988776655' } })

    expect(screen.getByText(/Numéro fournisseur DZB: 1350017080/)).toBeInTheDocument()
    expect(screen.getByText(/Numéro adhérent DZB du client: 9988776655/)).toBeInTheDocument()
    expect(
      screen.getByText(/Veuillez effectuer votre paiement directement à l'ordre de DZB BANK GmbH qui le reçoit par subrogation\./),
    ).toBeInTheDocument()
  })

  it('does not render the DZB block while the toggle is "no"', () => {
    renderForm({ currentUser: { email: 'nicolas.vial@ascension-france.com' } })
    expect(screen.queryByText(/Numéro fournisseur DZB/)).not.toBeInTheDocument()
  })
})

describe('OrderForm — DZB metadata persistence', () => {
  it('passes dzb fields to SaveDocumentModal in formState and at top level', () => {
    mockModal.props = null
    renderForm({ currentUser: { email: 'nicolas.vial@ascension-france.com' } })

    const row = getDzbRow()
    fireEvent.click(within(row).getByText('yes'))
    fireEvent.change(
      within(getDzbRow()).getByPlaceholderText('Client DZB number'),
      { target: { value: '4455667788' } },
    )

    const { metadata } = mockModal.props
    expect(metadata.dzbEnabled).toBe(true)
    expect(metadata.dzbClientNumber).toBe('4455667788')
    expect(metadata.dzbSupplierNumber).toBe('1350017080')
    expect(metadata.formState.dzbEnabled).toBe(true)
    expect(metadata.formState.dzbClientNumber).toBe('4455667788')
    expect(metadata.formState.dzbSupplierNumber).toBe('1350017080')
  })
})

describe('OrderForm — DZB restore on re-edit', () => {
  it('rehydrates the toggle, number and block from a saved order', () => {
    renderForm({
      currentUser: { email: 'nicolas.vial@ascension-france.com' },
      savedFormState: { rows: [], dzbEnabled: true, dzbClientNumber: '5551234' },
    })

    const input = within(getDzbRow()).getByPlaceholderText('Client DZB number')
    expect(input.value).toBe('5551234')
    expect(screen.getByText(/Numéro adhérent DZB du client: 5551234/)).toBeInTheDocument()
    expect(screen.getByText(/Numéro fournisseur DZB: 1350017080/)).toBeInTheDocument()
  })
})
