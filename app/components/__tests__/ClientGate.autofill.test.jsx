/**
 * ClientGate — no text field may be autofillable by the browser.
 *
 * Chrome filled the agent's own name/email into the client fields and both
 * ClientGate and the order form write those values back into the shared
 * `clients` table, so every input here must carry the suppression attributes.
 */

import React, { useState } from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { AUTOFILL_OFF } from '@/lib/noAutofill'

jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key) => {
      const map = {
        'client.searchPlaceholder': 'Search…',
        'client.namePlaceholder': 'Name',
        'client.phonePlaceholder': 'Phone',
        'client.emailPlaceholder': 'Email',
        'client.companyPlaceholder': 'Company',
        'client.selectCountry': 'Select country',
        'client.vatPlaceholder': 'VAT',
        'client.address': 'Address',
        'client.city': 'City',
        'client.zip': 'ZIP',
        'client.enterAddressManually': 'Enter address manually',
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

// Anything resembling one of these makes Chrome re-classify the field as part
// of an address form, which is exactly what we are trying to prevent.
const SEMANTIC_NAME = /name|mail|tel|phone|organi[sz]ation|company|address|street|city|zip|postal|country/i

function textInputs() {
  return Array.from(document.querySelectorAll('input')).filter((el) => el.type !== 'checkbox')
}

function expectSuppressed(input) {
  expect(input).toHaveAttribute('autocomplete', AUTOFILL_OFF)
  expect(input).toHaveAttribute('data-1p-ignore')
  expect(input).toHaveAttribute('data-lpignore', 'true')
  expect(input).toHaveAttribute('data-form-type', 'other')
  expect(input).toHaveAttribute('spellcheck', 'false')
  const name = input.getAttribute('name')
  expect(name).toBeTruthy()
  expect(name).not.toMatch(SEMANTIC_NAME)
}

function Harness({ initialClient = emptyClient }) {
  const [client, setClient] = useState(initialClient)
  return <ClientGate client={client} setClient={setClient} onComplete={jest.fn()} />
}

// The gate fetches saved clients on mount; let that settle so the resulting
// state update does not land outside act().
async function renderGate(props) {
  const result = render(<Harness {...props} />)
  await act(async () => {})
  return result
}

describe('ClientGate — autofill suppression', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ clients: [] }) }))
  })

  it('suppresses autofill on every field of the default view', async () => {
    await renderGate()

    const inputs = textInputs()
    // search, contact name, phone, email, company, country, VAT
    expect(inputs).toHaveLength(7)
    inputs.forEach(expectSuppressed)
  })

  it('gives every field a distinct name so nothing is accidentally shared', async () => {
    await renderGate()
    const names = textInputs().map((el) => el.getAttribute('name'))
    expect(new Set(names).size).toBe(names.length)
  })

  it('suppresses autofill on the manual address fields', async () => {
    await renderGate()
    fireEvent.click(screen.getByText(/Enter address manually/))

    const inputs = textInputs()
    // the seven above plus address / city / zip
    expect(inputs).toHaveLength(10)
    inputs.forEach(expectSuppressed)

    for (const placeholder of ['Address', 'City', 'ZIP']) {
      expectSuppressed(screen.getByPlaceholderText(placeholder))
    }
  })

  it('suppresses autofill on the address fields of the lookup result block', async () => {
    const SAVED = {
      id: 'c1', company: 'SAS LITTLE FACTORY', name: 'Marie Dupont', country: 'France',
      vat: 'FR25822887832', vat_valid: true, address: 'Centre Commercial Le Forum',
      city: 'Saint-Paul', zip: '97460', email: 'contact@littlefactory.re', phone: '+262693218939',
    }
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ clients: [SAVED] }) }))

    await renderGate()
    fireEvent.focus(screen.getByPlaceholderText('Search…'))
    fireEvent.mouseDown(await screen.findByRole('button', { name: /SAS LITTLE FACTORY/i }))

    // Selecting a saved client reveals the Company Details block.
    await waitFor(() => expect(screen.getByPlaceholderText('Address')).toBeInTheDocument())

    const inputs = textInputs()
    expect(inputs).toHaveLength(10)
    inputs.forEach(expectSuppressed)
  })
})
