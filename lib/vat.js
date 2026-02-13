/**
 * EU VAT validation helper using VIES API
 */

// EU country codes supported by VIES
export const EU_COUNTRIES = {
  AT: 'Austria',
  BE: 'Belgium',
  BG: 'Bulgaria',
  CY: 'Cyprus',
  CZ: 'Czech Republic',
  DE: 'Germany',
  DK: 'Denmark',
  EE: 'Estonia',
  EL: 'Greece',
  ES: 'Spain',
  FI: 'Finland',
  FR: 'France',
  HR: 'Croatia',
  HU: 'Hungary',
  IE: 'Ireland',
  IT: 'Italy',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  LV: 'Latvia',
  MT: 'Malta',
  NL: 'Netherlands',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  SE: 'Sweden',
  SI: 'Slovenia',
  SK: 'Slovakia',
  XI: 'Northern Ireland',
}

// Common aliases that users type but VIES uses a different code
const COUNTRY_CODE_ALIASES = {
  GR: 'EL', // Greece: ISO 3166 is GR, but VIES uses EL
}

// Additional country name aliases for guessCountryCode
const COUNTRY_NAME_ALIASES = {
  'CZECHIA': 'CZ',
  'CZECH REPUBLIC': 'CZ',
  'GREECE': 'EL',
  'NORTHERN IRELAND': 'XI',
}

/**
 * Parse a VAT string to extract country code and number.
 * Handles formats like: "BE0123456789", "BE 0123.456.789", "BE-0123456789", "GR123456789"
 * @param {string} vatString 
 * @returns {{ countryCode: string, number: string } | null}
 */
export function parseVAT(vatString) {
  if (!vatString || typeof vatString !== 'string') return null
  
  // Remove spaces, dots, dashes
  const cleaned = vatString.replace(/[\s.\-]/g, '').toUpperCase()
  
  if (cleaned.length < 4) return null
  
  // First 2 characters should be country code
  let countryCode = cleaned.slice(0, 2)
  const number = cleaned.slice(2)
  
  // Map aliases (e.g., GR -> EL for Greece)
  if (COUNTRY_CODE_ALIASES[countryCode]) {
    countryCode = COUNTRY_CODE_ALIASES[countryCode]
  }
  
  // Check if it's a valid EU country code
  if (!EU_COUNTRIES[countryCode]) {
    // Maybe the string doesn't have a country prefix -- return null
    return null
  }
  
  return { countryCode, number }
}

/**
 * Sleep helper for retry logic
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function jitterDelay(ms) {
  // Add +/-20% jitter to reduce concurrency bursts.
  const factor = 0.8 + Math.random() * 0.4
  return Math.round(ms * factor)
}

function isRetryableErrorCode(code) {
  // Retryable conditions (VIES / member state busy or unavailable)
  return new Set([
    'MS_MAX_CONCURRENT_REQ',
    'MS_MAX_CONCURRENT_REQ_TIME',
    'MS_UNAVAILABLE',
    'SERVICE_UNAVAILABLE',
    'TIMEOUT',
    'GLOBAL_MAX_CONCURRENT_REQ',
    'GLOBAL_MAX_CONCURRENT_REQ_TIME',
    // Also treat upstream HTTP transient errors as retryable
    'HTTP_429',
    'HTTP_503',
    'HTTP_504',
    'NETWORK_ERROR',
  ]).has(code)
}

function mapUnverifiedMessageKey(errorCode) {
  const code = String(errorCode || '')
  if (code === 'TIMEOUT' || code === 'HTTP_504') return 'vat.unverified.timeout'
  if (code === 'MS_UNAVAILABLE' || code === 'SERVICE_UNAVAILABLE' || code === 'HTTP_503') return 'vat.unverified.unavailable'
  if (code.includes('MAX_CONCURRENT_REQ') || code === 'HTTP_429') return 'vat.unverified.busy'
  return 'vat.unverified.generic'
}

/**
 * Validate a VAT number against the EU VIES database.
 * Includes retry logic with exponential backoff for rate-limited requests.
 * @param {string} vatString - Full VAT number with country prefix (e.g., "BE0123456789")
 * @returns {Promise<{ valid: boolean|null, status: 'VALID'|'INVALID'|'UNVERIFIED', errorCode?: string|null, messageKey?: string|null, name: string, address: string, countryCode: string, vatNumber: string }>}
 */
export async function validateVAT(vatString) {
  const parsed = parseVAT(vatString)
  
  if (!parsed) {
    return {
      valid: false,
      status: 'INVALID',
      errorCode: 'INVALID_FORMAT',
      messageKey: 'vat.invalidFormat',
      name: '',
      address: '',
      countryCode: '',
      vatNumber: vatString || '',
    }
  }
  
  // Retry config: up to 3 attempts with exponential backoff
  const maxRetries = 3
  const baseDelay = 1500 // 1.5 seconds
  let lastErrorCode = ''
  let lastMessageKey = ''
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(`/api/vat?country=${parsed.countryCode}&number=${parsed.number}`)
      
      if (!res.ok) {
        lastErrorCode = `HTTP_${res.status}`
        lastMessageKey = mapUnverifiedMessageKey(lastErrorCode)

        // If rate limited, prefer server-provided retry-after if present
        let delay = baseDelay * Math.pow(2, attempt)
        const retryAfter = res.headers?.get?.('Retry-After')
        const retryAfterSec = retryAfter ? Number(retryAfter) : NaN
        if (!Number.isNaN(retryAfterSec) && retryAfterSec > 0) {
          delay = Math.max(delay, retryAfterSec * 1000)
        }

        if (attempt < maxRetries - 1) {
          await sleep(jitterDelay(delay))
          continue
        }
        break
      }
      
      const data = await res.json()

      // New normalized envelope from our API route
      if (data && typeof data === 'object' && typeof data.result === 'string') {
        if (data.result === 'VALID') {
          return {
            valid: true,
            status: 'VALID',
            errorCode: null,
            messageKey: null,
            name: data.name || '',
            address: data.address || '',
            countryCode: parsed.countryCode,
            vatNumber: data.vatNumber || parsed.number,
          }
        }

        if (data.result === 'INVALID') {
          return {
            valid: false,
            status: 'INVALID',
            errorCode: null,
            messageKey: 'vat.numberNotFound',
            name: data.name || '',
            address: data.address || '',
            countryCode: parsed.countryCode,
            vatNumber: data.vatNumber || parsed.number,
          }
        }

        // UNVERIFIED
        lastErrorCode = data.errorCode || 'UNVERIFIED'
        lastMessageKey = mapUnverifiedMessageKey(lastErrorCode)

        if (isRetryableErrorCode(lastErrorCode) && attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt) // 1.5s, 3s, 6s (jittered)
          console.log(`VIES ${lastErrorCode}, retrying in ~${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
          await sleep(jitterDelay(delay))
          continue
        }

        break
      }

      // Fallback: unexpected shape — treat as unverified
      lastErrorCode = 'UNEXPECTED_RESPONSE'
      lastMessageKey = 'vat.unverified.generic'
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt)
        await sleep(jitterDelay(delay))
        continue
      }
      break
    } catch (err) {
      lastErrorCode = 'NETWORK_ERROR'
      lastMessageKey = mapUnverifiedMessageKey(lastErrorCode)
      // On network error, retry if we have attempts left
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt)
        console.log(`Network error, retrying in ~${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
        await sleep(jitterDelay(delay))
        continue
      }
      break
    }
  }
  
  // VIES API failed after retries - mark as unverified (not invalid)
  console.log(`VIES API failed after ${maxRetries} attempts (${lastErrorCode}), marking as unverified`)
  
  return {
    valid: null, // null = unverified (neither valid nor invalid)
    status: 'UNVERIFIED',
    errorCode: lastErrorCode || 'UNVERIFIED',
    messageKey: lastMessageKey || 'vat.unverified.generic',
    name: '',
    address: '',
    countryCode: parsed.countryCode,
    vatNumber: parsed.number,
  }
}

/**
 * Try to extract a country code from a VAT string, or guess from country name.
 * @param {string} vatOrCountry 
 * @returns {string | null} - 2-letter country code or null
 */
export function guessCountryCode(vatOrCountry) {
  if (!vatOrCountry) return null
  
  const upper = vatOrCountry.toUpperCase().trim()
  
  // Direct code match
  if (EU_COUNTRIES[upper]) return upper
  
  // Check alias codes (e.g., GR -> EL)
  if (COUNTRY_CODE_ALIASES[upper]) return COUNTRY_CODE_ALIASES[upper]
  
  // Check if it's a VAT string with prefix
  const parsed = parseVAT(vatOrCountry)
  if (parsed) return parsed.countryCode
  
  // Try to match country name aliases first
  if (COUNTRY_NAME_ALIASES[upper]) return COUNTRY_NAME_ALIASES[upper]
  
  // Try to match country name from EU_COUNTRIES
  for (const [code, name] of Object.entries(EU_COUNTRIES)) {
    if (name.toUpperCase() === upper) return code
  }
  
  return null
}
