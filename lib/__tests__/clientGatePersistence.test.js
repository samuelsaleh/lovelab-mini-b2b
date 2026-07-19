/**
 * Client gate persistence + restock helpers (pure).
 */

import {
  buildPersistedAppState,
  shouldAdminBypassClientGate,
  restoreClientFromStorage,
  formStateForRestock,
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
