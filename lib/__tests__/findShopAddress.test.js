/**
 * @jest-environment node
 *
 * lib/shops/findShopAddress.js — queries per shop, and reading addresses off
 * search snippets without inventing anything.
 */

const { searchQueries, tradingName, extractAddressCandidates, findShopAddress } = require('../shops/findShopAddress')

describe('tradingName', () => {
  it('drops the legal form and keeps the name people search for', () => {
    expect(tradingName('SARL SKYGARDEN')).toBe('SKYGARDEN')
    expect(tradingName('Zurich Digital GmBH')).toBe('Zurich Digital')
    expect(tradingName('SAS DIGNE D\'OR (GUILDE DES ORFEVRES)')).toBe('DIGNE D\'OR GUILDE DES ORFEVRES')
  })
})

describe('searchQueries', () => {
  it('asks in the shop\'s language, city first, and never more than five', () => {
    const q = searchQueries({ name: 'BIJOUTERIE VIBERT GUILDE DES ORFEVRES', city: 'ALBERTVILLE', country: 'France' })
    expect(q.length).toBeLessThanOrEqual(5)
    expect(q[0]).toBe('BIJOUTERIE VIBERT GUILDE DES ORFEVRES ALBERTVILLE France adresse')
    expect(q[1]).toMatch(/bijouterie ALBERTVILLE$/)
  })

  it('copes with an unknown city and country', () => {
    const q = searchQueries({ name: 'ERIK JUWELIER', city: 'Unknown', country: 'Unknown' })
    expect(q).toEqual(['"ERIK JUWELIER" jewellery', 'ERIK JUWELIER shop address'])
  })
})

describe('extractAddressCandidates', () => {
  const shop = { name: 'Bijouterie Vibert', city: 'Albertville', country: 'France' }

  it('reads street, postcode and city out of a directory snippet and scores the right city highest', () => {
    const results = [
      { title: 'Bijouterie Vibert Albertville - PagesJaunes', url: 'https://www.pagesjaunes.fr/pros/123', snippet: 'Bijouterie Vibert, 12 rue de la République, 73200 Albertville. Tél 04 79 00 00 00.' },
      { title: 'Vibert Chambéry', url: 'https://example.fr/x', snippet: 'Autre magasin: 3 place Saint-Léger, 73000 Chambéry' },
    ]
    const out = extractAddressCandidates(results, shop)
    expect(out[0]).toMatchObject({ street: '12 rue de la République', postcode: '73200', city: 'Albertville', source_url: 'https://www.pagesjaunes.fr/pros/123' })
    expect(out[0].score).toBeGreaterThanOrEqual(0.5)
    expect(out[1]).toMatchObject({ postcode: '73000', city: 'Chambéry' })
    expect(out[1].score).toBeLessThan(0.5)
  })

  it('handles German and Dutch address order', () => {
    const out = extractAddressCandidates([
      { title: 'Juwelier Hansen', url: 'https://hansen.example', snippet: 'Juwelier Hansen · Mönckebergstraße 7, 20095 Hamburg · Öffnungszeiten' },
      { title: 'Juwelier de Vries', url: 'https://devries.example', snippet: 'Bezoek ons: P.C. Hooftstraat 60, 1071 BZ Amsterdam' },
    ], { name: 'Hansen', city: 'Hamburg', country: 'Germany' })
    expect(out.find((c) => c.postcode === '20095')).toMatchObject({ street: 'Mönckebergstraße 7', city: 'Hamburg' })
    expect(out.find((c) => c.postcode === '1071 BZ')).toMatchObject({ street: 'P.C. Hooftstraat 60', city: 'Amsterdam' })
  })

  it('returns nothing when no snippet holds an address', () => {
    expect(extractAddressCandidates([{ title: 'About us', url: 'https://x', snippet: 'Family jewellers since 1952.' }], shop)).toEqual([])
  })
})

describe('findShopAddress', () => {
  const ORIGINAL_KEY = process.env.PERPLEXITY_API_KEY
  beforeEach(() => { process.env.PERPLEXITY_API_KEY = 'test-key' })
  afterAll(() => { process.env.PERPLEXITY_API_KEY = ORIGINAL_KEY })

  it('sends all queries in one request, scoped to the country, and returns the best candidate', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ id: 'r', results: [
        { title: 'Bijouterie Vibert', url: 'https://vibert.example/contact', snippet: 'Bijouterie Vibert — 12 rue de la République, 73200 Albertville' },
      ] }),
    })
    const out = await findShopAddress({ id: 4, name: 'BIJOUTERIE VIBERT GUILDE DES ORFEVRES', city: 'ALBERTVILLE', country: 'France' }, { fetch })
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(Array.isArray(body.query)).toBe(true)
    expect(body.country).toBe('FR')
    expect(body.max_results).toBe(8)
    expect(out.best).toMatchObject({ street: '12 rue de la République', postcode: '73200', city: 'Albertville' })
  })
})
