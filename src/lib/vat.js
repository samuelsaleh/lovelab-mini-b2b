/**
 * EU VAT validation helper using VIES API with Perplexity fallback
 */

import { validateVATviaPerplexity } from './api'

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
 * Falls back to Perplexity to check the VIES website if API fails.
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
  
  // Retry config: up to 2 attempts with exponential backoff (reduced since we have Perplexity fallback)
  const maxRetries = 2
  const baseDelay = 1000 // 1 second
  let lastErrorCode = ''
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(`/api/vat?country=${parsed.countryCode}&number=${parsed.number}`)
      
      if (!res.ok) {
        lastErrorCode = `HTTP_${res.status}`
        continue // Try again or fall through to Perplexity
      }
      
      const data = await res.json()
      
      // Handle VIES error responses
      if (data.error || data.errorWrappers || data.userError) {
        lastErrorCode = data.userError || data.error || data.errorWrappers?.[0]?.error || 'UNKNOWN'
        
        // If rate limited (MS_MAX_CONCURRENT_REQ) or unavailable, retry with backoff
        if ((lastErrorCode === 'MS_MAX_CONCURRENT_REQ' || lastErrorCode === 'MS_UNAVAILABLE') && attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt) // 1s, 2s
          console.log(`VIES ${lastErrorCode}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
          await sleep(delay)
          continue
        }
        
        // Fall through to Perplexity fallback after retries exhausted
        break
      }
      
      // Success from VIES API
      return {
        valid: data.isValid === true,
        name: data.name || '',
        address: data.address || '',
        countryCode: parsed.countryCode,
        vatNumber: data.vatNumber || parsed.number,
        error: data.isValid === true ? undefined : 'VAT number not found in VIES database',
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
      // Fall through to Perplexity fallback
      break
    }
  }
  
  // VIES API failed after retries - try Perplexity fallback
  console.log(`VIES API failed (${lastErrorCode}), trying Perplexity fallback...`)
  
  try {
    const perplexityResult = await validateVATviaPerplexity(vatString, parsed.countryCode)
    
    // Consider it valid if:
    // 1. Perplexity explicitly says valid=true, OR
    // 2. Perplexity found a company name (even if it said valid=false)
    const foundCompany = perplexityResult.name && perplexityResult.name.trim().length > 0
    const isValid = perplexityResult.valid === true || foundCompany
    
    if (isValid) {
      console.log('Perplexity found company:', perplexityResult.name)
      return {
        valid: true,
        name: perplexityResult.name || '',
        address: perplexityResult.address || '',
        countryCode: parsed.countryCode,
        vatNumber: parsed.number,
        error: undefined,
      }
    } else {
      // Perplexity couldn't find any company info
      return {
        valid: false,
        name: '',
        address: '',
        countryCode: parsed.countryCode,
        vatNumber: parsed.number,
        error: 'Could not verify VAT via VIES or Perplexity',
      }
    }
  } catch (perplexityErr) {
    console.log('Perplexity fallback also failed:', perplexityErr)
    
    // Both VIES and Perplexity failed
    return {
      valid: false,
      name: '',
      address: '',
      countryCode: parsed.countryCode,
      vatNumber: parsed.number,
      error: 'Could not verify VAT via VIES or Perplexity',
    }
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
