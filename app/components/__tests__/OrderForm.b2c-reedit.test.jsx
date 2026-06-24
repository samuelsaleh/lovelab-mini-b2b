/**
 * Reproduce crash when re-editing website B2C orders whose formState uses
 * website product names instead of catalog collection labels.
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

const SOPHIA_FORM = {
  rows: [{
    size: 's',
    carat: '',
    total: 180,
    setting: '',
    variant: 'BORDEAUX cord, White housing',
    quantity: 1,
    colorCord: 'BORDEAUX',
    productId: 'shapy-shine-emerald-0.10-white-c-bordeaux',
    collection: 'Emerald Bracelet 0.10 ct',
  }],
}

const STEPHANIE_FORM = {
  rows: [
    {
      size: 's',
      carat: '0.05',
      total: 105,
      setting: '',
      variant: 'RED cord, yellow housing, IGI certificate',
      quantity: 1,
      colorCord: 'RED',
      productId: 'cuty-bracelet-0.05-c-red-yellow',
      collection: 'CUTY',
    },
    {
      size: 's',
      carat: '0.15',
      total: 260,
      setting: '',
      variant: '0.15 ct • Séparés',
      quantity: 1,
      colorCord: 'BLACK',
      productId: 'three-yellow-black-0.15-separated',
      collection: 'Three Yellow with IGI certificate',
    },
  ],
}

function renderB2cForm(savedFormState) {
  return render(
    <I18nProvider>
      <OrderForm
        quote={{ lines: [], total: 0, totalPieces: 0 }}
        client={{}}
        onClose={jest.fn()}
        currentUser={{ role: 'admin', email: 'admin@test.com' }}
        savedFormState={savedFormState}
        editingDocumentId="doc-b2c"
        onEditInBuilder={jest.fn()}
        initialOrderChannel="b2c"
      />
    </I18nProvider>,
  )
}

describe('OrderForm — B2C website order re-edit', () => {
  it('renders Sophia B2C order without crashing', () => {
    renderB2cForm(SOPHIA_FORM)
    expect(screen.getByTestId('orderform-pricelist-badge')).toBeInTheDocument()
  })

  it('renders Stéphanie B2C order without crashing', () => {
    renderB2cForm(STEPHANIE_FORM)
    expect(screen.getByTestId('orderform-pricelist-badge')).toBeInTheDocument()
  })
})
