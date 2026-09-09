import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'
import { recordHealthEvent } from '@/lib/healthEvent'

/**
 * Perplexity proxy — "Look Up Company" and any other Sonar call.
 *
 * Sam, 9 Sept 2026: the address lookup still called Perplexity's Sonar
 * chat-completions endpoint. Perplexity retired it in favour of their
 * Agent API and switches it off on 27 September 2026. The API key is the
 * same; only the endpoint, request shape and response shape changed.
 *
 * The browser-side contract is kept exactly as it was — the client still
 * sends { model, messages, max_tokens, web_search_options } and still reads
 * { choices[0].message.content, citations } back — so lib/api.js and the
 * client form did not have to move. This file translates in both directions.
 */

export const PERPLEXITY_AGENT_URL = 'https://api.perplexity.ai/v1/agent'

// Sonar models still offered on the Agent API (docs, Sept 2026).
const ALLOWED_MODELS = [
  'sonar',
  'sonar-pro',
  'sonar-reasoning-pro',
  'sonar-deep-research',
]

const MAX_TOKENS_LIMIT = 2048
const SEARCH_CONTEXT_SIZES = new Set(['low', 'medium', 'high'])

// The Agent API addresses models as provider/model. The browser keeps the
// short Sonar names it always sent; the prefix is added here, once.
export function toAgentModel(model) {
  return String(model).includes('/') ? model : `perplexity/${model}`
}

function contentToText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/**
 * Chat-completions request → Agent API request.
 * System messages become `instructions`; the user/assistant turns are folded
 * into one `input` string (the lookup only ever sends a single user prompt).
 */
export function toAgentRequest({ model, messages, maxTokens, webSearchOptions }) {
  const instructions = messages
    .filter((m) => m?.role === 'system')
    .map((m) => contentToText(m.content))
    .filter(Boolean)
    .join('\n\n')

  const input = messages
    .filter((m) => m?.role !== 'system')
    .map((m) => contentToText(m.content))
    .filter(Boolean)
    .join('\n\n')

  const webSearch = { type: 'web_search' }
  const size = webSearchOptions?.search_context_size
  if (SEARCH_CONTEXT_SIZES.has(size)) webSearch.search_context_size = size

  const body = {
    model: toAgentModel(model),
    input,
    max_output_tokens: maxTokens,
    tools: [webSearch],
  }
  if (instructions) body.instructions = instructions
  return body
}

/**
 * Agent API response → the chat-completions shape the client already reads.
 * Text comes from the message items; citations from the search_results items,
 * in the order Perplexity numbered them so "[1]" in the text is citations[0].
 */
export function toChatShape(data) {
  const output = Array.isArray(data?.output) ? data.output : []

  const text = typeof data?.output_text === 'string' && data.output_text
    ? data.output_text
    : output
      .filter((item) => item?.type === 'message')
      .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
      .map((part) => part?.text || '')
      .filter(Boolean)
      .join('\n')

  const searchResults = output
    .filter((item) => item?.type === 'search_results')
    .flatMap((item) => (Array.isArray(item.results) ? item.results : []))

  const citations = searchResults.map((r) => r?.url).filter(Boolean)

  return {
    id: data?.id || null,
    model: data?.model || null,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    citations,
    search_results: searchResults,
    usage: data?.usage || null,
  }
}

export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 10, prefix: 'perplexity' })
    if (rateLimitRes) return rateLimitRes

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

    const upstreamBody = toAgentRequest({
      model: body.model,
      messages: body.messages,
      maxTokens,
      webSearchOptions: body.web_search_options && typeof body.web_search_options === 'object'
        ? body.web_search_options
        : null,
    })

    if (!upstreamBody.input) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000) // 60s timeout

    try {
      const response = await fetch(PERPLEXITY_AGENT_URL, {
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
        try {
          await recordHealthEvent({
            source: 'perplexity_proxy',
            severity: 'warn',
            message: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg),
            context: { status: response.status, model: body?.model || null, endpoint: 'agent' },
          })
        } catch (alertErr) {
          console.error('[Perplexity] Failed to record health event:', alertErr?.message)
        }
        return NextResponse.json({ error: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) }, { status: response.status })
      }

      return NextResponse.json(toChatShape(data))
    } finally {
      clearTimeout(timeout)
    }
  } catch (err) {
    const isTimeout = err?.name === 'AbortError'
    try {
      await recordHealthEvent({
        source: 'perplexity_proxy',
        severity: 'warn',
        message: err?.message || (isTimeout ? 'Perplexity upstream timed out' : 'Perplexity upstream call failed'),
        context: { status: isTimeout ? 504 : 502 },
      })
    } catch (alertErr) {
      console.error('[Perplexity] Failed to record health event:', alertErr?.message)
    }
    if (isTimeout) {
      return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
