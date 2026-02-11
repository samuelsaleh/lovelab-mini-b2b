import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'

// Allowed models whitelist
const ALLOWED_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-haiku-4-20250414',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307',
]

const MAX_TOKENS_LIMIT = 4096

export async function POST(request) {
  try {
    // Rate limit: 20 requests per minute per IP
    const rl = rateLimit(request, { maxRequests: 20, windowMs: 60_000, prefix: 'anthropic' })
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

    const body = await request.json()

    // Validate model
    if (body.model && !ALLOWED_MODELS.includes(body.model)) {
      return NextResponse.json(
        { error: `Model not allowed. Allowed: ${ALLOWED_MODELS.join(', ')}` },
        { status: 400 }
      )
    }

    // Cap max_tokens
    if (body.max_tokens && body.max_tokens > MAX_TOKENS_LIMIT) {
      body.max_tokens = MAX_TOKENS_LIMIT
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })
    
    const data = await response.json()
    
    return NextResponse.json(data, { status: response.status })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
