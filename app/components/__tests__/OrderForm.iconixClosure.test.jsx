/**
 * Iconix silk in the Order Form — closure column, closure-driven sizes.
 *
 * Flower Heart keeps the Braided / Non-braided choice. Riviera Four is
 * braided-only (Sam, Sep 2026): the closure cell is locked to Braided, the
 * sizes are S · M · L, and a line saved as non-braided S/M comes back braided
 * with its size blanked so the agent re-picks.
 *
 * Also the regression the change fixes for every closure collection: the
 * size dropdown used to read the collection's base sizes and ignore the
 * closure, so a non-braided row was offered sizes it cannot be ordered in.
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
  generatePDF: jest.fn(), downloadPDF: jest.fn(), formatDocumentFilename: jest.fn(() => 'order.pdf'),
}))
jest.mock('@/lib/vat', () => ({ validateVAT: jest.fn() }))
jest.mock('@/lib/packshot-lookup', () => ({ findPackshot: () => null }))
jest.mock('../PackshotThumb', () => ({ __esModule: true, default: () => <div /> }))
jest.mock('../SaveDocumentModal', () => ({ __esModule: true, default: () => null }))

const OrderForm = require('../OrderForm').default

const flowerLine = (over = {}) => ({
  product: 'Flower Heart', carat: '0.40', certType: 'igi', housing: 'White',
  size: 'S/M', closureType: 'nonBraided', colorName: 'Silver grey',
  cordType: 'silk', thickness: 'Thin',
  qty: 1, unitB2B: 150, lineTotal: 150, retailUnit: 585, retailTotal: 585,
  ...over,
})

const rivieraLine = (over = {}) => ({
  product: 'Riviera Four', carat: '0.20', certType: 'igi', housing: 'White',
  size: 'M', closureType: 'braided', colorName: 'Silver grey',
  cordType: 'silk', thickness: 'Thin',
  qty: 1, unitB2B: 90, lineTotal: 90, retailUnit: 340, retailTotal: 340,
  ...over,
})

function renderForm(lines) {
  return render(
    <I18nProvider>
      <OrderForm
        quote={{ lines, subtotal: 90, total: 90, totalPieces: 1 }}
        client={{}} onClose={jest.fn()}
        currentUser={{ role: 'admin', email: 'a@x.com' }}
        savedFormState={null} editingDocumentId={null}
        onEditInBuilder={jest.fn()} initialOrderChannel="b2b"
      />
    </I18nProvider>,
  )
}

const selectWithOption = (text) =>
  screen.getAllByRole('combobox').find((s) => Array.from(s.options || []).some((o) => o.text === text))
const optionTexts = (sel) => Array.from(sel.options).map((o) => o.text).filter(Boolean)
const sizeLike = (t) => ['XS', 'S', 'M', 'L', 'XL', 'S/M', 'L/XL'].includes(t)

describe('Flower Heart — Order Form', () => {
  test('the closure cell is a real Braided / Non-braided select', () => {
    renderForm([flowerLine()])
    const closure = selectWithOption('Braided')
    expect(closure).toBeTruthy()
    expect(optionTexts(closure)).toEqual(expect.arrayContaining(['Braided', 'Non-braided']))
    expect(closure.value).toBe('nonBraided')
  })

  test('non-braided: the size select offers S/M and L/XL only', () => {
    renderForm([flowerLine()])
    const size = selectWithOption('S/M')
    expect(optionTexts(size).filter(sizeLike)).toEqual(['S/M', 'L/XL'])
    expect(size.value).toBe('S/M')
  })

  test('braided: the size select offers S, M, L only', () => {
    renderForm([flowerLine({ closureType: 'braided', size: 'M' })])
    const size = selectWithOption('M')
    expect(optionTexts(size).filter(sizeLike)).toEqual(['S', 'M', 'L'])
    expect(size.value).toBe('M')
  })

  test('a line from the Builder with no closure lands as Non-braided', () => {
    // Older Iconix rows and any line whose closure was never touched.
    renderForm([flowerLine({ closureType: null })])
    expect(selectWithOption('Braided').value).toBe('nonBraided')
    expect(optionTexts(selectWithOption('S/M')).filter(sizeLike)).toEqual(['S/M', 'L/XL'])
  })

  test('changing closure to braided clears a grouped size that no longer applies', () => {
    renderForm([flowerLine()])
    fireEvent.change(selectWithOption('Braided'), { target: { value: 'braided' } })
    // The size that was 'S/M' is gone; the list is now the braided one.
    const sizeSelects = screen.getAllByRole('combobox').filter((s) => optionTexts(s).includes('M'))
    const rowSize = sizeSelects.find((s) => optionTexts(s).filter(sizeLike).join() === 'S,M,L')
    expect(rowSize).toBeTruthy()
    expect(rowSize.value).toBe('')
  })

  test('the thread stays Thin', () => {
    renderForm([flowerLine()])
    expect(screen.getAllByDisplayValue(/Thin/).length).toBeGreaterThan(0)
  })
})

describe('Riviera Four — Order Form, braided only', () => {
  test('the closure cell is locked to Braided — Non-braided is not on offer', () => {
    renderForm([rivieraLine()])
    const closure = selectWithOption('Braided')
    expect(closure).toBeTruthy()
    expect(closure.value).toBe('braided')
    expect(optionTexts(closure)).not.toContain('Non-braided')
  })

  test('the size select offers S, M, L only', () => {
    renderForm([rivieraLine()])
    const size = selectWithOption('M')
    expect(optionTexts(size).filter(sizeLike)).toEqual(['S', 'M', 'L'])
    expect(size.value).toBe('M')
  })

  test('a line with no closure lands as Braided', () => {
    renderForm([rivieraLine({ closureType: null })])
    expect(selectWithOption('Braided').value).toBe('braided')
    expect(optionTexts(selectWithOption('M')).filter(sizeLike)).toEqual(['S', 'M', 'L'])
  })

  test('a line saved as non-braided S/M comes back braided with its size blanked', () => {
    renderForm([rivieraLine({ closureType: 'nonBraided', size: 'S/M' })])
    expect(selectWithOption('Braided').value).toBe('braided')
    const size = selectWithOption('M')
    expect(optionTexts(size).filter(sizeLike)).toEqual(['S', 'M', 'L'])
    expect(size.value).toBe('')
  })

  test('the thread stays Thin', () => {
    renderForm([rivieraLine()])
    expect(screen.getAllByDisplayValue(/Thin/).length).toBeGreaterThan(0)
  })
})

describe('CUTY — the same size rule now applies in the Order Form too', () => {
  const cuty = (over = {}) => ({
    product: 'CUTY', carat: '0.10', certType: 'igi', housing: 'Yellow', colorName: 'Black',
    qty: 1, unitB2B: 40, lineTotal: 40, retailUnit: 155, retailTotal: 155, ...over,
  })

  test('non-braided CUTY is offered S/M · L/XL, not the nylon sizes', () => {
    renderForm([cuty({ closureType: 'nonBraided', size: 'S/M' })])
    expect(optionTexts(selectWithOption('S/M')).filter(sizeLike)).toEqual(['S/M', 'L/XL'])
  })

  test('braided CUTY keeps the full nylon range', () => {
    renderForm([cuty({ closureType: 'braided', size: 'M' })])
    expect(optionTexts(selectWithOption('XS')).filter(sizeLike)).toEqual(['XS', 'S', 'M', 'L', 'XL'])
  })

  test('CUTY with no closure still asks — no default is imposed', () => {
    renderForm([cuty({ closureType: null, size: 'M' })])
    expect(selectWithOption('Braided').value).toBe('')
  })
})
