/**
 * The last check before an order is saved: is this address still the one the
 * directory holds for this boutique?
 *
 * The bar is deliberately high. Interrupting a sale over "Elisabethstr." vs
 * "Elisabethstraße" would teach everyone to click through the warning, and
 * then it catches nothing. The real cases from production are pinned below.
 */
import { addressMatchesClient, normalizeAddress, postcodeOf, formatClientAddress } from '@/lib/addressMatch'

const check = (a1, a2, row) => addressMatchesClient({ addressLine1: a1, addressLine2: a2 }, row)

describe('addressMatchesClient — the case that started this', () => {
  it('flags Théâtrophil carrying DI MARE’s address', () => {
    const res = check('19 Place Lacaze Duthiers', '29680 Roscoff', {
      address: '7 rue de Stassart', zip: '84100', city: 'ORANGE',
    })
    expect(res.match).toBe(false)
    expect(res.reason).toBe('postcode')
  })

  it('passes the corrected order', () => {
    expect(check(' 7 rue de Stassart ', '84100  ORANGE', {
      address: '7 rue de Stassart', zip: '84100', city: 'ORANGE',
    }).match).toBe(true)
  })
})

describe('addressMatchesClient — real spelling variants must not warn', () => {
  const cases = [
    ['Elisabethstraße 2', '25980 Sylt OT Westerland', { address: 'Elisabethstr. 2', zip: '25980', city: 'Sylt OT Westerland' }],
    ['9 rue de Toulzac', '19100 BRIVE LA GAILLARDE', { address: '9 rue Toulzac', zip: '19100', city: 'Brive-la-Gaillarde' }],
    ['33 Rue Cardinal Fesch', '20000 - Ajaccio', { address: '33 Rue Cardinal Fesch,', zip: '20000', city: 'AJACCIO' }],
    ['Unterstr. 6', '51371 Leverkusen-Hitdorf', { address: 'Unterstraße 6', zip: '51371', city: 'Leverkusen- Rheindorf' }],
  ]
  it.each(cases)('accepts %s', (a1, a2, row) => {
    expect(check(a1, a2, row).match).toBe(true)
  })
})

describe('addressMatchesClient — a different town is the loud case', () => {
  it('flags TOPAZE in Mende against a record in Chambéry', () => {
    expect(check("1 Rue de L'arjal", '48000 Mende', {
      address: '5 Rue du Sénat de Savoie', zip: '73000', city: 'Chambéry',
    })).toEqual({ match: false, reason: 'postcode' })
  })

  it('flags a different street in the same town, more quietly', () => {
    expect(check('1 Rue abbatucci', '20137 PORTO VECCHIO', {
      address: '15 Rue Borgo', zip: '20137', city: 'Porto-Vecchio',
    })).toEqual({ match: false, reason: 'street' })
  })

  it('reads the postcode out of the city when zip is empty', () => {
    expect(check('Pfarrgasse 16', '4400 Steyr', { address: 'Pfarrgasse 16', city: '4400 Steyr' }).match).toBe(true)
  })
})

describe('addressMatchesClient — nothing to compare never warns', () => {
  it.each([
    ['no address on the order', '', '', { address: '5 Rue du Sénat', zip: '73000' }],
    ['no address on record', '5 Rue du Sénat', '73000 Chambéry', { address: null, zip: null, city: null }],
    ['neither side', '', '', {}],
  ])('%s', (_label, a1, a2, row) => {
    expect(addressMatchesClient({ addressLine1: a1, addressLine2: a2 }, row)).toEqual({ match: true, reason: 'empty' })
  })

  it('survives a missing row or order', () => {
    expect(addressMatchesClient(null, null).match).toBe(true)
    expect(addressMatchesClient(undefined, { address: 'x' }).match).toBe(true)
  })
})

describe('normalizeAddress and postcodeOf', () => {
  it('folds accents, case, punctuation and street words', () => {
    expect(normalizeAddress('9, Rue de Toulzac')).toBe(normalizeAddress('9 rue Toulzac'))
    expect(normalizeAddress('Avenue des Jeux')).toBe(normalizeAddress('Av des Jeux'))
  })

  it('keeps the house number, which is what tells two doors apart', () => {
    expect(normalizeAddress('15 Rue Borgo')).not.toBe(normalizeAddress('17 Rue Borgo'))
  })

  it('finds a postcode wherever it sits', () => {
    expect(postcodeOf('84100  ORANGE')).toBe('84100')
    expect(postcodeOf('Sylt OT Westerland 25980')).toBe('25980')
    expect(postcodeOf('1181 KK Amstelveen')).toBe('1181')
    expect(postcodeOf('Porto Vecchio')).toBe('')
  })
})

describe('formatClientAddress', () => {
  it('reads as one line, and skips what is missing', () => {
    expect(formatClientAddress({ address: '7 rue de Stassart', zip: '84100', city: 'ORANGE' }))
      .toBe('7 rue de Stassart, 84100 ORANGE')
    expect(formatClientAddress({ address: 'Pfarrgasse 16' })).toBe('Pfarrgasse 16')
    expect(formatClientAddress({})).toBe('')
  })
})
