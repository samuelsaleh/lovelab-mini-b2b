/**
 * The leak Dionne hit, at the place she hit it (15 Sept 2026).
 *
 * The order form's company field is free text with no directory behind it, so
 * retyping the name moved the name and left the previous boutique's address
 * underneath. Three orders for Théâtrophil went out carrying DI MARE's
 * address before she noticed and had to fix them by hand.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
jest.mock('../PackshotThumb', () => ({ __esModule: true, default: () => <div data-testid="packshot-thumb" /> }))
jest.mock('../SaveDocumentModal', () => ({ __esModule: true, default: () => null }))

const OrderForm = require('../OrderForm').default

const DI_MARE = {
  company: 'DI MARE - SARL UNA STORIA DI MARE',
  name: 'MARINA FONDACCI',
  email: 'dimare.porticcio@gmail.com',
  phone: '0495',
  address: '19 Place Lacaze Duthiers',
  zip: '29680',
  city: 'Roscoff',
  country: 'France',
  vat: 'FR83791465057',
}

const THEATRE_ROW = {
  id: 'theatre-1',
  company: 'THEATRE O FEES',
  name: 'Laetitia CHASTELLIER',
  email: 'theatreofees@sfr.fr',
  address: '7 rue de Stassart',
  zip: '84100',
  city: 'ORANGE',
  country: 'France',
  vat: 'FR49523213130',
}

const clientFromRow = (row) => ({
  name: row.name, phone: row.phone || '', email: row.email, company: row.company,
  country: row.country, address: row.address, city: row.city, zip: row.zip,
  vat: row.vat, vatValid: null, vatValidating: false, vatStatus: null,
  vatErrorCode: null, vatMessageKey: null, savedClientId: row.id || null,
  dzb_client_number: '', jeweler_group: null,
  shipping_same_as_billing: true, shipping_address: '', shipping_address_line2: '', shipping_country: '',
})

/** The directory answers with `rows` for any search. */
const directoryReturns = (rows) => {
  global.fetch = jest.fn(async (url) => {
    if (String(url).startsWith('/api/clients')) {
      return { ok: true, json: async () => ({ clients: rows }) }
    }
    return { ok: true, json: async () => ({}) }
  })
}

const renderForm = (client) => render(
  <I18nProvider>
    <OrderForm quote={null} client={client} onClose={() => {}} currentUser={{ full_name: 'Dionne' }} />
  </I18nProvider>,
)

const companyField = () => screen.getByDisplayValue(DI_MARE.company)
const street = () => screen.getByPlaceholderText('Street address')
const postcodeCity = () => screen.getByPlaceholderText('Postal code, City')

beforeEach(() => { directoryReturns([]) })
afterEach(() => { jest.restoreAllMocks() })

describe('changing the company on the order form', () => {
  it('does not leave the previous boutique’s address behind', async () => {
    renderForm(clientFromRow(DI_MARE))
    expect(street()).toHaveValue('19 Place Lacaze Duthiers')

    const field = companyField()
    fireEvent.change(field, { target: { value: 'THEATRE O FEES' } })
    fireEvent.blur(field, { target: { value: 'THEATRE O FEES' } })

    await waitFor(() => expect(street()).toHaveValue(''))
    expect(postcodeCity()).toHaveValue('')
  })

  it('takes the contact and VAT with it', async () => {
    renderForm(clientFromRow(DI_MARE))
    const field = companyField()
    fireEvent.change(field, { target: { value: 'THEATRE O FEES' } })
    fireEvent.blur(field, { target: { value: 'THEATRE O FEES' } })

    await waitFor(() => expect(screen.queryByDisplayValue('MARINA FONDACCI')).not.toBeInTheDocument())
    expect(screen.queryByDisplayValue('FR83791465057')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('dimare.porticcio@gmail.com')).not.toBeInTheDocument()
  })

  it('fills the new boutique’s own address when the directory knows it', async () => {
    directoryReturns([THEATRE_ROW])
    renderForm(clientFromRow(DI_MARE))
    const field = companyField()
    fireEvent.change(field, { target: { value: 'THEATRE O FEES' } })
    fireEvent.blur(field, { target: { value: 'THEATRE O FEES' } })

    await waitFor(() => expect(street()).toHaveValue('7 rue de Stassart'))
    expect(postcodeCity()).toHaveValue('84100 ORANGE')
    expect(screen.getByDisplayValue('Laetitia CHASTELLIER')).toBeInTheDocument()
  })

  it('fills nothing when two boutiques share the name — that is a human’s call', async () => {
    directoryReturns([THEATRE_ROW, { ...THEATRE_ROW, id: 'theatre-2', address: 'Somewhere else' }])
    renderForm(clientFromRow(DI_MARE))
    const field = companyField()
    fireEvent.change(field, { target: { value: 'THEATRE O FEES' } })
    fireEvent.blur(field, { target: { value: 'THEATRE O FEES' } })

    await waitFor(() => expect(street()).toHaveValue(''))
  })

  it('leaves the address alone when the name has not really changed', async () => {
    renderForm(clientFromRow(DI_MARE))
    const field = companyField()
    fireEvent.blur(field, { target: { value: `  ${DI_MARE.company}  ` } })

    await waitFor(() => expect(street()).toHaveValue('19 Place Lacaze Duthiers'))
  })

  it('keeps an address typed by hand under the new name', async () => {
    renderForm(clientFromRow(DI_MARE))
    const field = companyField()
    fireEvent.change(field, { target: { value: 'THEATRE O FEES' } })
    fireEvent.blur(field, { target: { value: 'THEATRE O FEES' } })
    await waitFor(() => expect(street()).toHaveValue(''))

    // Now it is this boutique's address, so a second blur must not eat it.
    fireEvent.change(street(), { target: { value: '7 rue de Stassart' } })
    fireEvent.blur(screen.getByDisplayValue('THEATRE O FEES'), { target: { value: 'THEATRE O FEES' } })
    await waitFor(() => expect(street()).toHaveValue('7 rue de Stassart'))
  })

  it('empties the header rather than guessing when the directory is down', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'))
    renderForm(clientFromRow(DI_MARE))
    const field = companyField()
    fireEvent.change(field, { target: { value: 'THEATRE O FEES' } })
    fireEvent.blur(field, { target: { value: 'THEATRE O FEES' } })

    await waitFor(() => expect(street()).toHaveValue(''))
  })
})
