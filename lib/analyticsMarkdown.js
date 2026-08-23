/**
 * Tiny markdown-to-blocks helper for the analytics chat bubble.
 * Headings, lists, bold — no HTML in, no HTML out.
 */

const BOLD_RE = /\*\*(.+?)\*\*/g

export function splitInline(text) {
  const raw = String(text || '')
  const parts = []
  let last = 0
  BOLD_RE.lastIndex = 0
  let m = BOLD_RE.exec(raw)
  while (m) {
    if (m.index > last) parts.push({ type: 'text', text: raw.slice(last, m.index) })
    parts.push({ type: 'bold', text: m[1] })
    last = m.index + m[0].length
    m = BOLD_RE.exec(raw)
  }
  if (last < raw.length) parts.push({ type: 'text', text: raw.slice(last) })
  return parts
}

export function parseAnalyticsMarkdown(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let list = null

  const flushList = () => {
    if (list) {
      blocks.push(list)
      list = null
    }
  }

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flushList()
      blocks.push({ type: 'heading', level: heading[1].length, parts: splitInline(heading[2].trim()) })
      continue
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/)
    if (bullet) {
      if (!list || list.list !== 'ul') {
        flushList()
        list = { type: 'list', list: 'ul', items: [] }
      }
      list.items.push(splitInline(bullet[1]))
      continue
    }
    const numbered = line.match(/^\s*\d+\.\s+(.+)$/)
    if (numbered) {
      if (!list || list.list !== 'ol') {
        flushList()
        list = { type: 'list', list: 'ol', items: [] }
      }
      list.items.push(splitInline(numbered[1]))
      continue
    }
    if (!line.trim()) {
      flushList()
      continue
    }
    flushList()
    blocks.push({ type: 'p', parts: splitInline(line) })
  }
  flushList()
  return blocks
}
