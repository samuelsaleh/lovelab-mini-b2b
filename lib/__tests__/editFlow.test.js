/**
 * Re-edit flow — the transitions that keep an edited order attached to the
 * document it came from.
 *
 * Reproduces the fair-day bug: a client's order is reopened, taken through
 * the Builder to change colours, and Finalized. Before this module, Finalize
 * reset the editing context, so the order form came back with blank shipping
 * notes, under the previously-selected client, and Save created a second
 * document instead of updating the first.
 */

import { finalizeTransition, clientFromFormState, editingOrderLabel } from '../editFlow'

const SAVED = {
  companyName: 'Cerise',
  contactName: 'Janina Mummert',
  remarks: 'Ship after the 15th. Pay by bank transfer.',
  shippingAmount: 25,
  hasPrepayment: true,
  prepaymentAmount: '200',
  prepaymentMethod: 'Bank transfer',
  pricelistYear: '2026',
  rows: [{ collection: 'CUTY', colorCord: 'Red', quantity: '3' }],
}

describe('finalizeTransition — a brand-new build', () => {
  test('clears the whole editing context, as before', () => {
    expect(finalizeTransition({
      editingDocumentId: null, savedFormState: null, initialOrderChannel: 'b2b',
    })).toEqual({ editingDocumentId: null, savedFormState: null, initialOrderChannel: 'b2b' })
  })

  test('drops stray saved state when there is no document to attach it to', () => {
    // A leftover formState with no editingDocumentId is not an edit.
    expect(finalizeTransition({
      editingDocumentId: null, savedFormState: SAVED, initialOrderChannel: 'consignment',
    })).toEqual({ editingDocumentId: null, savedFormState: null, initialOrderChannel: 'b2b' })
  })
})

describe('finalizeTransition — an existing order edited in the Builder', () => {
  const next = finalizeTransition({
    editingDocumentId: 'doc-123', savedFormState: SAVED, initialOrderChannel: 'b2b',
  })

  test('keeps the document id so Save updates instead of creating a twin', () => {
    expect(next.editingDocumentId).toBe('doc-123')
  })

  test('keeps the shipping and payment notes the client typed', () => {
    expect(next.savedFormState.remarks).toBe(SAVED.remarks)
    expect(next.savedFormState.shippingAmount).toBe(25)
    expect(next.savedFormState.hasPrepayment).toBe(true)
    expect(next.savedFormState.prepaymentAmount).toBe('200')
    expect(next.savedFormState.prepaymentMethod).toBe('Bank transfer')
  })

  test('keeps the client so the order saves under the right boutique', () => {
    expect(next.savedFormState.companyName).toBe('Cerise')
    expect(next.savedFormState.contactName).toBe('Janina Mummert')
  })

  test('drops the saved rows so the Builder\'s changes win', () => {
    // The Order Form prefills rows from the Builder quote only when the saved
    // state has none; keeping the old rows would silently undo the edit.
    expect(next.savedFormState).not.toHaveProperty('rows')
  })

  test('keeps the document\'s order channel rather than forcing b2b', () => {
    expect(finalizeTransition({
      editingDocumentId: 'doc-1', savedFormState: SAVED, initialOrderChannel: 'consignment',
    }).initialOrderChannel).toBe('consignment')
  })

  test('tolerates an edit whose saved state was only rows', () => {
    const r = finalizeTransition({
      editingDocumentId: 'doc-1', savedFormState: { rows: SAVED.rows }, initialOrderChannel: 'b2b',
    })
    expect(r.editingDocumentId).toBe('doc-1')
    expect(r.savedFormState).toBeNull()
  })

  test('does not mutate the saved state it was given', () => {
    const copy = JSON.parse(JSON.stringify(SAVED))
    finalizeTransition({ editingDocumentId: 'doc-1', savedFormState: copy, initialOrderChannel: 'b2b' })
    expect(copy).toEqual(SAVED)
  })
})

describe('clientFromFormState', () => {
  const PREV = {
    name: 'Old Contact', company: 'Previous Boutique', country: 'FR',
    address: '1 rue X', city: 'Paris', zip: '75001', email: 'old@x.fr', phone: '01',
    vat: 'FR1', dzb_client_number: '', jeweler_group: null,
    shipping_same_as_billing: true, shipping_address: '', shipping_address_line2: '', shipping_country: '',
  }

  test('points the client gate at the document\'s boutique', () => {
    const c = clientFromFormState(SAVED, PREV)
    expect(c.company).toBe('Cerise')
    expect(c.name).toBe('Janina Mummert')
  })

  test('falls back to the previous value only for fields the document lacks', () => {
    const c = clientFromFormState({ companyName: 'Cerise' }, PREV)
    expect(c.company).toBe('Cerise')
    expect(c.email).toBe('old@x.fr')
    expect(c.country).toBe('FR')
  })

  test('shipping_same_as_billing is true unless the document says false', () => {
    expect(clientFromFormState({}, PREV).shipping_same_as_billing).toBe(true)
    expect(clientFromFormState({ shippingSameAsBilling: false }, PREV).shipping_same_as_billing).toBe(false)
  })

  test('survives a null previous client', () => {
    expect(clientFromFormState(SAVED, null).company).toBe('Cerise')
  })
})

describe('editingOrderLabel', () => {
  test('is null for a new build', () => {
    expect(editingOrderLabel({ editingDocumentId: null, savedFormState: SAVED })).toBeNull()
  })

  test('names the boutique being edited', () => {
    expect(editingOrderLabel({ editingDocumentId: 'd', savedFormState: SAVED })).toBe('Editing order for Cerise')
  })

  test('falls back to the contact, then to a generic label', () => {
    expect(editingOrderLabel({ editingDocumentId: 'd', savedFormState: { contactName: 'Janina' } }))
      .toBe('Editing order for Janina')
    expect(editingOrderLabel({ editingDocumentId: 'd', savedFormState: null }))
      .toBe('Editing an existing order')
  })
})
