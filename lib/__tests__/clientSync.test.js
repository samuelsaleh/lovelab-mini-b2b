/**
 * clientAddressPatch — what an order save is allowed to write onto the client.
 *
 * The invariant: a blank form field must never reach the server as a value,
 * because the server treats a sent value as the truth. Folies lost its address
 * when an order with an empty header was saved and the sync sent the blanks.
 */

import { clientAddressPatch } from '../clientSync'

describe('clientAddressPatch', () => {
  test('a blank header sends nothing at all — never erases a stored address', () => {
    expect(clientAddressPatch({ addressLine1: '', addressLine2: '', country: '', vatNumber: '' })).toEqual({})
    expect(clientAddressPatch({})).toEqual({})
    expect(clientAddressPatch({ addressLine1: '   ', addressLine2: '  ' })).toEqual({})
  })

  test('splits "Postal code, City" into zip and city', () => {
    expect(clientAddressPatch({ addressLine1: '12 rue de la Paix', addressLine2: '75001 Paris', country: 'France' }))
      .toEqual({ address: '12 rue de la Paix', zip: '75001', city: 'Paris', country: 'France' })
  })

  test('handles the city-first spelling too', () => {
    const p = clientAddressPatch({ addressLine2: 'Antwerpen 2000' })
    expect(p).toEqual({ zip: '2000', city: 'Antwerpen' })
  })

  test('a city with no postcode is still a city', () => {
    expect(clientAddressPatch({ addressLine2: 'Lyon' })).toEqual({ city: 'Lyon' })
  })

  test('sends only the fields that have a value', () => {
    // Street known, second line empty: zip and city are simply absent, not ''.
    const p = clientAddressPatch({ addressLine1: '5 Meir', addressLine2: '' })
    expect(p).toEqual({ address: '5 Meir' })
    expect(p).not.toHaveProperty('zip')
    expect(p).not.toHaveProperty('city')
  })

  test('never writes the combined line into city', () => {
    const p = clientAddressPatch({ addressLine2: '80331 München' })
    expect(p.city).toBe('München')
    expect(p.city).not.toMatch(/\d/)
  })

  test('VAT rides along only when present', () => {
    expect(clientAddressPatch({ vatNumber: ' BE0123456789 ' })).toEqual({ vat: 'BE0123456789' })
    expect(clientAddressPatch({ vatNumber: '' })).toEqual({})
  })

  test('trims what it does send', () => {
    expect(clientAddressPatch({ addressLine1: '  5 Meir  ', country: ' Belgium ' }))
      .toEqual({ address: '5 Meir', country: 'Belgium' })
  })
})
