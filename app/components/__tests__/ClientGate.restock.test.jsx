/**
 * ClientGate — company keystroke must not wipe address; selecting a saved
 * client fills contact/company fields (no past-order product restore).
 */

import React, { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key) => {
      const map = {
        'client.title': 'B2B Quote Assistant',
        'client.subtitle': 'Select a saved client',
        'client.searchSaved': 'Search Saved Clients',
        'client.searchPlaceholder': 'Search…',
        'client.searching': 'Searching...',
        'client.noSaved': 'No saved clients found',
        'client.orNew': 'or enter new client',
        'client.contactName': 'Contact Name',
        'client.namePlaceholder': 'Name',
        'client.phone': 'Phone',
        'client.phonePlaceholder': 'Phone',
        'client.email': 'Email',
        'client.emailPlaceholder': 'Email',
        'client.companyName': 'Company Name *',
        'client.companyPlaceholder': 'Company',
        'client.country': 'Country *',
        'client.selectCountry': 'Select country',
        'client.vatNumber': 'VAT Number',
        'client.vatPlaceholder': 'VAT',
        'client.lookUp': 'Look Up Company',
        'client.startQuoting': 'Start Quoting',
        'client.skip': 'Skip for now',
        'client.loadedHint': 'Client loaded — details filled below. Start quoting when ready.',
        'client.enterAddressManually': 'Enter address manually',
        'client.address': 'Address',
        'client.city': 'City',
        'client.zip': 'ZIP',
        'client.checkVatManually': 'Check VAT',
      }
      return map[key] || key
    },
  }),
}))

jest.mock('../UserMenu', () => () => null)
jest.mock('@/lib/useIsMobile', () => ({ useResponsive: () => ({ isCompact: false }) }))

import ClientGate from '../ClientGate'

const emptyClient = {
  name: '', phone: '', email: '', company: '', country: '',
  address: '', city: '', zip: '', vat: '',
  vatValid: null, vatStatus: null, vatErrorCode: null, vatMessageKey: null, vatValidating: false,
}

describe('ClientGate — company typing does not wipe manual address', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ clients: [] }),
    }))
  })

  it('keeps manually entered address when typing company before any lookup', async () => {
    let client = {
      ...emptyClient,
      company: 'GALA',
      address: '9 rue de Toulzac',
      city: 'Brive',
      zip: '19100',
    }
    const setClient = jest.fn((updater) => {
      client = typeof updater === 'function' ? updater(client) : updater
    })

    render(
      <ClientGate client={client} setClient={setClient} onComplete={jest.fn()} />,
    )

    const companyInput = screen.getByPlaceholderText('Company')
    fireEvent.change(companyInput, { target: { value: 'GALA SAS' } })

    await waitFor(() => expect(setClient).toHaveBeenCalled())
    const lastCall = setClient.mock.calls[setClient.mock.calls.length - 1][0]
    const next = typeof lastCall === 'function' ? lastCall(client) : lastCall
    expect(next.company).toBe('GALA SAS')
    expect(next.address).toBe('9 rue de Toulzac')
    expect(next.city).toBe('Brive')
  })
})

describe('ClientGate — select saved client fills page fields only', () => {
  const SAVED = {
    id: 'c1',
    company: 'SAS GALA',
    name: 'David',
    country: 'France',
    vat: 'FR123',
    vat_valid: true,
    address: '9 rue',
    city: 'Brive',
    zip: '19100',
    email: 'd@x.com',
    phone: '01',
    dzb_client_number: '999',
    jeweler_group: 'SYNALIA',
    shipping_same_as_billing: false,
    shipping_address: 'Warehouse 2',
    shipping_address_line2: '75001 Paris',
    shipping_country: 'France',
  }

  beforeEach(() => {
    global.fetch = jest.fn((url) => {
      if (String(url).startsWith('/api/clients')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ clients: [SAVED] }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
  })

  it('fills contact/company/VAT/DZB/shipping from the saved client (no Restock button)', async () => {
    let latestClient = { ...emptyClient }

    function Harness() {
      const [client, setClient] = useState({ ...emptyClient })
      latestClient = client
      return (
        <ClientGate
          client={client}
          setClient={setClient}
          onComplete={jest.fn()}
        />
      )
    }

    render(<Harness />)

    const search = screen.getByPlaceholderText('Search…')
    fireEvent.focus(search)

    const optionBtn = await screen.findByRole('button', { name: /SAS GALA/i }, { timeout: 5000 })
    fireEvent.mouseDown(optionBtn)

    await waitFor(() => {
      expect(latestClient.company).toBe('SAS GALA')
      expect(latestClient.name).toBe('David')
      expect(latestClient.email).toBe('d@x.com')
      expect(latestClient.vat).toBe('FR123')
      expect(latestClient.dzb_client_number).toBe('999')
      expect(latestClient.jeweler_group).toBe('SYNALIA')
      expect(latestClient.shipping_same_as_billing).toBe(false)
      expect(latestClient.shipping_address).toBe('Warehouse 2')
    })

    expect(screen.queryByRole('button', { name: /Restock|Réassort/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Client loaded/i)).toBeInTheDocument()
    // Must NOT fetch documents for past-order restore
    expect(global.fetch.mock.calls.some(([u]) => String(u).includes('/api/documents'))).toBe(false)
  }, 12000)
})
