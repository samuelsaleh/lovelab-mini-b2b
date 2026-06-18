/**
 * OrderForm — bracelet thread closure column tests.
 *
 * Guarantees:
 *   - The "Closure" column header is always present (it's part of COLUMNS).
 *   - For a CUTY row (hasClosure: true), the closure cell renders the
 *     localised value coming from the quote (`closureType: 'braided'`
 *     → "Braided"); the cell is editable (a real <select>).
 *   - For a non-CUTY/CUBIX row, the closure cell shows the "N/A" em-dash
 *     so users don't accidentally pick a closure for HOLY/M3/etc.
 */

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))

// PDF + VAT helpers reach out to network/runtime APIs we don't need here.
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
jest.mock('../SaveDocumentModal', () => ({
  __esModule: true,
  default: () => null,
}))

const OrderForm = require('../OrderForm').default

function renderForm(quote) {
  return render(
    <I18nProvider>
      <OrderForm
        quote={quote}
        client={{}}
        onClose={jest.fn()}
        currentUser={{ full_name: 'Test', email: 't@example.com' }}
        savedFormState={null}
        editingDocumentId={null}
        onEditInBuilder={jest.fn()}
        initialOrderChannel="b2b"
      />
    </I18nProvider>,
  )
}

describe('OrderForm — closure column', () => {
  it('renders the "Closure" column header', () => {
    renderForm({ lines: [], total: 0, totalPieces: 0 })
    // Column header text comes from the i18n key 'order.columns.closure'.
    expect(screen.getAllByText('Closure').length).toBeGreaterThan(0)
  })

  it('renders an editable closure select for a CUTY row with closureType: braided', () => {
    const quote = {
      lines: [{
        product: 'CUTY',
        carat: '0.10',
        certType: 'igi',
        housing: 'Yellow',
        size: 'M',
        closureType: 'braided',
        colorName: 'Black',
        qty: 3,
        unitB2B: 40,
        lineTotal: 120,
        retailUnit: 155,
        retailTotal: 465,
      }],
      subtotal: 120,
      total: 120,
      totalPieces: 3,
    }
    renderForm(quote)

    // The row's closure dropdown should be a real <select> with the user's
    // choice currently selected. We look for a select that contains a
    // "Braided" option AND has it picked.
    const selects = screen.getAllByRole('combobox')
    const closureSelect = selects.find(s =>
      Array.from(s.options || []).some(o => o.text === 'Braided'),
    )
    expect(closureSelect).toBeTruthy()
    expect(closureSelect.value).toBe('braided')
  })

  it('renders the em-dash N/A in the closure cell for a non-closure collection (M3)', () => {
    const quote = {
      lines: [{
        product: 'MULTI THREE',
        carat: '0.10',
        certType: 'igi',
        housing: 'WWW',
        multiAttached: true,
        size: 'M',
        closureType: null,
        colorName: 'White',
        qty: 1,
        unitB2B: 95,
        lineTotal: 95,
      }],
      subtotal: 95,
      total: 95,
      totalPieces: 1,
    }
    renderForm(quote)

    // No <select> in the document should expose a "Braided" option for an
    // M3 row — the closure cell falls back to the N/A em-dash instead.
    const selects = screen.queryAllByRole('combobox')
    const braidedSelect = selects.find(s =>
      Array.from(s.options || []).some(o => o.text === 'Braided'),
    )
    expect(braidedSelect).toBeUndefined()

    // The em-dash placeholder should appear at least once (multiple N/A
    // cells like shape/setting also use it).
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
