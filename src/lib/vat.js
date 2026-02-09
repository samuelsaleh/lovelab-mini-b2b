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
}

/**
 * Parse a VAT string to extract country code and number.
 * Handles formats like: "BE0123456789", "BE 0123.456.789", "BE-0123456789"
 * @param {string} vatString 
 * @returns {{ countryCode: string, number: string } | null}
 */
export function parseVAT(vatString) {
  if (!vatString || typeof vatString !== 'string') return null
  
  // Remove spaces, dots, dashes
  const cleaned = vatString.replace(/[\s.\-]/g, '').toUpperCase()
  
  if (cleaned.length < 4) return null
  
  // First 2 characters should be country code
  const countryCode = cleaned.slice(0, 2)
  const number = cleaned.slice(2)
  
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

/**
 * Validate a VAT number against the EU VIES database.
 * Includes retry logic with exponential backoff for rate-limited requests.
 * @param {string} vatString - Full VAT number with country prefix (e.g., "BE0123456789")
 * @returns {Promise<{ valid: boolean|null, name: string, address: string, countryCode: string, vatNumber: string, error?: string }>}
 */
export async function validateVAT(vatString) {
  const parsed = parseVAT(vatString)
  
  if (!parsed) {
    return {
      valid: false,
      name: '',
      address: '',
      countryCode: '',
      vatNumber: vatString || '',
      error: 'Invalid VAT format. Use country code + number (e.g., BE0123456789)',
    }
  }
  
  // Retry config: up to 3 attempts with exponential backoff
  const maxRetries = 3
  const baseDelay = 1500 // 1.5 seconds
  let lastErrorCode = ''
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(`/api/vat?country=${parsed.countryCode}&number=${parsed.number}`)
      
      if (!res.ok) {
        lastErrorCode = `HTTP_${res.status}`
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt)
          await sleep(delay)
          continue
        }
        break
      }
      
      const data = await res.json()
      
      // Handle VIES error responses.
      // NOTE: On the official VIES REST endpoint we call, `userError` is a STATUS string,
      // and is present even on success (e.g. "VALID" / "INVALID"). Only treat other
      // values as errors.
      const wrapperErr = Array.isArray(data?.errorWrappers) && data.errorWrappers.length > 0
        ? data.errorWrappers?.[0]?.error
        : ''
      const status = typeof data?.userError === 'string' ? data.userError : ''
      const apiErr = typeof data?.error === 'string' ? data.error : ''
      const isNormalStatus = status === 'VALID' || status === 'INVALID'
      const errorCode = wrapperErr || apiErr || (status && !isNormalStatus ? status : '')

      if (errorCode) {
        lastErrorCode = errorCode || 'UNKNOWN'

        // Retryable conditions (VIES / member state busy or unavailable)
        const retryable = new Set([
          'MS_MAX_CONCURRENT_REQ',
          'MS_MAX_CONCURRENT_REQ_TIME',
          'MS_UNAVAILABLE',
          'SERVICE_UNAVAILABLE',
          'TIMEOUT',
          'GLOBAL_MAX_CONCURRENT_REQ',
          'GLOBAL_MAX_CONCURRENT_REQ_TIME',
        ])

        if (retryable.has(lastErrorCode) && attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt) // 1.5s, 3s, 6s
          console.log(`VIES ${lastErrorCode}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
          await sleep(delay)
          continue
        }

        // Retries exhausted (or non-retryable) - mark as unverified
        break
      }
      
      // Success from VIES API
      const isValid = (data?.isValid ?? data?.valid) === true
      return {
        valid: isValid,
        name: data.name || '',
        address: data.address || '',
        countryCode: parsed.countryCode,
        vatNumber: data.vatNumber || parsed.number,
        error: isValid ? undefined : 'VAT number not found in VIES database',
      }
    } catch (err) {
      lastErrorCode = 'NETWORK_ERROR'
      // On network error, retry if we have attempts left
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt)
        console.log(`Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
        await sleep(delay)
        continue
      }
      break
    }
  }
  
  // VIES API failed after retries - mark as unverified (not invalid)
  console.log(`VIES API failed after ${maxRetries} attempts (${lastErrorCode}), marking as unverified`)
  
  return {
    valid: null, // null = unverified (neither valid nor invalid)
    name: '',
    address: '',
    countryCode: parsed.countryCode,
    vatNumber: parsed.number,
    error: undefined, // No error shown - just couldn't verify
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
  
  // Check if it's a VAT string with prefix
  const parsed = parseVAT(vatOrCountry)
  if (parsed) return parsed.countryCode
  
  // Try to match country name
  for (const [code, name] of Object.entries(EU_COUNTRIES)) {
    if (name.toUpperCase() === upper) return code
  }
  
  return null
}
