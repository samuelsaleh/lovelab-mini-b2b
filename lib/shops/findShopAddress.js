/**
 * Finding a shop's street address from its name and city.
 *
 * Server-only. Used by scripts/find-shop-addresses.mjs for the shops imported
 * from Salesforce (name + city, no street) and, later, by the territory map's
 * review screen. Two steps:
 *
 *   1. searchQueries(shop)      → up to five queries in the shop's language
 *   2. extractAddressCandidates → every "street, postcode city" an address
 *                                  pattern can read off the result snippets,
 *                                  scored by how well it matches the shop
 *
 * Nothing is invented. A candidate is only ever text that appeared in a
 * search result, with the page it came from. The caller decides; the review
 * sheet shows candidates, a person accepts one.
 */

import { searchWeb } from '../perplexity/search.js'

/** ISO country code and the words a local directory uses for a jeweller. */
const COUNTRY = {
  france: { code: 'FR', words: ['bijouterie', 'adresse'] },
  belgium: { code: 'BE', words: ['bijouterie juwelier', 'adresse'] },
  belgique: { code: 'BE', words: ['bijouterie', 'adresse'] },
  luxembourg: { code: 'LU', words: ['bijouterie', 'adresse'] },
  switzerland: { code: 'CH', words: ['bijouterie juwelier', 'adresse'] },
  germany: { code: 'DE', words: ['juwelier', 'adresse'] },
  austria: { code: 'AT', words: ['juwelier', 'adresse'] },
  netherlands: { code: 'NL', words: ['juwelier', 'adres'] },
  italy: { code: 'IT', words: ['gioielleria', 'indirizzo'] },
  spain: { code: 'ES', words: ['joyería', 'dirección'] },
  portugal: { code: 'PT', words: ['joalharia', 'morada'] },
  'united kingdom': { code: 'GB', words: ['jewellers', 'address'] },
  ireland: { code: 'IE', words: ['jewellers', 'address'] },
  'united states': { code: 'US', words: ['jewelry store', 'address'] },
  turkey: { code: 'TR', words: ['kuyumcu', 'adres'] },
  greece: { code: 'GR', words: ['κοσμηματοπωλείο', 'address'] },
  hungary: { code: 'HU', words: ['ékszer', 'cím'] },
  czechia: { code: 'CZ', words: ['klenotnictví', 'adresa'] },
  slovakia: { code: 'SK', words: ['klenotníctvo', 'adresa'] },
  slovenia: { code: 'SI', words: ['zlatarna', 'naslov'] },
  croatia: { code: 'HR', words: ['zlatarna', 'adresa'] },
  bulgaria: { code: 'BG', words: ['бижутерия', 'адрес'] },
  norway: { code: 'NO', words: ['gullsmed', 'adresse'] },
  lithuania: { code: 'LT', words: ['juvelyrika', 'adresas'] },
  albania: { code: 'AL', words: ['bizhuteri', 'adresa'] },
  'san marino': { code: 'SM', words: ['gioielleria', 'indirizzo'] },
  lebanon: { code: 'LB', words: ['jewelry', 'address'] },
  israel: { code: 'IL', words: ['jewelry', 'address'] },
  'united arab emirates': { code: 'AE', words: ['jewellery', 'address'] },
  'hong kong': { code: 'HK', words: ['jewellery', 'address'] },
  'south africa': { code: 'ZA', words: ['jewellers', 'address'] },
  senegal: { code: 'SN', words: ['bijouterie', 'adresse'] },
}

const UNKNOWN = (v) => !v || String(v).trim().toLowerCase() === 'unknown'

export function countryInfo(country) {
  return COUNTRY[String(country || '').trim().toLowerCase()] || null
}

/** Legal-form noise that hides the trading name: "SARL X", "X GmbH". */
export function tradingName(name) {
  return String(name || '')
    .replace(/\b(sarl|sas|sasu|eurl|sa|snc|gmbh|ag|kg|ohg|bv|bvba|nv|srl|s\.r\.l\.|ltd|limited|llc|inc|pty|shpk|d\.o\.o\.|doo|kft|s\.a\.|s\.r\.o\.)\b\.?/gi, ' ')
    .replace(/\(.*?\)/g, (m) => ' ' + m.slice(1, -1) + ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Up to five queries for one shop, most specific first. One Search API
 * request carries all of them and is billed once.
 */
export function searchQueries(shop) {
  const name = tradingName(shop.name)
  const city = UNKNOWN(shop.city) ? '' : String(shop.city).trim()
  const country = UNKNOWN(shop.country) ? '' : String(shop.country).trim()
  const info = countryInfo(country)
  const [trade, addressWord] = info ? info.words : ['jewellery', 'address']
  const place = [city, country].filter(Boolean).join(' ')

  const queries = []
  if (place) queries.push(`${name} ${place} ${addressWord}`)
  if (place) queries.push(`${name} ${trade} ${city || country}`)
  queries.push(`"${name}" ${trade}`)
  if (name !== shop.name && place) queries.push(`${shop.name} ${place}`)
  if (!place) queries.push(`${name} shop address`)

  return [...new Set(queries.map((q) => q.replace(/\s+/g, ' ').trim()))].slice(0, 5)
}

/* "Rue de la Paix 12", "12 rue de la Paix", "Hohe Straße 100", "Via Roma 4" — a
   street line: a house number next to words. */
const STREET = String.raw`(?:\d{1,4}\s?[a-zA-Z]?(?:[-/]\d{1,4})?[,\s]+[^\d,;|\n]{3,60}?|[^\d,;|\n]{3,60}?\s\d{1,4}\s?[a-zA-Z]?(?:[-/]\d{1,4})?)`
/* "75002", "1000", "1071 XD", "SW1A 1AA", "984 01", with an optional country prefix. */
const POSTCODE = String.raw`(?:[A-Z]{1,2}-)?(?:\d{4,5}(?:\s?[A-Z]{2})?|\d{3}\s\d{2}|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})`
const CITY = String.raw`[\p{L}][\p{L}' .\-]{1,40}`
const ADDRESS_RE = new RegExp(`(${STREET})[,\\s]+(${POSTCODE})\\s+(${CITY})`, 'gu')

function clean(s) { return String(s || '').replace(/\*\*|__|➤|·|•/g, ' ').replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '').trim() }

/* A snippet runs sentences together: "Follies Maastricht. Adres: Muntstraat 36".
   The street is what follows the last label or sentence break. */
function streetOnly(s) {
  // A period ends a sentence only after a real word: "Maastricht. Adres" splits,
  // the abbreviation in "P.C. Hooftstraat" does not.
  const parts = String(s || '').split(/\*\*|[·•➤]|\s[-–—]\s|(?<=\p{L}{3})\.\s*|\s*(?:[:;|]|\b(?:adres(?:se)?|address|indirizzo|dirección|anschrift|contact|kontakt)\b)\s*/iu).map(clean).filter(Boolean)
  const last = parts[parts.length - 1] || ''
  return /\d/.test(last) ? last.trim() : clean(s)
}
function fold(s) { return clean(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() }

/**
 * Every address-shaped run of text in the results, with where it came from.
 * Scored 0–1: the given city in the candidate's city (+0.5), the trading name
 * in the title or snippet (+0.3), a directory or official-looking page (+0.2).
 *
 * @param {Array<{title:string,url:string,snippet:string}>} results
 * @param {{name:string,city?:string,country?:string}} shop
 */
export function extractAddressCandidates(results, shop) {
  const wantCity = UNKNOWN(shop.city) ? '' : fold(shop.city)
  const nameTokens = fold(tradingName(shop.name)).split(/[^a-z0-9]+/).filter((t) => t.length > 2)
  const out = []
  const seen = new Set()

  for (const r of results || []) {
    const text = `${r?.title || ''}. ${r?.snippet || ''}`
    ADDRESS_RE.lastIndex = 0
    let m
    while ((m = ADDRESS_RE.exec(text))) {
      const street = streetOnly(m[1]), postcode = clean(m[2]).toUpperCase(), city = clean(m[3]).replace(/\s+(tel|tél|phone|t|fax|e-mail|email|horaires|öffnungszeiten|ouvert|open).*$/iu, '').replace(/[.,;:\s]+$/u, '')
      if (!street || !city || /\d{5,}/.test(city)) continue
      const key = fold(`${street}|${postcode}|${city}`)
      if (seen.has(key)) continue
      seen.add(key)

      let score = 0
      if (wantCity && fold(city).includes(wantCity.split(' ')[0])) score += 0.5
      const hay = fold(text)
      const hits = nameTokens.filter((t) => hay.includes(t)).length
      if (nameTokens.length && hits / nameTokens.length >= 0.6) score += 0.3
      if (/pagesjaunes|gelbeseiten|paginegialle|goudengids|local\.ch|yelp|tripadvisor|mapstr|google\.|facebook|instagram|infobel|herold|cylex|118000|societe\.com|kompass/i.test(r?.url || '')) score += 0.1
      if (hits && /\/(contact|kontakt|contatti|impressum|about|boutique|magasin|store)/i.test(r?.url || '')) score += 0.2

      out.push({ street, postcode, city, score: Math.min(1, Math.round(score * 100) / 100), source_url: r.url, source_title: r.title })
    }
  }
  return out.sort((a, b) => b.score - a.score)
}

/**
 * Search, then read addresses off the results.
 *
 * @param {{id?:any,name:string,city?:string,country?:string}} shop
 * @param {{ maxResults?: number, fetch?: Function }} options
 * @returns {Promise<{ shop, queries: string[], results: Array, candidates: Array, best: object|null }>}
 */
export async function findShopAddress(shop, options = {}) {
  const queries = searchQueries(shop)
  const info = countryInfo(shop.country)
  const { results } = await searchWeb({
    query: queries,
    maxResults: options.maxResults || 8,
    searchContextSize: 'medium',
    ...(info ? { country: info.code } : {}),
    ...(options.searchType ? { searchType: options.searchType } : {}),
    fetch: options.fetch,
  })
  const candidates = extractAddressCandidates(results, shop)
  const best = candidates.find((c) => c.score >= 0.5) || null
  return { shop, queries, results, candidates, best }
}
