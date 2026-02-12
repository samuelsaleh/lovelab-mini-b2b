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

    // Validate API key is configured
    if (!process.env.PERPLEXITY_API_KEY) {
      console.error('[Perplexity] PERPLEXITY_API_KEY is not configured')
      return NextResponse.json({ error: 'Perplexity API not configured. Please set PERPLEXITY_API_KEY.' }, { status: 500 })
    }

    // Authentication check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate model (required)
    if (!body.model || !ALLOWED_MODELS.includes(body.model)) {
      return NextResponse.json(
        { error: `Model not allowed. Allowed: ${ALLOWED_MODELS.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate messages (required)
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      )
    }

    // Cap max_tokens
    const maxTokens = typeof body.max_tokens === 'number'
      ? Math.min(Math.max(1, body.max_tokens), MAX_TOKENS_LIMIT)
      : 512

    // Build sanitized upstream body (allowlist pattern)
    const upstreamBody = {
      model: body.model,
      max_tokens: maxTokens,
      messages: body.messages,
    }
    // Allow web_search_options if provided (Perplexity-specific)
    if (body.web_search_options && typeof body.web_search_options === 'object') {
      upstreamBody.web_search_options = body.web_search_options
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000) // 60s timeout

    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        },
        body: JSON.stringify(upstreamBody),
        signal: controller.signal,
      })

      const data = await response.json()

      if (!response.ok || data.error) {
        const errMsg = data?.error?.message || data?.error || `Perplexity API error (${response.status})`
        console.error('[Perplexity] API error:', response.status, errMsg)
        return NextResponse.json({ error: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) }, { status: response.status })
      }

      return NextResponse.json(data)
    } finally {
      clearTimeout(timeout)
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
