/**
 * OrderForm — Shapy Shine rules in the order grid (BVB list 1.1 + 1.2).
 *
 * Guarantees the printable/editable grid enforces the same rules as the
 * builder, since an agent can edit a row here after the quote was built:
 *   - 0.10 ct offers Bezel only, and no Pink metal at any size
 *   - 0.10 ct hides Cushion from the shape cell
 *   - the closure cell is locked to Braided (no non-braided option)
 *   - a row loaded from an order saved as non-braided displays as braided
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

function ssfQuote(overrides = {}) {
  const line = {
    product: 'SHAPY SHINE FANCY',
    carat: '0.30',
    certType: 'igi',
    shape: 'Pear',
    housing: 'Prong Yellow',
    size: 'M',
    closureType: 'braided',
    colorName: 'Black',
    qty: 2,
    unitB2B: 100,
    lineTotal: 200,
    retailUnit: 330,
    retailTotal: 660,
    ...overrides,
  }
  return { lines: [line], subtotal: line.lineTotal, total: line.lineTotal, totalPieces: line.qty }
}

// Cells have no accessible labels, so find each select by a sentinel option.
function selectContaining(sentinel) {
  return screen
    .getAllByRole('combobox')
    .find(sel => Array.from(sel.options || []).some(o => o.text === sentinel))
}

function optionTexts(select) {
  return Array.from(select.options).map(o => o.text).filter(Boolean)
}

describe('OrderForm — Shapy Shine setting cell', () => {
  it('offers Bezel and Prongs at 0.30 ct', () => {
    renderForm(ssfQuote({ carat: '0.30' }))
    const setting = selectContaining('Prongs')
    expect(setting).toBeTruthy()
    expect(optionTexts(setting)).toEqual(expect.arrayContaining(['Bezel', 'Prongs']))
  })

  it('offers Bezel only at 0.10 ct', () => {
    renderForm(ssfQuote({ carat: '0.10', housing: 'Bezel Yellow', unitB2B: 55, lineTotal: 110 }))
    const setting = selectContaining('Bezel')
    expect(setting).toBeTruthy()
    expect(optionTexts(setting)).toEqual(['Bezel'])
    expect(screen.queryByRole('option', { name: 'Prongs' })).not.toBeInTheDocument()
  })
})

describe('OrderForm — Shapy Shine metal cell', () => {
  it.each(['0.10', '0.30', '0.50'])('never offers Pink at %s ct', (carat) => {
    renderForm(ssfQuote({ carat, housing: 'Bezel Yellow' }))
    const metal = selectContaining('Yellow')
    expect(metal).toBeTruthy()
    expect(optionTexts(metal)).toEqual(expect.arrayContaining(['Yellow', 'White']))
    expect(optionTexts(metal)).not.toContain('Pink')
  })
})

describe('OrderForm — Shapy Shine shape cell', () => {
  it('hides Cushion at 0.10 ct', () => {
    renderForm(ssfQuote({ carat: '0.10', shape: 'Pear', housing: 'Bezel Yellow' }))
    const shape = selectContaining('Marquise')
    expect(shape).toBeTruthy()
    expect(optionTexts(shape)).toEqual(expect.arrayContaining(['Heart', 'Pear', 'Marquise', 'Oval', 'Emerald']))
    expect(optionTexts(shape)).not.toContain('Cushion')
  })

  it('offers Cushion at 0.30 ct but never Long Cushion', () => {
    renderForm(ssfQuote({ carat: '0.30' }))
    const shape = selectContaining('Cushion')
    expect(shape).toBeTruthy()
    expect(optionTexts(shape)).toContain('Cushion')
    expect(optionTexts(shape)).not.toContain('Long Cushion')
  })
})

describe('OrderForm — Shapy Shine closure cell', () => {
  it('is locked to Braided (no non-braided option)', () => {
    renderForm(ssfQuote())
    const closure = selectContaining('Braided')
    expect(closure).toBeTruthy()
    expect(optionTexts(closure)).toEqual(['Braided'])
    expect(closure.value).toBe('braided')
    expect(screen.queryByRole('option', { name: 'Non-braided' })).not.toBeInTheDocument()
  })

  it('shows Braided for a row saved back when non-braided was still on offer', () => {
    renderForm(ssfQuote({ closureType: 'nonBraided' }))
    const closure = selectContaining('Braided')
    expect(closure.value).toBe('braided')
  })
})

describe('OrderForm — other collections are unaffected', () => {
  it('still offers both closures and Pink housing on CUTY', () => {
    renderForm({
      lines: [{
        product: 'CUTY', carat: '0.10', certType: 'igi', housing: 'Pink',
        size: 'M', closureType: 'nonBraided', colorName: 'Black',
        qty: 1, unitB2B: 40, lineTotal: 40,
      }],
      subtotal: 40, total: 40, totalPieces: 1,
    })

    const closure = selectContaining('Non-braided')
    expect(closure).toBeTruthy()
    expect(optionTexts(closure)).toEqual(expect.arrayContaining(['Braided', 'Non-braided']))
    expect(closure.value).toBe('nonBraided')

    const metal = selectContaining('Pink')
    expect(metal).toBeTruthy()
    expect(metal.value).toBe('Pink')
  })
})
