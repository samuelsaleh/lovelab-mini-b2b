/**
 * Incoming website orders often omit Order by / VAT / street. The form must
 * leave those empty instead of filling them from the logged-in user or a
 * leftover ClientGate session — otherwise Sam and Hardik see two headers
 * on the same Julie order.
 */

import {
  resolveOrderFormHeader,
  headerFromSavedForm,
  clientFromOrderFormState,
  EMPTY_CLIENT,
} from '../orderFormHeader'
import { JEWELER_GROUP } from '../jewelerGroup'

const SAM = { full_name: 'Sam Saleh', email: 'sam@love-lab.com', role: 'admin' }
const HARDIK = { full_name: 'Hardik Koladiya', email: 'hardik@example.com', role: 'admin' }

const LEFTOVER_CLIENT = {
  company: 'LoveLab leftover',
  name: 'Should Not Appear',
  address: 'Kwikstaartlaan 3',
  zip: '2610',
  city: 'Antwerpen',
  country: 'Belgium',
  vat: 'BE1039054397',
  vatValid: true,
  email: 'old@example.com',
  phone: '+32 000',
  dzb_client_number: '999',
  jeweler_group: 'SYNALIA',
}

const JULIE_WEBSITE_ORDER = {
  contactName: 'Julie Kochem',
  email: 'juliesjewellery@web.de',
  phone: '+49 152 54233883',
  country: 'Germany',
  rows: [{ collection: 'CUTY', quantity: 5 }],
}

describe('headerFromSavedForm', () => {
  it('returns empty strings for missing createdBy, VAT and address', () => {
    const h = headerFromSavedForm(JULIE_WEBSITE_ORDER)
    expect(h.createdBy).toBe('')
    expect(h.vatNumber).toBe('')
    expect(h.addressLine1).toBe('')
    expect(h.addressLine2).toBe('')
    expect(h.companyName).toBe('')
    expect(h.contactName).toBe('Julie Kochem')
    expect(h.country).toBe('Germany')
    expect(h.email).toBe('juliesjewellery@web.de')
    expect(h.phone).toBe('+49 152 54233883')
    expect(h.vatValid).toBeNull()
  })

  it('keeps values that are actually on the snapshot', () => {
    const h = headerFromSavedForm({
      ...JULIE_WEBSITE_ORDER,
      companyName: 'Julie\'s Jewellery',
      addressLine1: 'Hauptstrasse 1',
      addressLine2: '80331 München',
      vatNumber: 'DE123',
      createdBy: 'Alberto',
      vatValid: true,
    })
    expect(h.companyName).toBe('Julie\'s Jewellery')
    expect(h.addressLine1).toBe('Hauptstrasse 1')
    expect(h.addressLine2).toBe('80331 München')
    expect(h.vatNumber).toBe('DE123')
    expect(h.createdBy).toBe('Alberto')
    expect(h.vatValid).toBe(true)
  })

  it('treats null formState as an empty header', () => {
    const h = headerFromSavedForm(null)
    expect(h.createdBy).toBe('')
    expect(h.vatNumber).toBe('')
    expect(h.addressLine1).toBe('')
    expect(h.country).toBe('')
  })
})

describe('resolveOrderFormHeader — re-edit existing document', () => {
  it('does not invent Order by from the logged-in user', () => {
    const sam = resolveOrderFormHeader({
      savedFormState: JULIE_WEBSITE_ORDER,
      client: LEFTOVER_CLIENT,
      currentUser: SAM,
      editingExisting: true,
    })
    const hardik = resolveOrderFormHeader({
      savedFormState: JULIE_WEBSITE_ORDER,
      client: {},
      currentUser: HARDIK,
      editingExisting: true,
    })
    expect(sam.createdBy).toBe('')
    expect(hardik.createdBy).toBe('')
    expect(sam.createdBy).toBe(hardik.createdBy)
  })

  it('does not leak leftover VAT or Antwerp street onto a German website order', () => {
    const h = resolveOrderFormHeader({
      savedFormState: JULIE_WEBSITE_ORDER,
      client: LEFTOVER_CLIENT,
      currentUser: SAM,
      editingExisting: true,
    })
    expect(h.vatNumber).toBe('')
    expect(h.vatValid).toBeNull()
    expect(h.addressLine1).toBe('')
    expect(h.addressLine2).toBe('')
    expect(h.country).toBe('Germany')
    expect(h.companyName).toBe('')
    expect(h.contactName).toBe('Julie Kochem')
    expect(h.dzbEnabled).toBe(false)
    expect(h.jewelerGroup).toBe(JEWELER_GROUP.AUCUN)
  })

  it('shows Order by / VAT / address when the saved order actually has them', () => {
    const h = resolveOrderFormHeader({
      savedFormState: {
        ...JULIE_WEBSITE_ORDER,
        createdBy: 'Alberto',
        vatNumber: 'DE999',
        addressLine1: 'Hauptstrasse 1',
      },
      client: LEFTOVER_CLIENT,
      currentUser: SAM,
      editingExisting: true,
    })
    expect(h.createdBy).toBe('Alberto')
    expect(h.vatNumber).toBe('DE999')
    expect(h.addressLine1).toBe('Hauptstrasse 1')
  })

  it('stays empty when re-editing a document with no formState at all', () => {
    const h = resolveOrderFormHeader({
      savedFormState: null,
      client: LEFTOVER_CLIENT,
      currentUser: SAM,
      editingExisting: true,
    })
    expect(h.createdBy).toBe('')
    expect(h.vatNumber).toBe('')
    expect(h.addressLine1).toBe('')
    expect(h.contactName).toBe('')
  })
})

describe('resolveOrderFormHeader — new order / restock', () => {
  it('defaults Order by to the logged-in user on a brand-new order', () => {
    const h = resolveOrderFormHeader({
      savedFormState: null,
      client: { company: 'GALA', vat: 'FR1', address: '9 rue', country: 'France' },
      currentUser: SAM,
      editingExisting: false,
    })
    expect(h.createdBy).toBe('Sam Saleh')
    expect(h.companyName).toBe('GALA')
    expect(h.vatNumber).toBe('FR1')
    expect(h.addressLine1).toBe('9 rue')
  })

  it('on restock, keeps snapshot VAT/address and credits Order by to the current user', () => {
    const h = resolveOrderFormHeader({
      savedFormState: {
        companyName: 'GALA',
        vatNumber: 'FR1',
        addressLine1: '9 rue',
        country: 'France',
      },
      client: LEFTOVER_CLIENT,
      currentUser: SAM,
      editingExisting: false,
    })
    expect(h.createdBy).toBe('Sam Saleh')
    expect(h.vatNumber).toBe('FR1')
    expect(h.addressLine1).toBe('9 rue')
    expect(h.companyName).toBe('GALA')
  })

  it('on restock of a snapshot with no VAT, does not pull leftover session VAT', () => {
    const h = resolveOrderFormHeader({
      savedFormState: { companyName: 'Julie', country: 'Germany' },
      client: LEFTOVER_CLIENT,
      currentUser: HARDIK,
      editingExisting: false,
    })
    expect(h.vatNumber).toBe('')
    expect(h.addressLine1).toBe('')
    expect(h.createdBy).toBe('Hardik Koladiya')
  })
})

describe('clientFromOrderFormState', () => {
  it('maps snapshot fields and never copies leftover keys', () => {
    const client = clientFromOrderFormState(JULIE_WEBSITE_ORDER)
    expect(client.name).toBe('Julie Kochem')
    expect(client.email).toBe('juliesjewellery@web.de')
    expect(client.country).toBe('Germany')
    expect(client.vat).toBe('')
    expect(client.address).toBe('')
    expect(client.savedClientId).toBeNull()
    expect(client.company).toBe('')
  })

  it('starts from EMPTY_CLIENT so leftover session fields cannot survive a spread', () => {
    const client = clientFromOrderFormState({})
    expect(client).toMatchObject({
      vat: '',
      address: '',
      name: '',
      savedClientId: null,
    })
    expect(client.shipping_same_as_billing).toBe(EMPTY_CLIENT.shipping_same_as_billing)
  })
})
