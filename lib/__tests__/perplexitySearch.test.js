/**
 * @jest-environment node
 *
 * lib/perplexity/search.js — the Search API request shape, the response we
 * read, dedupe, and the retry on 429 honouring Retry-After.
 */

const { searchWeb, buildSearchBody, dedupeResults, PERPLEXITY_SEARCH_URL } = require('../perplexity/search')

const ORIGINAL_KEY = process.env.PERPLEXITY_API_KEY

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  }
}

beforeEach(() => { process.env.PERPLEXITY_API_KEY = 'test-key' })
afterAll(() => { process.env.PERPLEXITY_API_KEY = ORIGINAL_KEY })

describe('buildSearchBody', () => {
  it('sends a single query as a string and several as an array', () => {
    expect(buildSearchBody({ query: ' one ' })).toEqual({ query: 'one' })
    expect(buildSearchBody({ query: ['a', 'b'] }).query).toEqual(['a', 'b'])
  })

  it('refuses more than five queries, a bad max_results and a mixed domain filter', () => {
    expect(() => buildSearchBody({ query: ['1', '2', '3', '4', '5', '6'] })).toThrow(/at most 5/)
    expect(() => buildSearchBody({ query: 'x', maxResults: 0 })).toThrow(/max_results/)
    expect(() => buildSearchBody({ query: 'x', searchDomainFilter: ['pagesjaunes.fr', '-reddit.com'] })).toThrow(/mix/)
  })

  it('uses the documented parameter names', () => {
    const body = buildSearchBody({
      query: 'x', maxResults: 5, searchType: 'fast', searchContextSize: 'low', country: 'fr',
      searchDomainFilter: ['pagesjaunes.fr'], searchLanguageFilter: ['FR', 'en'],
    })
    expect(body).toEqual({
      query: 'x', max_results: 5, search_type: 'fast', search_context_size: 'low', country: 'FR',
      search_domain_filter: ['pagesjaunes.fr'], search_language_filter: ['fr', 'en'],
    })
  })
})

describe('dedupeResults', () => {
  it('keeps the first of two results that point at the same page', () => {
    const out = dedupeResults([
      { url: 'https://www.example.com/shop/', title: 'first' },
      { url: 'https://example.com/shop#contact', title: 'second' },
      { url: 'https://example.com/other', title: 'third' },
    ])
    expect(out.map((r) => r.title)).toEqual(['first', 'third'])
  })
})

describe('searchWeb', () => {
  it('posts to the Search endpoint with the bearer key and reads results', async () => {
    const fetch = jest.fn().mockResolvedValue(jsonResponse(200, {
      id: 'req_1',
      results: [{ title: 'A', url: 'https://a.example', snippet: 's', date: null, last_updated: null }],
    }))
    const out = await searchWeb({ query: 'bijouterie lyon', maxResults: 3, fetch })

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(PERPLEXITY_SEARCH_URL)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer test-key')
    expect(JSON.parse(init.body)).toEqual({ query: 'bijouterie lyon', max_results: 3 })
    expect(out).toEqual({ id: 'req_1', results: [{ title: 'A', url: 'https://a.example', snippet: 's', date: null, last_updated: null }] })
  })

  it('retries once on 429, waiting for Retry-After, then succeeds', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: 'slow down' }, { 'retry-after': '1' }))
      .mockResolvedValueOnce(jsonResponse(200, { results: [] }))
    const out = await searchWeb({ query: 'x', fetch, retries: 1 })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(out.results).toEqual([])
  })

  it('surfaces an HTTP error with its status after retries are spent', async () => {
    const fetch = jest.fn().mockResolvedValue(jsonResponse(401, { error: { message: 'bad key' } }))
    await expect(searchWeb({ query: 'x', fetch, retries: 0 })).rejects.toMatchObject({ status: 401, message: /bad key/ })
  })

  it('refuses to run without a key and never calls the network', async () => {
    delete process.env.PERPLEXITY_API_KEY
    const fetch = jest.fn()
    await expect(searchWeb({ query: 'x', fetch })).rejects.toThrow(/PERPLEXITY_API_KEY/)
    expect(fetch).not.toHaveBeenCalled()
  })
})
