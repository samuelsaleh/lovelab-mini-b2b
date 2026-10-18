/**
 * Bundled fonts used to write translated text back into a PDF, and the
 * mapping from the font names found in the PDF to them.
 * Inter, Montserrat, Cormorant Garamond, Playfair Display: SIL OFL.
 * Arimo (stands in for Helvetica and anything unknown): Apache 2.0.
 * They cover Latin, Greek and Cyrillic.
 */
import fs from 'node:fs'
import path from 'node:path'

export const FONT_DIR = path.join(process.cwd(), 'lib', 'doc-translate', 'fonts')

export function fontKey(name) {
  const n = String(name || '').toLowerCase()
  const semi = /semi|demi|medium/.test(n)
  const bold = !semi && /bold|black|heavy/.test(n)
  const ital = /italic|ital|oblique/.test(n)
  if (n.includes('playfair')) return bold || semi ? 'Playfair-700' : 'Playfair-400'
  if (n.includes('cormorant')) {
    const w = bold ? 700 : semi ? 600 : 400
    return ital ? `Cormorant-${w >= 600 ? 600 : 400}i` : `Cormorant-${w}`
  }
  if (n.includes('montserrat')) return `Montserrat-${bold ? 700 : semi ? 600 : 400}`
  if (/(^|[^a-z])inter([^a-z]|$)/.test(n)) return `Inter-${bold ? 700 : semi ? 600 : 400}`
  return bold ? 'Arimo-700' : 'Arimo-400'
}

const fileCache = new Map()
export function fontBytes(key) {
  if (!fileCache.has(key)) fileCache.set(key, fs.readFileSync(path.join(FONT_DIR, `${key}.ttf`)))
  return fileCache.get(key)
}

/** Strip the six-letter subset prefix ("ABCDEF+Montserrat" → "Montserrat"). */
export const cleanFontName = (name) => String(name || '').replace(/^[A-Z]{6}\+/, '')
