/**
 * Order search — company on the form, accents, Friends aliases.
 */

const { documentMatchesSearch, normalizeSearchText } = require('../documentSearch')

const formCompany = (name, extra = {}) => ({
  client_company: '',
  client_name: extra.contact || '',
  file_name: extra.file || 'Order.pdf',
  metadata: { formState: { companyName: name, contactName: extra.contact || '' } },
})

describe('normalizeSearchText', () => {
  it('strips accents and punctuation', () => {
    expect(normalizeSearchText("FR's Friends")).toBe('frs friends')
    expect(normalizeSearchText('Café Müller')).toBe('cafe muller')
  })
})

describe('documentMatchesSearch', () => {
  it('keeps everything when the query is blank', () => {
    expect(documentMatchesSearch(formCompany('SAS Caprice'), '')).toBe(true)
    expect(documentMatchesSearch(formCompany('SAS Caprice'), '   ')).toBe(true)
  })

  it('finds a company that only lives on the form', () => {
    const doc = formCompany('SAS Caprice')
    expect(documentMatchesSearch(doc, 'caprice')).toBe(true)
    expect(documentMatchesSearch(doc, 'SAS Caprice')).toBe(true)
    expect(documentMatchesSearch(doc, 'nobody')).toBe(false)
  })

  it('ignores accents so cafe finds Café', () => {
    expect(documentMatchesSearch(formCompany('Café Bijou'), 'cafe')).toBe(true)
  })

  it('treats Friends / Stage / DE as the same client', () => {
    expect(documentMatchesSearch({ client_company: 'Stage' }, 'friends')).toBe(true)
    expect(documentMatchesSearch({ client_company: 'DE' }, 'friends')).toBe(true)
    expect(documentMatchesSearch(formCompany("FR's Friends"), 'friends')).toBe(true)
    expect(documentMatchesSearch({ client_company: 'Stage' }, 'stage')).toBe(true)
  })

  it('still matches the column company and the contact name', () => {
    const doc = { client_company: 'FARANDOLE', client_name: 'Valerie' }
    expect(documentMatchesSearch(doc, 'farandole')).toBe(true)
    expect(documentMatchesSearch(doc, 'valerie')).toBe(true)
  })

  it('reads a commission row through document + client_label', () => {
    const row = {
      type: 'order',
      client_label: 'Shown Label',
      document: { client_company: 'BIJOUTERIE CURIOZA' },
    }
    expect(documentMatchesSearch(row, 'curioza')).toBe(true)
    expect(documentMatchesSearch(row, 'shown')).toBe(true)
    expect(documentMatchesSearch(row, 'caprice')).toBe(false)
  })
})
