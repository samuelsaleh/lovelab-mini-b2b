/**
 * Re-opening an incoming website order must show the same header for every
 * user. Missing Order by / VAT / street stay empty — leftover ClientGate
 * data and the logged-in name must not fill the gaps.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
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
jest.mock('../SaveDocumentModal', () => ({ __esModule: true, default: () => null }))

const OrderForm = require('../OrderForm').default

const EMPTY_QUOTE = { lines: [], total: 0, totalPieces: 0 }

const LEFTOVER_CLIENT = {
  company: 'LoveLab leftover',
  name: 'Should Not Appear',
  address: 'Kwikstaartlaan 3',
  zip: '2610',
  city: 'Antwerpen',
  country: 'Belgium',
  vat: 'BE1039054397',
  vatValid: true,
  email: 'old@example.com',
  phone: '+32 000',
}

const JULIE_FORM = {
  contactName: 'Julie Kochem',
  email: 'juliesjewellery@web.de',
  phone: '+49 152 54233883',
  country: 'Germany',
  rows: [{
    no: 1,
    quantity: 5,
    collection: 'CUTY',
    type: 'Bracelet',
    carat: '0.05',
    unitPrice: 24,
    total: 120,
  }],
}

function fieldAfterLabel(labelText) {
  const label = screen.getAllByText(labelText)[0]
  const input = label.nextElementSibling?.querySelector('input')
    || label.parentElement?.querySelector('input')
  expect(input).toBeTruthy()
  return input
}

function renderForm({
  currentUser,
  client = LEFTOVER_CLIENT,
  savedFormState = JULIE_FORM,
  editingDocumentId = 'doc-julie',
} = {}) {
  return render(
    <I18nProvider>
      <OrderForm
        quote={EMPTY_QUOTE}
        client={client}
        onClose={jest.fn()}
        currentUser={currentUser}
        savedFormState={savedFormState}
        editingDocumentId={editingDocumentId}
        onEditInBuilder={jest.fn()}
        initialOrderChannel="b2b"
      />
    </I18nProvider>,
  )
}

describe('OrderForm — incoming website order re-edit', () => {
  it('leaves Order by, VAT and street empty when the snapshot does not have them', () => {
    renderForm({ currentUser: { full_name: 'Sam Saleh', email: 'sam@love-lab.com', role: 'admin' } })

    expect(fieldAfterLabel('Order by (LoveLab) :')).toHaveValue('')
    expect(fieldAfterLabel('VAT Number :')).toHaveValue('')
    expect(screen.getByPlaceholderText('Street address')).toHaveValue('')
    expect(screen.getByPlaceholderText('Postal code, City')).toHaveValue('')
    expect(screen.getByPlaceholderText('Country')).toHaveValue('Germany')
    expect(fieldAfterLabel('Company Name :')).toHaveValue('')
    expect(fieldAfterLabel('E-mail :')).toHaveValue('juliesjewellery@web.de')
    expect(fieldAfterLabel('Phone :')).toHaveValue('+49 152 54233883')
    expect(screen.getByDisplayValue('Julie Kochem')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Sam Saleh')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('BE1039054397')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Kwikstaartlaan 3')).not.toBeInTheDocument()
  })

  it('shows the same empty Order by for a different logged-in admin', () => {
    renderForm({ currentUser: { full_name: 'Hardik Koladiya', email: 'hardik@example.com', role: 'admin' } })

    expect(fieldAfterLabel('Order by (LoveLab) :')).toHaveValue('')
    expect(screen.queryByDisplayValue('Hardik Koladiya')).not.toBeInTheDocument()
  })

  it('keeps Order by / VAT / address when they are actually on the saved order', () => {
    renderForm({
      currentUser: { full_name: 'Sam Saleh', email: 'sam@love-lab.com', role: 'admin' },
      savedFormState: {
        ...JULIE_FORM,
        createdBy: 'Alberto',
        vatNumber: 'DE999',
        addressLine1: 'Hauptstrasse 1',
        addressLine2: '80331 München',
      },
    })

    expect(fieldAfterLabel('Order by (LoveLab) :')).toHaveValue('Alberto')
    expect(fieldAfterLabel('VAT Number :')).toHaveValue('DE999')
    expect(screen.getByPlaceholderText('Street address')).toHaveValue('Hauptstrasse 1')
    expect(screen.getByPlaceholderText('Postal code, City')).toHaveValue('80331 München')
    expect(screen.queryByDisplayValue('Sam Saleh')).not.toBeInTheDocument()
  })

  it('still defaults Order by to the logged-in user on a brand-new order', () => {
    renderForm({
      currentUser: { full_name: 'Sam Saleh', email: 'sam@love-lab.com', role: 'admin' },
      client: { company: 'GALA', vat: 'FR1', address: '9 rue', country: 'France' },
      savedFormState: null,
      editingDocumentId: null,
    })

    expect(fieldAfterLabel('Order by (LoveLab) :')).toHaveValue('Sam Saleh')
    expect(fieldAfterLabel('VAT Number :')).toHaveValue('FR1')
    expect(fieldAfterLabel('Company Name :')).toHaveValue('GALA')
  })
})
