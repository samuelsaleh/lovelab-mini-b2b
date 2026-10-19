/**
 * Claude translation of PDF paragraphs, in batches, with structural checks.
 * Items are { key, text, chars, letterSpaced }; the result maps key → text.
 */
import { createAnthropicMessage } from '@/lib/ai/anthropic';
import { extractJsonObject } from '@/lib/fair-assistant/translate';

const MODEL = 'claude-sonnet-5';
const BATCH = 25;
const CONCURRENCY = 4;

const SYSTEM = `You translate text from LoveLab brand documents (a lab-grown diamond jewellery brand) into ONE target language. The translated text is placed back into the original PDF layout, so length matters.

OUTPUT — strict: reply with a JSON object and nothing else: {"items":[{"k":"<key>","t":"<translation>"}]}. One entry per input key, same keys.

RULES:
- Every word in the target language. Natural, professional, warm brand register.
- LENGTH: the translation goes back into the same space, so aim for about the length of the source. Each item has "max_chars", a hard limit: stay under it, rephrasing more concisely if you must. Never drop a fact, an adjective of meaning or half a sentence to save space: rephrase instead.
- Keep every **bold** marker: the same phrases wrapped in ** **, same number of pairs.
- Items with "letter_spaced": true are small uppercase labels. Return plain UPPERCASE words with normal spaces, no spaces between letters.
- Keep verbatim: LoveLab, The Love Group BV, IGI, collection and product names (CUTY, CUBIX, MULTI, MATCHY, SHAPY, HOLY, MOONLIGHT, SIENNA, RIVIERA, LINEA, ZA-HA, FLOWER, ICONIX, MIRANO, LUGANO, FIGARO, PAPERCLIP), numbers, prices, carat weights, dates, URLs, emails.
- Do not add or drop facts. If the source text contains line breaks (\\n), keep exactly the same number of line breaks in the same logical places.`;

function boldPairs(s) {
  return (String(s).match(/\*\*/g) || []).length / 2;
}

/** Prose, as opposed to a name, a contact line or a label that is the same in every language. */
function isSentence(text) {
  const bare = String(text).replace(/\S+@\S+|https?:\/\/\S+|www\.\S+/g, ' ')
  return (bare.match(/(?<![\p{L}\d])\p{Ll}{3,}(?![\p{L}\d])/gu) || []).length >= 3
}

/**
 * The translation if it is usable, else null. Strict: same number of ** pairs
 * and line breaks as the source, and not the source echoed back. Lenient (last
 * chance, one item at a time): a wrong number of line breaks is accepted (the
 * renderer flows the text) and unbalanced bold markers are dropped, because a
 * paragraph without bold is better than one left in the wrong language.
 */
function checked(src, text, lenient = false) {
  if (typeof text !== 'string' || !text.trim()) return null
  const t = text.trim()
  if (t === String(src.text).trim() && isSentence(t)) return null
  const boldOk = boldPairs(t) === boldPairs(src.text)
  const breaksOk = (t.match(/\n/g) || []).length === (String(src.text).match(/\n/g) || []).length
  if (boldOk && breaksOk) return t
  if (!lenient) return null
  return boldOk ? t : t.replaceAll('**', '')
}

/** How much longer than the source a first translation may be (French, German run ~20-30% longer). */
const ROOM = 1.3
const limitFor = (i) => i.maxChars ?? (i.letterSpaced ? i.chars : Math.ceil(i.chars * ROOM))

async function callBatch({ items, language, createMessage, system = SYSTEM, extra = '' }) {
  const payload = items.map((i) => ({
    k: i.key, text: i.text, max_chars: limitFor(i), letter_spaced: !!i.letterSpaced,
    ...(i.current ? { current: i.current } : {}),
  }))
  const res = await createMessage({
    model: MODEL,
    system,
    maxTokens: 6000,
    // Thinking would spend the whole token budget before any JSON comes out.
    thinking: { type: 'disabled' },
    retries: 2,
    messages: [{
      role: 'user',
      content: `Target language: ${language.name} (${language.code})${extra}\n\n${JSON.stringify({ items: payload })}`,
    }],
  })
  const parsed = extractJsonObject(res.text)
  const out = new Map()
  for (const it of Array.isArray(parsed.items) ? parsed.items : []) {
    if (it && typeof it.k === 'string') out.set(it.k, it.t)
  }
  return out
}

async function runBatches(batches, work) {
  const results = []
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    results.push(...(await Promise.all(batches.slice(i, i + CONCURRENCY).map(work))))
  }
  return results
}

/** @returns {Promise<{ map: Map<string,string>, failed: string[] }>} */
export async function translateUnits({ items, language }, deps = {}) {
  const createMessage = deps.createMessage || createAnthropicMessage
  const bySrc = new Map(items.map((i) => [i.key, i]))
  const map = new Map()
  const batches = []
  for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH))

  const accept = (got, lenient = false) => {
    for (const [k, t] of got) {
      const src = bySrc.get(k)
      const ok = src && checked(src, t, lenient)
      if (ok) map.set(k, ok)
    }
  }
  await runBatches(batches, async (b) => {
    try { accept(await callBatch({ items: b, language, createMessage })) } catch (err) {
      console.error('[doc-translate] batch failed:', err?.message)
    }
  })
  // one retry for whatever came back missing or malformed
  const missing = items.filter((i) => !map.has(i.key))
  if (missing.length) {
    const retries = []
    for (let i = 0; i < missing.length; i += BATCH) retries.push(missing.slice(i, i + BATCH))
    await runBatches(retries, async (b) => {
      try {
        accept(await callBatch({ items: b, language, createMessage, extra: '\nA previous answer was missing or malformed for these items: keep the ** markers exactly and return every key.' }))
      } catch (err) {
        console.error('[doc-translate] retry failed:', err?.message)
      }
    })
  }
  // last chance: one paragraph per request, lenient about line breaks and bold
  const stillMissing = items.filter((i) => !map.has(i.key))
  if (stillMissing.length) {
    await runBatches(stillMissing.map((i) => [i]), async (b) => {
      try {
        accept(await callBatch({ items: b, language, createMessage, extra: '\nTranslate this single item completely into the target language. Do not return the source text.' }), true)
      } catch (err) {
        console.error('[doc-translate] single retry failed:', err?.message)
      }
    })
  }
  return { map, failed: items.filter((i) => !map.has(i.key)).map((i) => i.key) }
}

const SHORTEN_SYSTEM = `${SYSTEM}

This is a SHORTENING pass: each item has "current", a translation that is too long for its space. Return a shorter version in the same language that keeps the meaning and the ** markers, at or under max_chars.`

/** Ask for shorter versions of translations that overflowed. */
export async function shortenUnits({ items, language }, deps = {}) {
  const createMessage = deps.createMessage || createAnthropicMessage
  const bySrc = new Map(items.map((i) => [i.key, i]))
  const map = new Map()
  const batches = []
  for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH))
  await runBatches(batches, async (b) => {
    try {
      const got = await callBatch({ items: b, language, createMessage, system: SHORTEN_SYSTEM })
      for (const [k, t] of got) {
        const src = bySrc.get(k)
        const ok = src && checked(src, t)
        if (ok && ok.length < src.current.length) map.set(k, ok)
      }
    } catch (err) {
      console.error('[doc-translate] shorten failed:', err?.message)
    }
  })
  return map
}
