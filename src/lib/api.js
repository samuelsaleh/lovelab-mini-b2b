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

  const res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`)
  }

  const data = await res.json()
  let raw = data.content?.map((b) => b.text || '').join('') || ''

  let parsed = extractJSON(raw)

  parsed.message = stripMd(parsed.message || 'Done.')

  return parsed
}

/**
 * Robust JSON extraction — handles all the ways the model might return JSON:
 * 1. Pure JSON response
 * 2. JSON inside ```json ... ``` code block
 * 3. Text before/after a JSON object
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

  // Strategy 3: Find the outermost { ... } that contains "message" and parse it
  const firstBrace = trimmed.indexOf('{')
  if (firstBrace !== -1) {
    // Find the matching closing brace by counting braces
    let depth = 0
    let lastBrace = -1
    for (let i = firstBrace; i < trimmed.length; i++) {
      if (trimmed[i] === '{') depth++
      else if (trimmed[i] === '}') {
        depth--
        if (depth === 0) { lastBrace = i; break }
      }
    }
    if (lastBrace !== -1) {
      const jsonStr = trimmed.substring(firstBrace, lastBrace + 1)
      try {
        const obj = JSON.parse(jsonStr)
        if (obj.message || obj.quote) return obj
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
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-•]\s*/gm, '· ')
    .replace(/`(.+?)`/g, '$1')
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
  netherlands: 'algemene voorwaarden / juridische informatie',
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
 * Validate a VAT number via Perplexity by checking the VIES website.
 * Used as a fallback when the VIES API is rate-limited or unavailable.
 * Returns { valid, name, address } or throws.
 */
export async function validateVATviaPerplexity(vatNumber, countryCode) {
  // Clean the VAT number (remove country prefix if present)
  const cleanVat = vatNumber.replace(/^[A-Z]{2}/i, '').trim()
  const fullVat = `${countryCode}${cleanVat}`
  
  // For French VAT: extract SIREN (VAT format is FR XX 123456789 where 123456789 is SIREN)
  let sirenHint = ''
  if (countryCode === 'FR' && cleanVat.length >= 9) {
    const siren = cleanVat.slice(-9)
    sirenHint = `\n\nNote: For French TVA numbers, the last 9 digits are the SIREN number: ${siren}. Search for this SIREN on societe.com, infogreffe.fr, or pappers.fr.`
  }
  
  const countryNames = {
    'FR': 'French (France)',
    'BE': 'Belgian', 
    'DE': 'German',
    'IT': 'Italian',
    'NL': 'Dutch',
    'ES': 'Spanish',
    'AT': 'Austrian',
    'LU': 'Luxembourg',
  }
  const countryName = countryNames[countryCode] || 'European'
  
  const prompt = `Find the company registered with this ${countryName} VAT/TVA number: ${fullVat}

Search business registries and company databases for this VAT number. Try:
- societe.com, infogreffe.fr, pappers.fr (for French companies)
- companyweb.be, kbo-bce.fgov.be (for Belgian companies)
- handelsregister.de (for German companies)
- kvk.nl (for Dutch companies)
- Or any other official company registry${sirenHint}

Return ONLY a JSON object:
{ "valid": true, "name": "company name", "address": "full address" }

If you find the company, set valid=true and include the name and address.
If you cannot find any company for this VAT, set valid=false and leave name/address empty.
Output ONLY the JSON, nothing else.`

  const body = {
    model: 'sonar',
    messages: [
      { role: 'user', content: prompt },
    ],
    max_tokens: 400,
  }

  const res = await fetch('/api/perplexity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`Perplexity API error: ${res.status}`)
  }

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content || ''
  console.log('Perplexity VAT lookup raw response:', raw)
  const parsed = extractJSON(raw)
  console.log('Perplexity VAT lookup parsed:', parsed)

  return {
    valid: parsed.valid === true,
    name: parsed.name || '',
    address: parsed.address || '',
  }
}

/**
 * Look up company address and VAT number via Perplexity API.
 * Returns { address, city, zip, country, vat } or throws.
 */
export async function lookupCompany(companyName, country) {
  const legalPageHint = LEGAL_PAGE_NAMES[country.toLowerCase()] || 'terms and conditions / legal notice'

  const prompt = `Find the business address and VAT/tax identification number for the company "${companyName}" in ${country}.

IMPORTANT: On the company's official website, look specifically for the page called "${legalPageHint}" (this is the local name for legal/terms pages in ${country}). This page is usually linked in the website footer. The VAT number, company registration, and full address are almost always listed there.

Also check: footer of every page, "about us", "contact", CGV, privacy policy, and any legal/imprint pages.

Return ONLY a JSON object with these fields: { "address": "street + number", "city": "city name", "zip": "postal code", "country": "${country}", "vat": "VAT number or tax ID" }. If you cannot find a field, use an empty string. Output ONLY the JSON, nothing else.`

  const body = {
    model: 'sonar',
    messages: [
      { role: 'user', content: prompt },
    ],
    max_tokens: 400,
  }

  const res = await fetch('/api/perplexity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`Perplexity API error: ${res.status}`)
  }

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content || ''
  const parsed = extractJSON(raw)

  return {
    address: parsed.address || '',
    city: parsed.city || '',
    zip: parsed.zip || '',
    country: parsed.country || country,
    vat: parsed.vat || '',
  }
}
