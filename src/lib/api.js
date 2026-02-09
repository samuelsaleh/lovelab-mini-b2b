import { SYSTEM_PROMPT } from './prompt'

/**
 * Send messages to Claude via the server-side proxy.
 * In dev: Vite middleware at /api/chat
 * In prod: deploy your own proxy endpoint and update the URL below.
 */
const API_URL = '/api/chat'

export async function sendChat(messages) {
  const apiMsgs = messages.map((m) => ({
    role: m.role,
    content:
      m.role === 'assistant'
        ? JSON.stringify({ message: m.content, quote: m.quote || null })
        : m.content,
  }))

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: apiMsgs,
    }),
  })

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`)
  }

  const data = await res.json()
  const raw = data.content?.map((b) => b.text || '').join('') || ''

  let parsed
  try {
    parsed = JSON.parse(
      raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    )
  } catch {
    parsed = { message: raw, quote: null }
  }

  // Strip any markdown the model sneaks in
  parsed.message = stripMd(parsed.message || 'Done.')

  return parsed
}

function stripMd(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-•]\s*/gm, '· ')
    .replace(/`(.+?)`/g, '$1')
}
