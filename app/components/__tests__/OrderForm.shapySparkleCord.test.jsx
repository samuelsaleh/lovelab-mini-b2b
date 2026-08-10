/**
 * OrderForm — Shapy Sparkle Round thread (MATERIAL) and thread colour.
 *
 * Reported from a real order built off the "Pack Man" pack: the three Shapy
 * Sparkle Round rows had an empty MATERIAL cell (while Shapy Shine Fancy
 * showed "Shine" and Cubix showed "Nylon"), and the Silver Grey row lost its
 * COLOR CORD. Shapy Sparkle ships on silk only, and the silk palette spells
 * the colour 'Silver grey' — the stored 'Silver Grey' matched no option.
 *
 * Guarantees:
 *   - A Shapy Sparkle Round row with no thread on the quote fills in
 *     "Silk (Thin)" instead of an empty cell, and Thick stays available.
 *   - Black / Silver Grey / Navy Blue all stay selected on that row.
 *   - An explicit Thick choice is preserved.
 *   - Single-thread collections keep showing their implied material.
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

// The three Shapy Sparkle Round rows exactly as the pack produced them:
// priced, sized, coloured — but with no cord type at all.
function sparkleQuote({ cordType = null, thickness = null } = {}) {
  const line = (carat, colorName, unitB2B) => ({
    product: 'SHAPY SPARKLE RND G/H',
    carat,
    certType: 'inhouse',
    shape: 'Round',
    size: 'L/XL',
    closureType: null,
    cordType,
    thickness,
    colorName,
    qty: 1,
    unitB2B,
    lineTotal: unitB2B,
  })
  const lines = [
    line('1.00', 'Black', 225),
    line('0.70', 'Silver Grey', 165),
    line('0.50', 'Navy Blue', 125),
  ]
  return { lines, subtotal: 515, total: 515, totalPieces: 3 }
}

const combos = () => screen.getAllByRole('combobox')

const selectsWithOption = (text) => combos().filter(s =>
  Array.from(s.options || []).some(o => o.text === text),
)

describe('OrderForm — Shapy Sparkle Round material', () => {
  it('fills the MATERIAL cell with Silk (Thin) when the pack left it unset', () => {
    renderForm(sparkleQuote())

    const materialSelects = selectsWithOption('Silk (Thin)')
    expect(materialSelects).toHaveLength(3)
    materialSelects.forEach(s => expect(s.value).toBe('Silk (Thin)'))
  })

  it('offers both silk thicknesses and no nylon', () => {
    renderForm(sparkleQuote())

    const materialSelect = selectsWithOption('Silk (Thin)')[0]
    const labels = Array.from(materialSelect.options).map(o => o.text).filter(Boolean)
    expect(labels).toEqual(['Silk (Thin)', 'Silk (Thick)'])
  })

  it('keeps an explicit Thick choice instead of overriding it', () => {
    renderForm(sparkleQuote({ cordType: 'silk', thickness: 'Thick' }))

    const materialSelects = selectsWithOption('Silk (Thin)')
    materialSelects.forEach(s => expect(s.value).toBe('Silk (Thick)'))
  })
})

describe('OrderForm — Shapy Sparkle Round thread colour', () => {
  it('keeps Black, Silver Grey and Navy Blue selected on the silk palette', () => {
    renderForm(sparkleQuote())

    // Silk spells it 'Silver grey', so the stored 'Silver Grey' has to be
    // snapped onto the palette or the cell renders blank — the reported bug.
    const colorSelects = selectsWithOption('Silver grey')
    expect(colorSelects).toHaveLength(3)
    expect(colorSelects.map(s => s.value)).toEqual(['Black', 'Silver grey', 'Navy Blue'])
  })

  it('keeps an off-palette colour visible rather than blanking the cell', () => {
    const quote = sparkleQuote()
    quote.lines[1].colorName = 'Fluo Pink' // silk has no such colour
    renderForm(quote)

    const kept = combos().find(s => s.value === 'Fluo Pink')
    expect(kept).toBeTruthy()
  })
})

describe('OrderForm — single-thread collections are unchanged', () => {
  it('shows Shine as read-only text for Shapy Shine Fancy', () => {
    renderForm({
      lines: [{
        product: 'SHAPY SHINE FANCY',
        carat: '0.30',
        certType: 'igi',
        shape: 'Emerald',
        housing: 'Bezel White',
        size: 'L',
        closureType: 'braided',
        colorName: 'Black',
        qty: 1,
        unitB2B: 100,
        lineTotal: 100,
      }],
      subtotal: 100,
      total: 100,
      totalPieces: 1,
    })

    expect(screen.getAllByText('Shine').length).toBeGreaterThan(0)
    // No material dropdown for a collection with a single thread.
    expect(selectsWithOption('Silk (Thin)')).toHaveLength(0)
  })

  it('shows Nylon as read-only text for Cubix', () => {
    renderForm({
      lines: [{
        product: 'CUBIX',
        carat: '0.10',
        certType: 'igi',
        housing: 'White',
        size: 'L/XL',
        closureType: 'braided',
        colorName: 'Brown',
        qty: 1,
        unitB2B: 40,
        lineTotal: 40,
      }],
      subtotal: 40,
      total: 40,
      totalPieces: 1,
    })

    expect(screen.getAllByText('Nylon').length).toBeGreaterThan(0)
  })
})
