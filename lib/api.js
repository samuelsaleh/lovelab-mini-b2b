import { SYSTEM_PROMPT } from './prompt'

const MODEL = 'claude-sonnet-4-5'

/**
 * Send messages to Claude 4.5 Sonnet via server-side Anthropic proxy.
 * Used only for the "Describe your situation" AI path.
 */
export async function sendChat(messages) {
  const apiMsgs = messages.map((m) => ({
    role: m.role,
    content:
      m.role === 'assistant'
        ? JSON.stringify({ message: m.content, quote: m.quote || null })
        : m.content,
  }))

  const body = {
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: apiMsgs,
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000) // 60s timeout

  try {
    const res = await fetch('/api/anthropic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      const errorMsg = errorData.error || `API error: ${res.status}`
      throw new Error(errorMsg)
    }

    const data = await res.json()
    let raw = (data.content && Array.isArray(data.content))
      ? data.content.map((b) => b.text || '').join('')
      : ''

    if (!raw) {
      throw new Error('Empty response from AI')
    }

    let parsed = extractJSON(raw)

    parsed.message = stripMd(parsed.message || 'Done.')

    return parsed
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Robust JSON extraction — handles all the ways the model might return JSON:
 * 1. Pure JSON response
 * 2. JSON inside ```json ... ``` code block
 * 3. Text before/after a JSON object (with string-aware brace counting)
 * 4. Complete failure → fallback to raw text as message
 */
function extractJSON(raw) {
  const trimmed = raw.trim()

  // Strategy 1: Try parsing the whole thing as JSON directly
  try {
    return JSON.parse(trimmed)
  } catch { /* continue */ }

  // Strategy 2: Extract from ```json ... ``` code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch { /* continue */ }
  }

  // Strategy 3: Find the outermost { ... } with string-aware brace counting
  const firstBrace = trimmed.indexOf('{')
  if (firstBrace !== -1) {
    let depth = 0
    let lastBrace = -1
    let inString = false
    let escape = false
    for (let i = firstBrace; i < trimmed.length; i++) {
      const ch = trimmed[i]
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\' && inString) {
        escape = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        continue
      }
      if (!inString) {
        if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) { lastBrace = i; break }
        }
      }
    }
    if (lastBrace !== -1) {
      const jsonStr = trimmed.substring(firstBrace, lastBrace + 1)
      try {
        return JSON.parse(jsonStr)
      } catch { /* continue */ }
    }
  }

  // Strategy 4: Strip all code fences and try again
  const stripped = trimmed
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim()
  try {
    return JSON.parse(stripped)
  } catch { /* continue */ }

  // Strategy 5: Complete failure — use raw text as message, no quote
  // But strip any JSON junk from the displayed message
  let cleanMsg = trimmed
  // Remove any JSON block at the end
  cleanMsg = cleanMsg.replace(/```(?:json)?[\s\S]*```/g, '').trim()
  // Remove any raw JSON object at the end (starts with { and goes to end)
  const jsonStart = cleanMsg.indexOf('\n{')
  if (jsonStart !== -1) {
    cleanMsg = cleanMsg.substring(0, jsonStart).trim()
  }

  return { message: cleanMsg || trimmed, quote: null }
}

function stripMd(s) {
  return s
    .replace(/\*\*(.+?)\*\*/gs, '$1')   // bold (multiline-safe)
    .replace(/\*(.+?)\*/gs, '$1')        // italic (multiline-safe)
    .replace(/^#+\s*/gm, '')
    .replace(/^[-•]\s*/gm, '· ')
    .replace(/`(.+?)`/g, '$1')
}

/**
 * Send a budget-recommendation request to Claude.
 * Uses a dedicated system prompt that allows longer, list-format answers
 * instead of the strict 2-3 sentence quote-builder format.
 */
export async function sendRecommendationChat(userPrompt) {
  const systemPrompt = `You are a concise B2B sales advisor for LoveLab Antwerp jewellery bracelets.
The salesperson is at a trade fair and wants quick, actionable ideas for how to spend a client's remaining budget.

RULES:
- Output ONLY a JSON object: {"message":"...","quote":null}
- The "message" field should contain 3-5 numbered suggestions, each on its own line.
- Each suggestion: one line with product name, carat, approximate qty & cost. Keep each line under 120 chars.
- At the end, add a one-line total summary.
- Use plain text, no markdown, no bold, no bullets. Use "·" as separator within a line if needed.
- Be specific: name real LoveLab products and realistic B2B prices.

PRICES (B2B):
CUTY: 0.05=€20, 0.10=€30, 0.20=€65, 0.30=€90
CUBIX: 0.05=€24, 0.10=€34, 0.20=€70
MULTI THREE: 0.15=€55, 0.30=€85, 0.60=€165, 0.90=€240
MULTI FOUR: 0.20=€75, 0.40=€100
MULTI FIVE: 0.25=€85, 0.50=€120
MATCHY FANCY: 0.60=€180, 1.00=€290
SHAPY SHINE FANCY: 0.10=€50, 0.30=€90, 0.50=€145
SHAPY SPARKLE FANCY: 0.70=€225, 1.00=€300
SHAPY SPARKLE RND G/H: 0.50=€115, 0.70=€145, 1.00=€205
SHAPY SPARKLE RND D VVS: 0.50=€180, 0.70=€200, 1.00=€285
HOLY (D VVS): 0.50=€260, 0.70=€425, 1.00=€550`

  const body = {
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000) // 60s timeout

  try {
    const res = await fetch('/api/anthropic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      const errorMsg = errorData.error || `API error: ${res.status}`
      throw new Error(errorMsg)
    }

    const data = await res.json()
    let raw = (data.content && Array.isArray(data.content))
      ? data.content.map((b) => b.text || '').join('')
      : ''
    let parsed = extractJSON(raw)
    parsed.message = stripMd(parsed.message || 'No recommendations available.')
    return parsed
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Country-specific names for the legal / terms pages where VAT is usually found.
 */
const LEGAL_PAGE_NAMES = {
  france: 'mentions légales',
  belgium: 'mentions légales / wettelijke vermeldingen',
  germany: 'Impressum',
  austria: 'Impressum',
  switzerland: 'Impressum / mentions légales',
  italy: 'note legali / informazioni legali',
  spain: 'aviso legal',
  portugal: 'avisos legais',
  netherlands: 'contact / algemene voorwaarden / privacy / cookiebeleid / juridische informatie',
  luxembourg: 'mentions légales',
  uk: 'terms and conditions / legal notice',
  'united kingdom': 'terms and conditions / legal notice',
  ireland: 'terms and conditions / legal notice',
  usa: 'terms and conditions / legal notice',
  'united states': 'terms and conditions / legal notice',
  denmark: 'juridisk meddelelse',
  sweden: 'juridisk information',
  norway: 'juridisk informasjon',
  finland: 'oikeudellinen ilmoitus',
  poland: 'informacje prawne',
  'czech republic': 'právní informace',
  czechia: 'právní informace',
  greece: 'νομικές πληροφορίες',
  romania: 'mențiuni legale',
  hungary: 'jogi nyilatkozat',
  croatia: 'pravna obavijest',
  bulgaria: 'правна информация',
}

/**
 * Sanitize user-supplied company name to prevent prompt injection.
 */
function sanitizeForPrompt(input) {
  if (!input || typeof input !== 'string') return ''
  return input
    .replace(/[\r\n]+/g, ' ')        // Remove newlines
    .replace(/[{}[\]]/g, '')          // Remove braces/brackets
    .replace(/["`]/g, "'")            // Normalize quotes
    .slice(0, 200)                    // Limit length
    .trim()
}

/**
 * Look up company address and VAT number via Perplexity API.
 * Returns { address, city, zip, country, vat } or throws.
 */
export async function lookupCompany(companyName, country) {
  const safeCountry = (country || '').trim()
  const safeCompany = sanitizeForPrompt(companyName)
  const legalPageHint = LEGAL_PAGE_NAMES[safeCountry.toLowerCase()] || 'terms and conditions / legal notice'

  async function runPerplexity(prompt, { maxTokens = 500 } = {}) {
    const body = {
      model: 'sonar-pro',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      web_search_options: { search_context_size: 'high' },
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000) // 30s timeout

    try {
      const res = await fetch('/api/perplexity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Perplexity API error: ${res.status}`)
      }

      const data = await res.json()
      const raw = data.choices?.[0]?.message?.content || ''
      const citations = Array.isArray(data.citations) ? data.citations : []

      const parsed = extractJSON(raw)

      const result = {
        address: parsed.address || '',
        city: parsed.city || '',
        zip: parsed.zip || '',
        country: parsed.country || country,
        vat: parsed.vat || '',
      }

      return { result, citations }
    } finally {
      clearTimeout(timeout)
    }
  }

  const hasAnyAddress = (r) => Boolean((r.address || '').trim() || (r.city || '').trim() || (r.zip || '').trim())

  // Keep prompts short; long "strategy" prompts tend to bias results toward generic registry explainer pages.
  const prompt1 = `Company details lookup.
Company: ${safeCompany}
Country: ${safeCountry}

Goal: Find the business address (street + number), city, and postal code. VAT is optional; if not found leave "vat" empty.

Use web search. Prioritize the official website contact/footer and legal pages (hint: "${legalPageHint}").
Avoid unrelated results (e.g. political parties or similarly named companies).

Return ONLY JSON with exactly these keys:
{"address":"","city":"","zip":"","country":"${safeCountry}","vat":""}`

  const prompt2 = `Company details lookup (retry).
Company: ${safeCompany}
Country: ${safeCountry}

Find the business address first. VAT is optional.
Try search queries like:
- "${safeCompany} address ${safeCountry}"
- "${safeCompany} contact address"
- "${safeCompany}" site: contact

Open the official website result and extract the address from the contact page or footer.

Return ONLY JSON with exactly these keys:
{"address":"","city":"","zip":"","country":"${safeCountry}","vat":""}`

  const attempt1 = await runPerplexity(prompt1)
  if (hasAnyAddress(attempt1.result)) return attempt1.result

  const attempt2 = await runPerplexity(prompt2, { maxTokens: 350 })
  if (hasAnyAddress(attempt2.result)) return attempt2.result

  // Last fallback: if citations exist, ask Perplexity to use them directly.
  const topCitation = attempt1.citations?.find(Boolean) || attempt2.citations?.find(Boolean)
  if (topCitation) {
    const prompt3 = `Company details lookup (final fallback).
Company: ${safeCompany}
Country: ${safeCountry}

Use this source URL as a starting point: ${topCitation}
If it is not the official website, navigate to the official website and then to the contact page / footer to find the address.

Return ONLY JSON with exactly these keys:
{"address":"","city":"","zip":"","country":"${safeCountry}","vat":""}`

    const attempt3 = await runPerplexity(prompt3, { maxTokens: 350 })
    if (hasAnyAddress(attempt3.result)) return attempt3.result
  }

  // Give back best effort (likely empty strings).
  return attempt2.result || attempt1.result
}
