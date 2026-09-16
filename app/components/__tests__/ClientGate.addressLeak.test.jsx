/**
 * The client gate half of Dionne's bug (15 Sept 2026).
 *
 * She typed DI MARE's details by hand — so no lookup had run — then wrote
 * THEATRE O FEES over the company name. The old code cleared the address only
 * when a lookup had already completed, so this path cleared nothing and DI
 * MARE's address in Roscoff went onto Théâtrophil's order in Orange.
 *
 * The companion suite ClientGate.restock.test.jsx pins the behaviour this must
 * not break: typing does not wipe an address. That is why the clearing happens
 * on blur, and only for details some other company already claimed.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key) => ({
      'client.companyName': 'Company Name *',
      'client.companyPlaceholder': 'Company',
      'client.contactName': 'Contact Name',
      'client.namePlaceholder': 'Name',
      'client.phone': 'Phone',
      'client.phonePlaceholder': 'Phone',
      'client.email': 'Email',
      'client.emailPlaceholder': 'Email',
      'client.country': 'Country *',
      'client.vatNumber': 'VAT Number',
      'client.vatPlaceholder': 'VAT',
      'client.address': 'Address',
      'client.city': 'City',
      'client.zip': 'ZIP',
      'client.startQuoting': 'Start Quoting',
    }[key] || key),
  }),
}))
jest.mock('../UserMenu', () => () => null)
jest.mock('@/lib/useIsMobile', () => ({ useResponsive: () => ({ isCompact: false }) }))

import ClientGate from '../ClientGate'

/** DI MARE, typed in by hand: details claimed, but no lookup ever ran. */
const DI_MARE = {
  name: 'MARINA FONDACCI', phone: '0495', email: 'dimare.porticcio@gmail.com',
  company: 'DI MARE - SARL UNA STORIA DI MARE',
  detailsOwner: 'DI MARE - SARL UNA STORIA DI MARE',
  country: 'France', address: '19 Place Lacaze Duthiers', city: 'Roscoff', zip: '29680',
  vat: 'FR83791465057', vatValid: true, vatStatus: 'VALID',
  vatErrorCode: null, vatMessageKey: null, vatValidating: false,
  savedClientId: 'cb1dd20a', dzb_client_number: '', jeweler_group: null,
  shipping_same_as_billing: false, shipping_address: 'Dépôt Porticcio',
  shipping_address_line2: '20166 Grosseto-Prugna', shipping_country: 'France',
}

/** Render with real state, so blur and change compose the way they do live. */
const renderGate = (initial) => {
  let current = initial
  const setClient = jest.fn((updater) => {
    current = typeof updater === 'function' ? updater(current) : updater
    rerender(<ClientGate client={current} setClient={setClient} onComplete={onComplete} />)
  })
  const onComplete = jest.fn()
  const { rerender } = render(
    <ClientGate client={current} setClient={setClient} onComplete={onComplete} />,
  )
  return { get client() { return current }, onComplete }
}

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ clients: [] }) }))
})
afterEach(() => jest.restoreAllMocks())

describe('ClientGate — changing the boutique', () => {
  const retypeCompany = (value) => {
    const field = screen.getByPlaceholderText('Company')
    fireEvent.change(field, { target: { value } })
    fireEvent.blur(field, { target: { value } })
  }

  it('drops the previous boutique’s address, with no lookup in play', async () => {
    const gate = renderGate(DI_MARE)
    retypeCompany('THEATRE O FEES')

    await waitFor(() => expect(gate.client.company).toBe('THEATRE O FEES'))
    expect(gate.client.address).toBe('')
    expect(gate.client.city).toBe('')
    expect(gate.client.zip).toBe('')
  })

  it('drops the delivery address, the contact and the VAT with it', async () => {
    const gate = renderGate(DI_MARE)
    retypeCompany('THEATRE O FEES')

    await waitFor(() => expect(gate.client.address).toBe(''))
    expect(gate.client.shipping_address).toBe('')
    expect(gate.client.shipping_address_line2).toBe('')
    expect(gate.client.shipping_same_as_billing).toBe(true)
    expect(gate.client.name).toBe('')
    expect(gate.client.email).toBe('')
    expect(gate.client.vat).toBe('')
    expect(gate.client.savedClientId).toBeNull()
  })

  it('keeps everything when the name only gains stray spaces', async () => {
    const gate = renderGate(DI_MARE)
    retypeCompany(`  ${DI_MARE.company}  `)

    await waitFor(() => expect(gate.client.address).toBe('19 Place Lacaze Duthiers'))
    expect(gate.client.savedClientId).toBe('cb1dd20a')
  })

  it('leaves an address typed before any company name alone', async () => {
    // Nobody has claimed these details, so naming the boutique keeps them.
    const gate = renderGate({
      ...DI_MARE, company: '', detailsOwner: '', savedClientId: null,
    })
    retypeCompany('THEATRE O FEES')

    await waitFor(() => expect(gate.client.company).toBe('THEATRE O FEES'))
    expect(gate.client.address).toBe('19 Place Lacaze Duthiers')
  })

  it('an address typed by hand becomes this boutique’s, and survives', async () => {
    const gate = renderGate(DI_MARE)
    retypeCompany('THEATRE O FEES')
    await waitFor(() => expect(gate.client.address).toBe(''))

    // The address block is folded away until asked for, as in the real form.
    // (The mocked t() returns the key, and the button prefixes an arrow.)
    fireEvent.click(screen.getByText(/enterAddressManually/))
    fireEvent.change(screen.getByPlaceholderText('Address'), { target: { value: '7 rue de Stassart' } })
    await waitFor(() => expect(gate.client.address).toBe('7 rue de Stassart'))
    expect(gate.client.detailsOwner).toBe('THEATRE O FEES')

    // Leaving the field again must not take back what is now theirs.
    retypeCompany('THEATRE O FEES')
    await waitFor(() => expect(gate.client.address).toBe('7 rue de Stassart'))
  })
})
