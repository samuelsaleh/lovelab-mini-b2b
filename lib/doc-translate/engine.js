/**
 * Extract → translate → render pipeline for one LoveLab PDF.
 *
 * The PDF work runs in-process with MuPDF (WASM) in ./pdf. Claude translates
 * the paragraphs; paragraphs that do not fit are sent back to be shortened
 * (at most twice) before anything is flagged.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { translateUnits, shortenUnits } from '@/lib/doc-translate/translator'

const MAX_SHORTEN_ROUNDS = 2

export function resolvePublicPath(filePath) {
  let rel = filePath
  try { rel = decodeURIComponent(filePath) } catch { /* keep as is */ }
  const root = path.join(process.cwd(), 'public')
  const full = path.join(root, rel)
  if (!full.startsWith(root + path.sep)) throw new Error('bad path')
  return full
}

const loadPdf = () => import('./pdf/index.mjs')
const keyOf = (page, id) => `${page}:${id}`

export async function translateDocument({ file, language }, deps = {}) {
  const translate = deps.translateUnits || translateUnits
  const shorten = deps.shortenUnits || shortenUnits
  const readFile = deps.readFile || fs.readFile

  let src
  try { src = resolvePublicPath(file.path) } catch { return { ok: false, status: 400, error: 'Unknown document' } }
  try {
    const pdf = deps.pdf || (await loadPdf())
    const bytes = await readFile(src)
    const extracted = await pdf.extractPdf(bytes)
    const items = []
    for (const p of extracted.pages) {
      for (const u of p.units) {
        items.push({ key: keyOf(p.page, u.id), text: u.text, chars: u.chars, letterSpaced: u.letter_spaced, lines: u.lines })
      }
    }
    if (items.length === 0) {
      return { ok: false, status: 422, error: 'This PDF has no text to translate (it may be made of images)' }
    }

    const { map, failed } = await translate({ items, language }, deps)
    const translations = {}
    for (const [k, t] of map) translations[k] = t

    let report = await pdf.renderPdf(bytes, translations)
    let shortened = 0
    for (let round = 0; round < MAX_SHORTEN_ROUNDS; round += 1) {
      const over = report.flags.filter((f) => f.kind === 'overflow')
      if (over.length === 0) break
      const byKey = new Map(items.map((i) => [i.key, i]))
      const batch = over.map((f) => keyOf(f.page, f.id)).filter((k) => translations[k] && byKey.has(k)).map((k) => {
        const it = byKey.get(k)
        return { key: k, text: it.text, chars: it.chars, maxChars: Math.max(8, Math.floor(translations[k].length * (round === 0 ? 0.9 : 0.8))), current: translations[k], letterSpaced: it.letterSpaced }
      })
      if (batch.length === 0) break
      const better = await shorten({ items: batch, language }, deps)
      if (better.size === 0) break
      for (const [k, t] of better) { translations[k] = t; shortened += 1 }
      report = await pdf.renderPdf(bytes, translations)
    }

    const flags = report.flags.map((f) => ({ ...f, key: keyOf(f.page, f.id) }))
    for (const k of failed) {
      const [page, id] = k.split(':').map(Number)
      flags.push({ page, id, key: k, kind: 'untranslated', detail: 'left in the original language' })
    }
    return { ok: true, pdf: Buffer.from(report.pdf), flags, stats: { pages: extracted.pages.length, units: items.length, shortened } }
  } catch (err) {
    console.error('[doc-translate] failed:', err?.message)
    return { ok: false, status: 500, error: 'Translation failed' }
  }
}
