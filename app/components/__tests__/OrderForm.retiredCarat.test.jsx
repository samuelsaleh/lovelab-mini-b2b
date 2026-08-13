/**
 * OrderForm — a size retired by the October 2026 price list.
 *
 * Moonlight Long 0.20 ct, Moonlight Multi 0.15 / 0.30 ct and Sienna One 0.20 ct
 * were removed from the catalog when the October list shipped. Orders taken
 * before that still contain those rows, and reopening one must not lose the
 * size: a <select> whose value matches no option renders blank and silently
 * drops the carat on the next save.
 *
 * Rows are keyed on the carat STRING everywhere durable (saved documents, pack
 * form_rows), never on its position, which is what makes the removal safe.
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
jest.mock('../SaveDocumentModal', () => ({
  __esModule: true,
  default: () => null,
}))

const OrderForm = require('../OrderForm').default
const { COLLECTIONS } = require('@/lib/catalog')

function renderForm(quote, pricelistYear = '2026-10') {
  return render(
    <I18nProvider>
      <OrderForm
        quote={quote}
        client={{}}
        onClose={jest.fn()}
        currentUser={{ full_name: 'Test', email: 't@example.com', role: 'admin' }}
        savedFormState={null}
        editingDocumentId={null}
        onEditInBuilder={jest.fn()}
        initialOrderChannel="b2b"
        pricelistYear={pricelistYear}
      />
    </I18nProvider>,
  )
}

// An order taken on the old list: Long Moonlight 0.20 ct at its 2026 price.
function retiredSizeQuote() {
  return {
    lines: [{
      product: 'Long Moonlight',
      carat: '0.20',
      certType: 'igi',
      housing: 'Yellow',
      size: 'M',
      closureType: null,
      cordType: null,
      thickness: null,
      colorName: 'Black',
      qty: 2,
      unitB2B: 82,
      lineTotal: 164,
    }],
    subtotal: 164,
    total: 164,
    totalPieces: 2,
  }
}

const combos = () => screen.getAllByRole('combobox')
const caratSelects = () => combos().filter((s) =>
  Array.from(s.options || []).some((o) => /^\d+\.\d+ ct$/.test(o.text)),
)

describe('OrderForm — a carat retired from the catalog', () => {
  it('is really gone from the catalog (guards the fixture)', () => {
    const mno = COLLECTIONS.find((c) => c.id === 'MNO')
    expect(mno.carats).not.toContain('0.20')
  })

  it('keeps the retired size selected instead of blanking the cell', () => {
    renderForm(retiredSizeQuote())
    const carat = caratSelects().find((s) => s.value === '0.20')
    expect(carat).toBeTruthy()
  })

  it('offers the retired size as an option so it survives the next save', () => {
    renderForm(retiredSizeQuote())
    const carat = caratSelects().find((s) => s.value === '0.20')
    expect(Array.from(carat.options).map((o) => o.text)).toContain('0.20')
  })

  it('still offers the sizes that are on sale', () => {
    renderForm(retiredSizeQuote())
    const carat = caratSelects().find((s) => s.value === '0.20')
    const labels = Array.from(carat.options).map((o) => o.text)
    expect(labels).toContain('0.05 ct')
    expect(labels).toContain('0.10 ct')
    expect(labels).toContain('0.30 ct')
  })

  it('renders the row total from the saved unit price, not a re-lookup', () => {
    renderForm(retiredSizeQuote())
    // €82 × 2 — a re-price against a list where 0.20 no longer exists would
    // have produced €0 here.
    expect(screen.getAllByDisplayValue('82').length).toBeGreaterThan(0)
  })

  it('does not offer an October-only size when the 2026 list is active', () => {
    const quote = {
      lines: [{
        product: 'Multi Moonlight',
        carat: '0.40',
        certType: 'igi',
        housing: 'Yellow',
        size: 'M',
        closureType: null,
        colorName: 'Black',
        qty: 2,
        unitB2B: 130,
        lineTotal: 260,
      }],
      subtotal: 260,
      total: 260,
      totalPieces: 2,
    }
    renderForm(quote, '2026')
    const carat = caratSelects().find((s) => s.value === '0.40')
    const labels = Array.from(carat.options).map((o) => o.text)
    expect(labels).toContain('0.20 ct')
    expect(labels).not.toContain('0.70 ct')
    expect(labels).not.toContain('1.10 ct')
  })

  // The badge sits in the printed page header, so whatever it says lands on the
  // client's PDF — it has to name the October list, not just "2026".
  it('names the active price list in the printed header', () => {
    renderForm(retiredSizeQuote(), '2026-10')
    expect(screen.getByTestId('orderform-pricelist-badge')).toHaveTextContent('2026 prices (from Oct.)')
  })

  it('names the 2026 list when that is the active one', () => {
    renderForm(retiredSizeQuote(), '2026')
    expect(screen.getByTestId('orderform-pricelist-badge')).toHaveTextContent('2026 prices')
  })

  it('offers the October-only sizes when the October list is active', () => {
    const quote = {
      lines: [{
        product: 'Multi Moonlight',
        carat: '0.40',
        certType: 'igi',
        housing: 'Yellow',
        size: 'M',
        closureType: null,
        colorName: 'Black',
        qty: 2,
        unitB2B: 150,
        lineTotal: 300,
      }],
      subtotal: 300,
      total: 300,
      totalPieces: 2,
    }
    renderForm(quote, '2026-10')
    const carat = caratSelects().find((s) => s.value === '0.40')
    const labels = Array.from(carat.options).map((o) => o.text)
    expect(labels).toContain('0.70 ct')
    expect(labels).toContain('1.10 ct')
  })
})
