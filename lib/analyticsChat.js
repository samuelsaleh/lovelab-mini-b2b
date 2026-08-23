/**
 * Analytics chat loop: the model asks for a tool, the browser runs it
 * against the documents already loaded on the page, then we post the
 * result back. No second crawl of /api/documents.
 */

import { runAnalyticsTool } from './analyticsBreakdowns.js'
export { ANALYTICS_TOOLS } from './analyticsBreakdowns.js'

export const ANALYTICS_CHAT_MAX_ROUNDS = 6

export const ANALYTICS_CHAT_SYSTEM = `You are an analytics assistant for LoveLab Antwerp, a B2B jewellery brand.
You have tools that query the live orders already loaded on this page. The summary below is a first glance only — use a tool whenever the question needs numbers, lists, comparisons, or a slice (country, material, collection, fair). Do not guess from the summary if a tool can answer.

When the user wants a breakdown, list every row they asked for (including palette colours at 0). Use numbered or line-broken lists. Always cite specific euros (€). Respond in the same language the user writes in.

TOOLS:
- colors: every Nylon / Silk thread colour including zeros
- countries: every sold country, no top-N cut-off
- products: collections by quantity and revenue
- slice: cut by country / material / collection / fair
- compare: two materials or two countries side by side

`

export function buildAnalyticsChatSystem(analyticsContext) {
  const glance = String(analyticsContext || '').trim()
  return ANALYTICS_CHAT_SYSTEM + (glance ? `\nFIRST GLANCE (not a substitute for tools):\n${glance}` : '')
}

export function extractAssistantText(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block?.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n')
    .trim()
}

export function toApiMessages(messages) {
  return (messages || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content != null)
    .map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : m.content,
    }))
}

export function applyToolResults(assistantContent, docs, runTool = runAnalyticsTool) {
  const results = []
  for (const block of assistantContent || []) {
    if (block?.type !== 'tool_use') continue
    try {
      const result = runTool(block.name, block.input || {}, docs)
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      })
    } catch (err) {
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        is_error: true,
        content: JSON.stringify({ error: err?.message || 'Tool failed' }),
      })
    }
  }
  return results
}

/**
 * Drive the tool_use loop. `postRound` posts messages to /api/analytics/chat
 * and returns `{ stop_reason, content }`.
 */
export async function completeAnalyticsChat({
  messages,
  analyticsContext,
  docs,
  postRound,
  runTool = runAnalyticsTool,
  maxRounds = ANALYTICS_CHAT_MAX_ROUNDS,
}) {
  let apiMessages = toApiMessages(messages)

  for (let i = 0; i < maxRounds; i++) {
    const data = await postRound({ messages: apiMessages, analyticsContext })
    const content = data?.content
    if (data?.stop_reason === 'tool_use' || (Array.isArray(content) && content.some((b) => b?.type === 'tool_use'))) {
      const toolResults = applyToolResults(content, docs, runTool)
      if (toolResults.length === 0) {
        const text = extractAssistantText(content)
        return { message: text || 'No analysis returned.' }
      }
      apiMessages = [
        ...apiMessages,
        { role: 'assistant', content },
        { role: 'user', content: toolResults },
      ]
      continue
    }

    const text = extractAssistantText(content) || String(data?.message || '').trim()
    if (!text) throw new Error('Empty response from AI')
    return { message: text }
  }

  return { message: 'I could not finish that analysis. Try asking again more specifically.' }
}

export { ANALYTICS_TOOLS }
