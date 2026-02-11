import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'

// Valid EU country codes for VIES
const VALID_COUNTRIES = [
  'AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR',
  'HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO',
  'SE','SI','SK','XI'
]

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
    
    const viesUrl = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${encodeURIComponent(country)}/vat/${encodeURIComponent(number)}`
    
    const response = await fetch(viesUrl)
    const data = await response.json()
    
    return NextResponse.json(data, { status: response.status })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
