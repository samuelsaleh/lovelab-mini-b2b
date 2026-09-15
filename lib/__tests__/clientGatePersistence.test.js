/**
 * Client gate persistence + restock helpers (pure).
 */

import {
  buildPersistedAppState,
  shouldAdminBypassClientGate,
  restoreClientFromStorage,
  formStateForRestock,
  formStateForNewClient,
  clientRowToFormFields,
} from '../clientGatePersistence'

describe('buildPersistedAppState', () => {
  it('always includes client even when clientReady is false', () => {
    const client = { company: 'GALA', vat: 'FR123', address: '9 rue de Toulzac' }
    const payload = buildPersistedAppState({
      lines: [],
      client,
      clientReady: false,
      curQuote: null,
      aiMsgs: [],
      activeTab: 'home',
    })
    expect(payload.clientReady).toBe(false)
    expect(payload.client).toEqual(client)
    expect(payload.client).not.toBeNull()
  })

  it('trims aiMsgs to last 50', () => {
    const aiMsgs = Array.from({ length: 60 }, (_, i) => ({ i }))
    const payload = buildPersistedAppState({
      lines: [],
      client: null,
      clientReady: true,
      aiMsgs,
    })
    expect(payload.aiMsgs).toHaveLength(50)
    expect(payload.aiMsgs[0].i).toBe(10)
  })
})

describe('shouldAdminBypassClientGate', () => {
  it('allows bypass once for admin when gate was not opened explicitly', () => {
    expect(shouldAdminBypassClientGate({
      isAdmin: true,
      adminInitDone: false,
      explicitClientGate: false,
    })).toBe(true)
  })

  it('blocks bypass after explicit New Client', () => {
    expect(shouldAdminBypassClientGate({
      isAdmin: true,
      adminInitDone: false,
      explicitClientGate: true,
    })).toBe(false)
  })

  it('blocks bypass when already initialized', () => {
    expect(shouldAdminBypassClientGate({
      isAdmin: true,
      adminInitDone: true,
      explicitClientGate: false,
    })).toBe(false)
  })

  it('never bypasses for non-admin', () => {
    expect(shouldAdminBypassClientGate({
      isAdmin: false,
      adminInitDone: false,
      explicitClientGate: false,
    })).toBe(false)
  })
})

describe('restoreClientFromStorage', () => {
  it('restores in-progress client when clientReady is false', () => {
    const state = {
      clientReady: false,
      client: { company: 'Bijouterie X', vat: 'BE101' },
    }
    const restored = restoreClientFromStorage(state)
    expect(restored.client.company).toBe('Bijouterie X')
    expect(restored.clientReady).toBe(false)
    expect(restored.explicitClientGate).toBe(true)
  })

  it('restores ready client sessions too', () => {
    const restored = restoreClientFromStorage({
      clientReady: true,
      client: { company: 'Y' },
    })
    expect(restored.client.company).toBe('Y')
    expect(restored.explicitClientGate).toBe(false)
  })
})

describe('formStateForRestock', () => {
  it('keeps company, email, phone, vat, dzb and drops event/createdBy', () => {
    const rest = formStateForRestock({
      companyName: 'GALA',
      contactName: 'David',
      email: 'd@x.com',
      phone: '01',
      vatNumber: 'FR1',
      dzbClientNumber: '12345',
      jewelerGroup: 'SYNALIA',
      rows: [{ collection: 'CUTY' }],
      eventName: 'Munich',
      createdBy: 'Nicolas',
    })
    expect(rest.companyName).toBe('GALA')
    expect(rest.email).toBe('d@x.com')
    expect(rest.vatNumber).toBe('FR1')
    expect(rest.dzbClientNumber).toBe('12345')
    expect(rest.jewelerGroup).toBe('SYNALIA')
    expect(rest.rows).toHaveLength(1)
    expect(rest.eventName).toBeUndefined()
    expect(rest.createdBy).toBeUndefined()
  })
})

// ── Duplicate for a different client (Sam, 15 Sep 2026) ─────────────────────
// "Copy" kept the same boutique, which is a restock. Duplicating for someone
// else must keep the cart and drop everything that belonged to the old client
// or the old deal — otherwise their address, VAT, discount or prepayment
// silently rides along onto another shop's order.
describe('formStateForNewClient', () => {
  const saved = {
    rows: [{ collection: 'Multi Three', quantity: 12, carat: '0.03' }],
    packaging: 'pouch', hasVitrine: true, vitrinePrice: 250, vitrineQty: 1,
    pricelistYear: '2026-10',
    companyName: 'SARL UNA STORIA DI MARE', contactName: 'Di Mare',
    email: 'di@mare.fr', phone: '+33 1 23 45 67 89',
    addressLine1: '12 rue du Port', addressLine2: 'Bat. B', country: 'France', vatNumber: 'FR123456',
    shippingSameAsBilling: false, shippingAddressLine1: '9 quai Neuf', shippingAddressLine2: '', shippingCountry: 'France',
    dzbEnabled: true, dzbClientNumber: 'DZB-99', jewelerGroup: 'synalia', synaliaEnabled: true, synalia: true,
    discountDisplay: '10 %', finalTotalOverride: 3000,
    hasPrepayment: true, prepaymentAmount: 500, prepaymentMethod: 'transfer',
    shippingAmount: 45, taxPercent: 20, taxLabel: 'TVA 20 %',
    customLineLabel: 'Engraving', customLineAmount: 80,
    remarks: 'Deliver before the fair', date: '2026-09-15',
    eventName: 'Bijorhca', createdBy: 'Wassila Mekidiche',
  }

  it('keeps the cart and the price list', () => {
    const next = formStateForNewClient(saved, { companyName: 'THEATRE O FEES' })
    expect(next.rows).toEqual(saved.rows)
    expect(next).toMatchObject({ packaging: 'pouch', hasVitrine: true, vitrinePrice: 250, vitrineQty: 1, pricelistYear: '2026-10' })
  })

  it('takes the new client’s names and drops the old one entirely', () => {
    const next = formStateForNewClient(saved, { companyName: 'THEATRE O FEES', contactName: 'Claire Blanc' })
    expect(next.companyName).toBe('THEATRE O FEES')
    expect(next.contactName).toBe('Claire Blanc')
    for (const key of ['email', 'phone', 'addressLine1', 'addressLine2', 'country', 'vatNumber',
      'shippingAddressLine1', 'shippingAddressLine2', 'shippingCountry', 'shippingSameAsBilling',
      'dzbEnabled', 'dzbClientNumber', 'jewelerGroup', 'synaliaEnabled', 'synalia']) {
      expect(next).not.toHaveProperty(key)
    }
  })

  it('drops the old deal — discount, override, prepayment, tax, shipping, custom line, remarks, date', () => {
    const next = formStateForNewClient(saved, { companyName: 'THEATRE O FEES' })
    for (const key of ['discountDisplay', 'finalTotalOverride', 'hasPrepayment', 'prepaymentAmount',
      'prepaymentMethod', 'shippingAmount', 'taxPercent', 'taxLabel', 'customLineLabel',
      'customLineAmount', 'remarks', 'date']) {
      expect(next).not.toHaveProperty(key)
    }
  })

  it('still strips the fair and the author, like a restock', () => {
    const next = formStateForNewClient(saved, { companyName: 'X' })
    expect(next).not.toHaveProperty('eventName')
    expect(next).not.toHaveProperty('createdBy')
  })

  it('trims, ignores blank names, and refuses a missing formState', () => {
    const next = formStateForNewClient(saved, { companyName: '  THEATRE O FEES  ', contactName: '   ' })
    expect(next.companyName).toBe('THEATRE O FEES')
    expect(next).not.toHaveProperty('contactName')
    expect(formStateForNewClient(null, { companyName: 'X' })).toBeNull()
  })

  it('leaves the source untouched', () => {
    const copy = JSON.parse(JSON.stringify(saved))
    formStateForNewClient(saved, { companyName: 'X' })
    expect(saved).toEqual(copy)
  })
})

describe('clientRowToFormFields (a saved boutique fills the new order)', () => {
  const row = {
    id: 'c1', company: 'THEATRE O FEES', name: 'Claire Blanc', email: 'claire@theatre.fr', phone: '+33 4 11 22 33 44',
    country: 'France', address: '3 place du Marché', zip: '69001', city: 'Lyon', vat: 'FR998877',
    dzb_client_number: 'DZB-42', jeweler_group: 'synalia',
    shipping_same_as_billing: false, shipping_address: '7 rue Neuve', shipping_address_line2: 'Dépôt', shipping_country: 'France',
  }

  it('maps the directory row onto the order header fields', () => {
    expect(clientRowToFormFields(row)).toEqual({
      companyName: 'THEATRE O FEES', contactName: 'Claire Blanc', email: 'claire@theatre.fr', phone: '+33 4 11 22 33 44',
      country: 'France', addressLine1: '3 place du Marché', addressLine2: '69001 Lyon', vatNumber: 'FR998877',
      dzbClientNumber: 'DZB-42', dzbEnabled: true, jewelerGroup: 'synalia',
      shippingAddressLine1: '7 rue Neuve', shippingAddressLine2: 'Dépôt', shippingCountry: 'France',
      shippingSameAsBilling: false,
    })
    expect(clientRowToFormFields(null)).toEqual({})
  })

  it('a picked client lands on the duplicate, cart and all', () => {
    const saved = { rows: [{ collection: 'Multi Three', quantity: 12 }], pricelistYear: '2026-10', companyName: 'OLD SHOP', vatNumber: 'FR000', taxPercent: 20 }
    const next = formStateForNewClient(saved, clientRowToFormFields(row))
    expect(next.rows).toEqual(saved.rows)
    expect(next).toMatchObject({ companyName: 'THEATRE O FEES', vatNumber: 'FR998877', addressLine2: '69001 Lyon', dzbEnabled: true, shippingSameAsBilling: false })
    expect(next).not.toHaveProperty('taxPercent')
  })

  it('a client with nothing but a name leaves the rest empty rather than blanking with ""', () => {
    const next = formStateForNewClient({ rows: [], companyName: 'OLD', email: 'old@shop.fr' }, clientRowToFormFields({ company: 'NEW SHOP' }))
    expect(next.companyName).toBe('NEW SHOP')
    expect(next).not.toHaveProperty('email')
  })
})
