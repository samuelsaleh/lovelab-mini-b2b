import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'

const SOURCE = 'VIES_REST'

// In-memory cache to reduce repeated VIES calls during typing/retries.
// Note: per-instance; resets on server restart / cold start.
const VAT_CACHE_TTL_MS = 10 * 60 * 1000        // 10 minutes for VALID/INVALID
const VAT_CACHE_TTL_UNVERIFIED_MS = 30 * 1000  // 30 seconds for UNVERIFIED
const vatCache = new Map()

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of vatCache) {
      if (!v || typeof v.expiresAt !== 'number' || v.expiresAt <= now) {
        vatCache.delete(k)
      }
    }
  }, 5 * 60 * 1000)
}

// Valid EU country codes for VIES
const VALID_COUNTRIES = [
  'AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR',
  'HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO',
  'SE','SI','SK','XI'
]

function extractViesErrorCode(data) {
  const wrapperErr = Array.isArray(data?.errorWrappers) && data.errorWrappers.length > 0
    ? data.errorWrappers?.[0]?.error
    : ''
  const status = typeof data?.userError === 'string' ? data.userError : ''
  const apiErr = typeof data?.error === 'string' ? data.error : ''
  const isNormalStatus = status === 'VALID' || status === 'INVALID'
  return wrapperErr || apiErr || (status && !isNormalStatus ? status : '')
}

function normalizeViesRestResponse({ data, country, number, upstreamHttpStatus }) {
  const errorCode = extractViesErrorCode(data)
  const status = typeof data?.userError === 'string' ? data.userError : ''
  const isValidRaw = (data?.isValid ?? data?.valid)

  // Determine validity + result bucket
  let isValid = null
  let result = 'UNVERIFIED'
  if (status === 'VALID') { isValid = true; result = 'VALID' }
  else if (status === 'INVALID') { isValid = false; result = 'INVALID' }
  else if (isValidRaw === true) { isValid = true; result = 'VALID' }
  else if (isValidRaw === false) { isValid = false; result = 'INVALID' }

  // If there is an error code, it's never a definitive INVALID; treat as unverified
  if (errorCode) {
    result = 'UNVERIFIED'
    isValid = null
  }

  return {
    source: SOURCE,
    result,
    isValid,
    errorCode: errorCode || null,
    upstreamHttpStatus: typeof upstreamHttpStatus === 'number' ? upstreamHttpStatus : null,
    countryCode: data?.countryCode || country || null,
    vatNumber: data?.vatNumber || number || null,
    name: data?.name || '',
    address: data?.address || '',
  }
}

export async function GET(request) {
  try {
    // Rate limit: 15 requests per minute per IP
    const rl = rateLimit(request, { maxRequests: 15, windowMs: 60_000, prefix: 'vat' })
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
      )
    }

    // Authentication check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const country = searchParams.get('country')?.toUpperCase()
    const number = searchParams.get('number')?.replace(/[^a-zA-Z0-9]/g, '')
    
    if (!country || !number) {
      return NextResponse.json(
        { error: 'Missing country or number parameter' },
        { status: 400 }
      )
    }

    // Validate country code
    if (!VALID_COUNTRIES.includes(country)) {
      return NextResponse.json(
        { error: `Invalid country code. Valid: ${VALID_COUNTRIES.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate number is alphanumeric and reasonable length
    if (number.length < 4 || number.length > 15) {
      return NextResponse.json(
        { error: 'VAT number must be between 4 and 15 characters' },
        { status: 400 }
      )
    }

    const cacheKey = `${country}:${number}`
    const cached = vatCache.get(cacheKey)
    if (cached && typeof cached.expiresAt === 'number' && cached.expiresAt > Date.now() && cached.payload) {
      return NextResponse.json(cached.payload, { status: 200 })
    }
    
    const viesUrl = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${encodeURIComponent(country)}/vat/${encodeURIComponent(number)}`
    
    // Add timeout to prevent hanging on VIES API
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000) // 15s timeout

    try {
      const response = await fetch(viesUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      })

      // VIES may return non-JSON error bodies; parse defensively.
      let data = null
      try {
        const text = await response.text()
        data = text ? JSON.parse(text) : null
      } catch {
        data = null
      }

      // Always return a stable envelope for upstream responses (even if response.ok is false)
      if (data && typeof data === 'object') {
        const normalized = normalizeViesRestResponse({
          data,
          country,
          number,
          upstreamHttpStatus: response.status,
        })
        const ttl = normalized.result === 'UNVERIFIED' ? VAT_CACHE_TTL_UNVERIFIED_MS : VAT_CACHE_TTL_MS
        vatCache.set(cacheKey, { expiresAt: Date.now() + ttl, payload: normalized })
        return NextResponse.json(normalized, { status: 200 })
      }

      const fallback = {
        source: SOURCE,
        result: 'UNVERIFIED',
        isValid: null,
        errorCode: `HTTP_${response.status}`,
        upstreamHttpStatus: response.status,
        countryCode: country,
        vatNumber: number,
        name: '',
        address: '',
      }
      vatCache.set(cacheKey, { expiresAt: Date.now() + VAT_CACHE_TTL_UNVERIFIED_MS, payload: fallback })
      return NextResponse.json(fallback, { status: 200 })
    } finally {
      clearTimeout(timeout)
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return NextResponse.json(
        {
          source: SOURCE,
          result: 'UNVERIFIED',
          isValid: null,
          errorCode: 'TIMEOUT',
          upstreamHttpStatus: null,
        },
        { status: 200 }
      )
    }
    return NextResponse.json(
      {
        source: SOURCE,
        result: 'UNVERIFIED',
        isValid: null,
        errorCode: 'INTERNAL_ERROR',
        upstreamHttpStatus: null,
      },
      { status: 200 }
    )
  }
}
