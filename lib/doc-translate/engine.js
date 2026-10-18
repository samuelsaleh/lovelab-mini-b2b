/**
 * Extract → translate → render pipeline for one LoveLab PDF.
 *
 * The PDF work is done by pdf_engine (Python + PyMuPDF), called as a child
 * process. Claude translates the paragraphs; paragraphs that do not fit are
 * sent back to be shortened (at most twice) before anything is flagged.
 */
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { translateUnits, shortenUnits } from '@/lib/doc-translate/translator'

const CLI = path.join(process.cwd(), 'pdf_engine', 'cli.py')
const MAX_SHORTEN_ROUNDS = 2

export function resolvePublicPath(filePath) {
  let rel = filePath
  try { rel = decodeURIComponent(filePath) } catch { /* keep as is */ }
  const full = path.join(process.cwd(), 'public', rel)
  if (!full.startsWith(path.join(process.cwd(), 'public') + path.sep)) throw new Error('bad path')
  return full
}

export function runPython(args) {
  const python = process.env.PDF_ENGINE_PYTHON || 'python3'
  return new Promise((resolve, reject) => {
    execFile(python, [CLI, ...args], { maxBuffer: 64 * 1024 * 1024, timeout: 150_000 }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error(String(stderr || err.message).trim().split('\n').pop())
        e.unavailable = err.code === 'ENOENT' || /No module named/i.test(String(stderr))
        return reject(e)
      }
      try { resolve(JSON.parse(stdout)) } catch { reject(new Error('PDF engine returned invalid output')) }
    })
  })
}

const keyOf = (page, id) => `${page}:${id}`

export async function translateDocument({ file, language }, deps = {}) {
  const run = deps.runPython || runPython
  const translate = deps.translateUnits || translateUnits
  const shorten = deps.shortenUnits || shortenUnits
  const readFile = deps.readFile || fs.readFile

  let src
  try { src = resolvePublicPath(file.path) } catch { return { ok: false, status: 400, error: 'Unknown document' } }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-translate-'))
  try {
    const extracted = await run(['extract', src])
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

    const trPath = path.join(dir, 'translations.json')
    const outPath = path.join(dir, 'out.pdf')
    const render = async () => {
      await fs.writeFile(trPath, JSON.stringify(translations), 'utf8')
      return run(['render', src, trPath, outPath])
    }
    let report = await render()
    let shortened = 0

    for (let round = 0; round < MAX_SHORTEN_ROUNDS; round += 1) {
      const over = report.flags.filter((f) => f.kind === 'overflow')
      if (over.length === 0) break
      const byKey = new Map(items.map((i) => [i.key, i]))
      const batch = over.map((f) => keyOf(f.page, f.id)).filter((k) => translations[k] && byKey.has(k)).map((k) => {
        const it = byKey.get(k)
        return { key: k, text: it.text, chars: it.chars, maxChars: Math.max(8, Math.floor(it.chars * (round === 0 ? 1 : 0.85))), current: translations[k], letterSpaced: it.letterSpaced }
      })
      if (batch.length === 0) break
      const better = await shorten({ items: batch, language }, deps)
      if (better.size === 0) break
      for (const [k, t] of better) { translations[k] = t; shortened += 1 }
      report = await render()
    }

    const pdf = await readFile(outPath)
    const flags = report.flags.map((f) => ({ ...f, key: keyOf(f.page, f.id) }))
    for (const k of failed) {
      const [page, id] = k.split(':').map(Number)
      flags.push({ page, id, key: k, kind: 'untranslated', detail: 'left in the original language' })
    }
    return { ok: true, pdf, flags, stats: { pages: extracted.pages.length, units: items.length, shortened } }
  } catch (err) {
    if (err.unavailable) {
      return { ok: false, status: 501, error: 'The PDF engine is not available on this server (needs Python with PyMuPDF)' }
    }
    console.error('[doc-translate] failed:', err?.message)
    return { ok: false, status: 500, error: 'Translation failed' }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
