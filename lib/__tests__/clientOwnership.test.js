/**
 * Dionne, 15 Sept 2026: an order for Théâtrophil went out carrying DI MARE's
 * address, because nothing emptied the previous boutique's details when the
 * company name changed.
 *
 * The rule under test is ownership: details belong to the company they were
 * entered under, and they go when the name commits to a different one.
 */
import {
  clientForCompany,
  withDetailsOwner,
  blankClientDetails,
  companyKey,
} from '@/lib/clientGatePersistence'

const DI_MARE = {
  company: 'DI MARE - SARL UNA STORIA DI MARE',
  detailsOwner: 'DI MARE - SARL UNA STORIA DI MARE',
  name: 'MARINA FONDACCI',
  email: 'dimare.porticcio@gmail.com',
  phone: '0495',
  address: '19 Place Lacaze Duthiers',
  zip: '29680',
  city: 'Roscoff',
  country: 'France',
  vat: 'FR83791465057',
  vatValid: true,
  vatStatus: 'VALID',
  savedClientId: 'cb1dd20a',
  shipping_same_as_billing: false,
  shipping_address: 'Dépôt Porticcio',
  shipping_address_line2: '20166 Grosseto-Prugna',
  shipping_country: 'France',
}

describe('clientForCompany', () => {
  it('drops the previous boutique’s address when the name commits to another', () => {
    const next = clientForCompany(DI_MARE, 'THEATRE O FEES')
    expect(next.company).toBe('THEATRE O FEES')
    expect(next.address).toBe('')
    expect(next.zip).toBe('')
    expect(next.city).toBe('')
    expect(next.vat).toBe('')
    expect(next.savedClientId).toBeNull()
  })

  it('drops the delivery address too — that was the half nobody cleared', () => {
    const next = clientForCompany(DI_MARE, 'THEATRE O FEES')
    expect(next.shipping_address).toBe('')
    expect(next.shipping_address_line2).toBe('')
    expect(next.shipping_country).toBe('')
    expect(next.shipping_same_as_billing).toBe(true)
  })

  it('drops the contact as well, so no one is greeted by the wrong name', () => {
    const next = clientForCompany(DI_MARE, 'THEATRE O FEES')
    expect(next.name).toBe('')
    expect(next.email).toBe('')
    expect(next.phone).toBe('')
  })

  it('keeps everything when the name has not really changed', () => {
    for (const same of ['DI MARE - SARL UNA STORIA DI MARE', '  di mare - sarl una storia di mare  ']) {
      const next = clientForCompany(DI_MARE, same)
      expect(next.address).toBe('19 Place Lacaze Duthiers')
      expect(next.savedClientId).toBe('cb1dd20a')
    }
  })

  it('leaves an address typed before the name alone', () => {
    // No owner: the person is filling the form from the bottom up. This is the
    // case the old "clear nothing" branch existed to protect.
    const typing = { company: '', detailsOwner: '', address: '7 rue de Stassart', zip: '84100' }
    const next = clientForCompany(typing, 'THEATRE O FEES')
    expect(next.address).toBe('7 rue de Stassart')
    expect(next.company).toBe('THEATRE O FEES')
  })

  it('returns the same object when there is nothing to do', () => {
    const c = { company: 'X', detailsOwner: 'X', address: 'a' }
    expect(clientForCompany(c, 'X')).toBe(c)
  })

  it('survives a missing or malformed client', () => {
    expect(clientForCompany(null, 'X').company).toBe('X')
    expect(clientForCompany(undefined, '').company).toBe('')
  })

  it('keeps fields it does not own', () => {
    const next = clientForCompany({ ...DI_MARE, somethingElse: 'keep me' }, 'OTHER')
    expect(next.somethingElse).toBe('keep me')
  })
})

describe('withDetailsOwner', () => {
  it('claims the details for the company they were entered under', () => {
    const claimed = withDetailsOwner({ company: 'TOPAZE', address: '5 Rue du Sénat' }, 'TOPAZE')
    expect(claimed.detailsOwner).toBe('TOPAZE')
    expect(clientForCompany(claimed, 'AUTRE').address).toBe('')
  })

  it('does not churn state when the owner is unchanged', () => {
    const c = { detailsOwner: 'Topaze' }
    expect(withDetailsOwner(c, '  TOPAZE  ')).toBe(c)
  })
})

describe('companyKey and blankClientDetails', () => {
  it('ignores case and edge spaces, which is how the directory is typed', () => {
    expect(companyKey('  THEATRE O FEES ')).toBe(companyKey('theatre o fees'))
  })

  it('hands back a fresh object every time', () => {
    const a = blankClientDetails()
    a.address = 'mutated'
    expect(blankClientDetails().address).toBe('')
  })
})
