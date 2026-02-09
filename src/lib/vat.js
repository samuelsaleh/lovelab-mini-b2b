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
 * @returns {Promise<{ valid: boolean, name: string, address: string, countryCode: string, vatNumber: string, error?: string }>}
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
  const baseDelay = 1000 // 1 second
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(`/api/vat?country=${parsed.countryCode}&number=${parsed.number}`)
      
      if (!res.ok) {
        return {
          valid: false,
          name: '',
          address: '',
          countryCode: parsed.countryCode,
          vatNumber: parsed.number,
          error: `VIES service error: ${res.status}`,
        }
      }
      
      const data = await res.json()
      
      // Handle VIES error responses
      if (data.error || data.errorWrappers || data.userError) {
        const errorCode = data.userError || data.error || data.errorWrappers?.[0]?.error || ''
        
        // If rate limited (MS_MAX_CONCURRENT_REQ), retry with backoff
        if (errorCode === 'MS_MAX_CONCURRENT_REQ' && attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt) // 1s, 2s, 4s
          console.log(`VIES rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
          await sleep(delay)
          continue
        }
        
        // Map known error codes to user-friendly messages
        const errorMessages = {
          'MS_MAX_CONCURRENT_REQ': 'VIES is busy (France/Italy often overloaded). Try again in a moment.',
          'MS_UNAVAILABLE': 'Tax authority temporarily unavailable. Try again later.',
          'INVALID': 'VAT number format is invalid for this country.',
          'SERVICE_UNAVAILABLE': 'VIES service is down. Try again later.',
          'TIMEOUT': 'Request timed out. Try again.',
        }
        
        return {
          valid: false,
          name: '',
          address: '',
          countryCode: parsed.countryCode,
          vatNumber: parsed.number,
          error: errorMessages[errorCode] || errorCode || 'VIES service error',
        }
      }
      
      return {
        valid: data.isValid === true,
        name: data.name || '',
        address: data.address || '',
        countryCode: parsed.countryCode,
        vatNumber: data.vatNumber || parsed.number,
        error: data.isValid === true ? undefined : 'VAT number not found in VIES database',
      }
    } catch (err) {
      // On network error, retry if we have attempts left
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt)
        console.log(`Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
        await sleep(delay)
        continue
      }
      
      return {
        valid: false,
        name: '',
        address: '',
        countryCode: parsed.countryCode,
        vatNumber: parsed.number,
        error: 'Network error checking VAT',
      }
    }
  }
  
  // Should not reach here, but just in case
  return {
    valid: false,
    name: '',
    address: '',
    countryCode: parsed.countryCode,
    vatNumber: parsed.number,
    error: 'VIES validation failed after retries',
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
