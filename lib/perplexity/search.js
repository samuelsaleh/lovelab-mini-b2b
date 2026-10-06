/**
 * Perplexity Search API — ranked web results as data, no LLM answer.
 *
 * Server-only. The key is PERPLEXITY_API_KEY, the same key the Agent API
 * proxy (app/api/perplexity/route.js) already uses; nothing here ever logs it.
 *
 * Why this exists (Sam, 6 Oct 2026): 199 shops imported from Salesforce have a
 * name and a city but no street. The territory map needs a street for each,
 * so lib/shops/findShopAddress.js searches the web for every shop and reads
 * the address off the results. Search is the right surface for that: we want
 * the pages and snippets to inspect ourselves, not a written answer.
 *
 * Request and response shapes follow docs.perplexity.ai/api-reference/search-post
 * (read 6 Oct 2026): POST https://api.perplexity.ai/search with
 * { query: string | string[] (max 5), max_results 1–50 (default 10),
 *   search_type web|fast|people, search_context_size low|medium|high,
 *   country (ISO 3166-1 alpha-2), search_domain_filter (max 20, "-" prefix
 *   denies), search_language_filter (ISO 639-1, max 20), date filters }.
 * Answers { results: [{ title, url, snippet, date, last_updated }], id }.
 * One request with several queries is billed as one request.
 */

export const PERPLEXITY_SEARCH_URL = 'https://api.perplexity.ai/search'

const TIMEOUT_MS = 30_000
const MAX_QUERIES = 5
const MAX_RESULTS = 50
const MAX_DOMAINS = 20
const CONTEXT_SIZES = new Set(['low', 'medium', 'high'])
const SEARCH_TYPES = new Set(['web', 'fast', 'people'])

/**
 * Builds the request body, validating the few things the API rejects with a
 * 422 so the caller gets a readable error before any network call.
 */
export function buildSearchBody({
  query,
  maxResults,
  searchType,
  searchContextSize,
  country,
  searchDomainFilter,
  searchLanguageFilter,
  searchRecencyFilter,
} = {}) {
  const queries = (Array.isArray(query) ? query : [query])
    .map((q) => (typeof q === 'string' ? q.trim() : ''))
    .filter(Boolean)
  if (!queries.length) throw new Error('Perplexity search: query is required')
  if (queries.length > MAX_QUERIES) throw new Error(`Perplexity search: at most ${MAX_QUERIES} queries per request`)

  const body = { query: queries.length === 1 ? queries[0] : queries }

  if (maxResults !== undefined) {
    const n = Number(maxResults)
    if (!Number.isInteger(n) || n < 1 || n > MAX_RESULTS) throw new Error(`Perplexity search: max_results must be 1–${MAX_RESULTS}`)
    body.max_results = n
  }
  if (searchType !== undefined) {
    if (!SEARCH_TYPES.has(searchType)) throw new Error('Perplexity search: search_type must be web, fast or people')
    body.search_type = searchType
  }
  if (searchContextSize !== undefined) {
    if (!CONTEXT_SIZES.has(searchContextSize)) throw new Error('Perplexity search: search_context_size must be low, medium or high')
    body.search_context_size = searchContextSize
  }
  if (country) {
    const c = String(country).trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(c)) throw new Error('Perplexity search: country must be a 2-letter ISO 3166-1 code')
    body.country = c
  }
  if (Array.isArray(searchDomainFilter) && searchDomainFilter.length) {
    if (searchDomainFilter.length > MAX_DOMAINS) throw new Error(`Perplexity search: at most ${MAX_DOMAINS} domains`)
    const allow = searchDomainFilter.filter((d) => !String(d).startsWith('-')).length
    const deny = searchDomainFilter.length - allow
    if (allow && deny) throw new Error('Perplexity search: cannot mix allowed and denied domains in one request')
    body.search_domain_filter = searchDomainFilter.map((d) => String(d).trim()).filter(Boolean)
  }
  if (Array.isArray(searchLanguageFilter) && searchLanguageFilter.length) {
    body.search_language_filter = searchLanguageFilter.map((l) => String(l).trim().toLowerCase()).filter((l) => /^[a-z]{2}$/.test(l))
  }
  if (searchRecencyFilter) body.search_recency_filter = searchRecencyFilter

  return body
}

/** Same URL twice in a merged list means the same page; keep the first. */
export function dedupeResults(results) {
  const seen = new Set()
  const out = []
  for (const r of results || []) {
    const key = normalizeUrl(r?.url)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

function normalizeUrl(url) {
  if (typeof url !== 'string' || !url) return ''
  try {
    const u = new URL(url)
    u.hash = ''
    u.hostname = u.hostname.replace(/^www\./, '')
    let s = u.toString()
    if (s.endsWith('/')) s = s.slice(0, -1)
    return s.toLowerCase()
  } catch {
    return url.trim().toLowerCase()
  }
}

function retryAfterMs(response) {
  const raw = response.headers?.get?.('retry-after')
  if (!raw) return 2_000
  const seconds = Number(raw)
  if (Number.isFinite(seconds)) return Math.min(60_000, Math.max(1_000, seconds * 1_000))
  const at = Date.parse(raw)
  return Number.isFinite(at) ? Math.min(60_000, Math.max(1_000, at - Date.now())) : 2_000
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One search request. Several queries go in one call (billed once).
 *
 * @param {object} options  see buildSearchBody, plus `retries` (default 2)
 *   for 429 and 5xx answers, honouring Retry-After.
 * @returns {Promise<{ results: Array<{title:string,url:string,snippet:string,date:string|null,last_updated:string|null}>, id: string|null }>}
 * @throws Error with `.status` on an HTTP error, after retries.
 */
export async function searchWeb(options = {}) {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY is not configured')

  const body = buildSearchBody(options)
  const retries = Number.isInteger(options.retries) ? options.retries : 2
  const fetchImpl = options.fetch || fetch

  let attempt = 0
  for (;;) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let response
    try {
      response = await fetchImpl(PERPLEXITY_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timer)
      if (err?.name === 'AbortError') throw new Error(`Perplexity search did not answer within ${TIMEOUT_MS / 1000}s`)
      throw new Error(`Perplexity search unreachable: ${err?.message || 'network error'}`)
    }
    clearTimeout(timer)

    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      attempt += 1
      await sleep(retryAfterMs(response) * attempt)
      continue
    }

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const msg = data?.error?.message || data?.detail?.[0]?.msg || data?.error || `HTTP ${response.status}`
      const err = new Error(`Perplexity search: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`)
      err.status = response.status
      err.body = data
      throw err
    }
    if (!data || !Array.isArray(data.results)) throw new Error('Perplexity search answered in an unexpected shape')

    return { results: dedupeResults(data.results), id: data.id || null }
  }
}
