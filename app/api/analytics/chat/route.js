import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { requireSession } from '@/lib/organizations/authz'
import { NextResponse } from 'next/server'
import { recordHealthEvent } from '@/lib/healthEvent'
import { ANALYTICS_TOOLS, buildAnalyticsChatSystem } from '@/lib/analyticsChat'

const MODEL = 'claude-sonnet-4-5'
const MAX_TOKENS = 4096

export async function POST(request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured. Please set ANTHROPIC_API_KEY.' }, { status: 500 })
    }

    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'analytics-chat' })
    if (rateLimitRes) return rateLimitRes

    const supabase = await createClient()
    const session = await requireSession(supabase)
    if (session.error) return session.error

    const body = await request.json()
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 })
    }

    const system = buildAnalyticsChatSystem(body.analyticsContext)
    const upstreamBody = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: body.messages,
      tools: ANALYTICS_TOOLS,
      tool_choice: { type: 'auto' },
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(upstreamBody),
        signal: controller.signal,
      })

      const data = await response.json()
      if (!response.ok) {
        const errMsg = data?.error?.message || data?.error?.type || `Anthropic API error (${response.status})`
        console.error('[Analytics chat] API error:', response.status, errMsg)
        try {
          await recordHealthEvent({
            source: 'analytics_chat',
            severity: 'warn',
            message: errMsg,
            context: { status: response.status, model: MODEL },
          })
        } catch { /* non-blocking */ }
        return NextResponse.json({ error: errMsg }, { status: response.status })
      }

      return NextResponse.json({
        stop_reason: data.stop_reason,
        content: data.content,
      })
    } finally {
      clearTimeout(timeout)
    }
  } catch (err) {
    const isTimeout = err?.name === 'AbortError'
    if (isTimeout) {
      return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
    }
    console.error('[Analytics chat]', err?.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
