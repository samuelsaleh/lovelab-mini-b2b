/**
 * OrderForm — table column fit regression tests.
 *
 * Guards against the "order PDF stops at COLOR CORD" bug (2026-07-08):
 * the COLUMNS pixel widths summed to more than the page card's maxWidth,
 * and with tableLayout:'fixed' the table overflowed the card, so the PDF
 * capture (which clips at the card's box) cut off the UNIT PRICE and
 * TOTAL columns.
 *
 * Guarantees:
 *   - Every <col> in the order table uses a percentage width (so the
 *     fixed-layout table can never grow wider than its container,
 *     regardless of how many columns are added or how wide they are).
 *   - The percentages sum to ~100%.
 *   - The rightmost headers (Unit Price / Total) are actually rendered.
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

function renderForm() {
  return render(
    <I18nProvider>
      <OrderForm
        quote={{ lines: [], total: 0, totalPieces: 0 }}
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

describe('OrderForm — column fit (print/PDF cutoff regression)', () => {
  it('uses percentage <col> widths that sum to ~100% so the table always fits the page', () => {
    const { container } = renderForm()

    const tables = Array.from(container.querySelectorAll('table')).filter(
      t => t.querySelector('colgroup col'),
    )
    expect(tables.length).toBeGreaterThan(0)

    for (const table of tables) {
      const cols = Array.from(table.querySelectorAll('colgroup col'))
      expect(cols.length).toBeGreaterThan(0)

      let sum = 0
      for (const col of cols) {
        const width = col.style.width
        // Every col must be percentage-based; a raw px width is exactly what
        // let the table overflow the page card and get clipped in the PDF.
        expect(width).toMatch(/%$/)
        sum += parseFloat(width)
      }
      expect(sum).toBeCloseTo(100, 1)
    }
  })

  it('renders the rightmost Unit Price and Total headers', () => {
    renderForm()
    expect(screen.getAllByText('Unit Price (EUR)').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Total (EUR)').length).toBeGreaterThan(0)
  })
})
