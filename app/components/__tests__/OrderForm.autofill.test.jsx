/**
 * OrderForm — the client / contact / address header fields must not be
 * autofillable. The order form writes those values back into the shared
 * `clients` table, so a browser autofill here reaches the same records as the
 * client gate.
 */

import React from 'react'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n'
import { AUTOFILL_OFF } from '@/lib/noAutofill'

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

const SEMANTIC_NAME = /name|mail|tel|phone|organi[sz]ation|company|address|street|city|zip|postal|country/i

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

function expectSuppressed(input) {
  expect(input).toHaveAttribute('autocomplete', AUTOFILL_OFF)
  expect(input).toHaveAttribute('data-1p-ignore')
  expect(input).toHaveAttribute('data-lpignore', 'true')
  expect(input).toHaveAttribute('data-form-type', 'other')
  const name = input.getAttribute('name')
  expect(name).toBeTruthy()
  expect(name).not.toMatch(SEMANTIC_NAME)
}

// The header labels sit next to their input, so walk up to the shared parent.
function fieldAfterLabel(labelText) {
  const label = screen.getAllByText(labelText)[0]
  const input = label.nextElementSibling?.querySelector('input')
  expect(input).toBeTruthy()
  return input
}

describe('OrderForm — autofill suppression on client header fields', () => {
  it('suppresses autofill on company, contact, billing address, VAT, email and phone', () => {
    renderForm({ currentUser: { email: 'marc@love-lab.com' } })

    const labels = [
      'Company Name :',
      'Contact Person :',
      'Billing Address :',
      'VAT Number :',
      'E-mail :',
      'Phone :',
    ]
    for (const label of labels) {
      expectSuppressed(fieldAfterLabel(label))
    }

    for (const placeholder of ['Street address', 'Postal code, City', 'Country']) {
      screen.getAllByPlaceholderText(placeholder).forEach(expectSuppressed)
    }
  })

  it('suppresses autofill on the shipping address fields', () => {
    renderForm({ currentUser: { email: 'marc@love-lab.com' } })

    // Shipping fields only render once the "same as billing" box is cleared.
    expect(screen.getAllByPlaceholderText('Street address')).toHaveLength(1)
    fireEvent.click(screen.getByLabelText(/Shipping address same as billing/i))

    const streets = screen.getAllByPlaceholderText('Street address')
    expect(streets).toHaveLength(2)
    streets.forEach(expectSuppressed)
    screen.getAllByPlaceholderText('Postal code, City').forEach(expectSuppressed)
    screen.getAllByPlaceholderText('Country').forEach(expectSuppressed)
  })

  it('suppresses autofill on the DZB client number', () => {
    renderForm({ currentUser: { email: 'nicolas.vial@ascension-france.com' } })

    const row = screen.getByText(/DZB Bank/).closest('div')
    fireEvent.click(within(row).getByText('yes'))

    expectSuppressed(screen.getByPlaceholderText('Client DZB number'))
  })

  it('gives every suppressed header field a distinct name', () => {
    renderForm({ currentUser: { email: 'marc@love-lab.com' } })

    const names = Array.from(document.querySelectorAll('input[data-form-type="other"]'))
      .map((el) => el.getAttribute('name'))
    // company, contact, address, address 2, country, VAT, email, phone
    expect(names).toHaveLength(8)
    expect(new Set(names).size).toBe(names.length)
  })

  it('keeps the suppression attributes off non-input elements', () => {
    renderForm({ currentUser: { email: 'marc@love-lab.com' } })

    // PrintableInput swaps the input for a plain div in print mode; the extra
    // props must never leak onto that div and end up in the PDF markup.
    const tags = Array.from(document.querySelectorAll('[data-form-type], [data-1p-ignore], [data-lpignore]'))
      .map((el) => el.tagName)
    expect(tags.length).toBeGreaterThan(0)
    expect(new Set(tags)).toEqual(new Set(['INPUT']))
  })
})
