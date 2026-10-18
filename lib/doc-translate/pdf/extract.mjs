/**
 * Read a PDF's text as paragraphs: lines are regrouped into units with an
 * alignment, bold phrases, hard line breaks and letter-spaced labels.
 * Positions come from MuPDF (WASM), in points, origin top-left.
 */
import { cleanFontName } from './fonts.mjs'

let mupdfPromise
export const loadMupdf = () => (mupdfPromise ||= import('mupdf'))

const toRgb = (c) => {
  if (!c || c.length === 0) return [0, 0, 0]
  if (c.length === 1) return [c[0], c[0], c[0]]
  if (c.length === 4) return [(1 - c[0]) * (1 - c[3]), (1 - c[1]) * (1 - c[3]), (1 - c[2]) * (1 - c[3])]
  return [c[0], c[1], c[2]]
}

export function linesOf(page) {
  const st = page.toStructuredText('preserve-whitespace')
  const out = []
  let cur = null
  st.walk({
    beginLine(bbox) { cur = { bbox: [...bbox], chars: [] } },
    onChar(c, origin, font, size, quad, color) {
      cur.chars.push({ c, origin: [...origin], font: cleanFontName(font.getName()), size, color: toRgb(color), x0: Math.min(quad[0], quad[2], quad[4], quad[6]), x1: Math.max(quad[0], quad[2], quad[4], quad[6]) })
    },
    endLine() {
      if (cur && cur.chars.some((ch) => ch.c.trim())) out.push(finishLine(cur))
      cur = null
    },
  })
  return out
}

function finishLine(l) {
  const spans = []
  for (const ch of l.chars) {
    const last = spans[spans.length - 1]
    if (last && last.font === ch.font && Math.abs(last.size - ch.size) < 0.01 && last.colorKey === ch.color.join(',')) {
      last.t += ch.c
    } else {
      spans.push({ t: ch.c, font: ch.font, size: ch.size, color: ch.color, colorKey: ch.color.join(',') })
    }
  }
  const real = spans.filter((s) => s.t.trim())
  const first = l.chars.find((ch) => ch.c.trim()) || l.chars[0]
  return { bbox: l.bbox, base: first.origin[1], spans: real, chars: l.chars }
}

function aligned(a, b, tol = 2.5) {
  const A = a.bbox, B = b.bbox
  const r = new Set()
  if (Math.abs(A[0] - B[0]) < tol) r.add('left')
  if (Math.abs((A[0] + A[2]) / 2 - (B[0] + B[2]) / 2) < tol) r.add('center')
  if (Math.abs(A[2] - B[2]) < tol) r.add('right')
  return r
}

const intersect = (a, b) => new Set([...a].filter((x) => b.has(x)))

export const plain = (s) => s.replaceAll('**', '').replaceAll('\n', ' ')

export function group(page) {
  const L = linesOf(page)
  const units = []
  let cur = null
  for (const l of L) {
    const size = l.spans[0].size
    if (cur) {
      const p = cur.lines[cur.lines.length - 1]
      const gap = l.base - p.base
      const al = aligned(p, l)
      const poss = cur.align === null ? al : intersect(cur.align, al)
      if (gap > 0 && gap <= 1.95 * size && Math.abs(size - p.spans[0].size) < 0.3 && poss.size > 0) {
        cur.lines.push(l)
        cur.align = poss
        continue
      }
    }
    cur = { lines: [l], align: null }
    units.push(cur)
  }
  if (units.length === 0) return []
  const xs0 = Math.min(...units.flatMap((u) => u.lines.map((l) => l.bbox[0])))
  const xs1 = Math.max(...units.flatMap((u) => u.lines.map((l) => l.bbox[2])))
  const centres = units
    .filter((u) => u.lines.length > 1 && u.align && u.align.has('center') && !u.align.has('left'))
    .flatMap((u) => u.lines.map((l) => (l.bbox[0] + l.bbox[2]) / 2))
  units.forEach((u, i) => {
    u.id = i
    if (u.align === null || u.align.size > 1) {
      const b = u.lines[0].bbox
      const c = (b[0] + b[2]) / 2
      if (u.align === null) {
        u.align = centres.some((x) => Math.abs(c - x) < 3) ? 'center'
          : Math.abs(b[0] - xs0) < 3 ? 'left' : Math.abs(b[2] - xs1) < 3 ? 'right' : 'center'
      } else {
        u.align = ['center', 'left', 'right'].find((a) => u.align.has(a))
      }
    } else {
      u.align = [...u.align][0]
    }
    const counts = new Map()
    for (const l of u.lines) for (const s of l.spans) counts.set(s.font, (counts.get(s.font) || 0) + s.t.length)
    u.baseFont = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const widths = u.lines.map((l) => l.bbox[2] - l.bbox[0])
    const maxw = Math.max(...widths)
    // a line that stops well short of the others (and is not the last) is a hard line break
    u.breaks = []
    for (let k = 0; k < widths.length - 1; k += 1) if (widths[k] < 0.8 * maxw) u.breaks.push(k)
    let txt = ''
    u.lines.forEach((l, k) => {
      for (const s of l.spans) txt += s.font !== u.baseFont ? `**${s.t}**` : s.t
      txt += u.breaks.includes(k) ? '\n' : ' '
    })
    u.en = txt.replaceAll('** **', ' ').replaceAll('****', '').trim()
    const toks = plain(u.en).split(/\s+/).filter(Boolean)
    u.letter = u.lines.length === 1 && toks.length >= 3 && toks.filter((t) => t.length <= 2).length / toks.length >= 0.7
    if (u.letter) u.clean = letterClean(u)
  })
  return units
}

/** Rebuild "A FIRST" from a letter-spaced line: gaps wider than the letter gap are word breaks. */
function letterClean(u) {
  const chars = u.lines[0].chars.filter((c) => c.c.trim()).sort((a, b) => a.x0 - b.x0)
  if (chars.length < 2) return plain(u.en)
  const gaps = []
  for (let i = 0; i < chars.length - 1; i += 1) gaps.push(chars[i + 1].x0 - chars[i].x1)
  const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
  let out = chars[0].c
  gaps.forEach((g, i) => {
    if (g > med * 2.2 && g - med > 1.0) out += ' '
    out += chars[i + 1].c
  })
  return out
}

export async function extractPdf(bytes) {
  const mupdf = await loadMupdf()
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf')
  const pages = []
  const n = doc.countPages()
  for (let pn = 0; pn < n; pn += 1) {
    const page = doc.loadPage(pn)
    const [x0, y0, x1, y1] = page.getBounds()
    const items = []
    for (const u of group(page)) {
      const text = plain(u.en)
      if ((text.match(/\p{L}/gu) || []).length < 2) continue // digits, symbols or one letter
      const item = { id: u.id, text: u.en, chars: text.length, lines: u.lines.length, align: u.align, letter_spaced: u.letter }
      if (u.letter) { item.text = u.clean; item.chars = u.clean.length }
      items.push(item)
    }
    pages.push({ page: pn, width: x1 - x0, height: y1 - y0, units: items })
  }
  return { pages }
}
