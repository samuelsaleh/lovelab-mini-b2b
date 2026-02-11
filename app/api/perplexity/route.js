import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'

// Allowed models whitelist
const ALLOWED_MODELS = [
  'sonar',
  'sonar-pro',
  'sonar-reasoning',
  'sonar-reasoning-pro',
]

const MAX_TOKENS_LIMIT = 2048

export async function POST(request) {
  try {
    // Rate limit: 10 requests per minute per IP
    const rl = rateLimit(request, { maxRequests: 10, windowMs: 60_000, prefix: 'perplexity' })
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

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify(body),
    })
    
    const data = await response.json()
    
    if (!response.ok || data.error) {
      console.error('[Perplexity] Error status:', response.status)
    }
    
    return NextResponse.json(data, { status: response.status })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
