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
  out.rotated = [] // bboxes of the lines that were left out because they are not horizontal
  let cur = null
  st.walk({
    // Rotated or vertical lines (stamps such as ELECTRONIC COPY) cannot be redrawn in place: leave them as they are.
    beginLine(bbox, wmode, dir) { cur = { bbox: [...bbox], chars: [], skip: wmode !== 0 || Math.abs(dir?.[1] ?? 0) > 0.02 || (dir?.[0] ?? 1) < 0 } },
    onChar(c, origin, font, size, quad, color) {
      // Some PDFs have no space character between words, only a gap ("TheCombinations").
      const prev = cur.chars[cur.chars.length - 1]
      const x0 = Math.min(quad[0], quad[2], quad[4], quad[6])
      if (prev && prev.c.trim() && c.trim() && x0 - prev.x1 > 0.22 * size) {
        cur.chars.push({ ...prev, c: ' ', x0: prev.x1, x1: x0 })
      }
      cur.chars.push({ c, origin: [...origin], font: cleanFontName(font.getName()), size, color: toRgb(color), x0: Math.min(quad[0], quad[2], quad[4], quad[6]), x1: Math.max(quad[0], quad[2], quad[4], quad[6]) })
    },
    endLine() {
      if (cur?.skip && cur.chars.some((ch) => ch.c.trim())) out.rotated.push(cur.bbox)
      if (cur && !cur.skip && cur.chars.some((ch) => ch.c.trim())) out.push(finishLine(cur))
      cur = null
    },
  })
  return out
}

/** Filled rectangles (cards, call-outs) that are big enough to contain text; the page background is left out. */
export async function shapesOf(page) {
  const mupdf = await loadMupdf()
  const [px0, py0, px1, py1] = page.getBounds()
  const out = []
  const dev = new mupdf.Device({
    fillPath(path, evenOdd, ctm) {
      const b = path.getBounds(null, ctm)
      const w = b[2] - b[0]
      const h = b[3] - b[1]
      if (w > 20 && h > 10 && w * h < 0.7 * (px1 - px0) * (py1 - py0)) out.push([...b])
    },
  })
  page.run(dev, mupdf.Matrix.identity)
  return out
}

/** Rectangles of the images on a page (they are obstacles when text is allowed to grow). */
export function imagesOf(page) {
  const out = []
  page.toStructuredText('preserve-whitespace,preserve-images').walk({ onImageBlock(bbox) { out.push([...bbox]) } })
  return out
}

function finishLine(l) {
  const spans = []
  for (const ch of l.chars) {
    const last = spans[spans.length - 1]
    // a space is often set in another font than the word before it: keep it with that word
    if (last && (!ch.c.trim() || (last.font === ch.font && Math.abs(last.size - ch.size) < 0.01 && last.colorKey === ch.color.join(',')))) {
      last.t += ch.c
    } else {
      spans.push({ t: ch.c, font: ch.font, size: ch.size, color: ch.color, colorKey: ch.color.join(',') })
    }
  }
  const real = spans.filter((s) => s.t.trim())
  const first = l.chars.find((ch) => ch.c.trim()) || l.chars[0]
  const dominant = (key) => {
    const w = new Map()
    for (const sp of real) w.set(sp[key], (w.get(sp[key]) || 0) + sp.t.length)
    return [...w.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  }
  return { bbox: l.bbox, base: first.origin[1], spans: real, chars: l.chars, color: dominant('colorKey'), font: dominant('font') }
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
      // same font but a different colour = a heading above its text, not one paragraph
      const heading = l.color !== p.color && l.font === p.font
      if (gap > 0 && gap <= 1.95 * size && Math.abs(size - p.spans[0].size) < 0.3 && poss.size > 0 && !heading) {
        cur.lines.push(l)
        cur.align = poss
        continue
      }
    }
    cur = { lines: [l], align: null }
    units.push(cur)
  }
  if (units.length === 0) return []
  const pb = page.getBounds()
  const pageMid = (pb[0] + pb[2]) / 2
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
        // A single line says nothing about its alignment, so look at the other
        // lines on the page: whichever edge (left, centre, right) it shares
        // with the most of them is the one it is aligned to.
        const others = units.filter((o) => o !== u).flatMap((o) => o.lines.map((l) => l.bbox))
        const near = (f) => others.filter((o) => Math.abs(f(o) - f(b)) < 2).length
        const nl = near((x) => x[0]), nr = near((x) => x[2])
        // a line centred on the page is centred, whatever else shares its right edge
        const nc = near((x) => (x[0] + x[2]) / 2) + (Math.abs(c - pageMid) < 3 ? 3 : 0)
        const mid = pageMid
        if (nl === 0 && nc === 0 && nr === 0) {
          u.align = Math.abs(b[0] - xs0) < 3 ? 'left' : Math.abs(b[2] - xs1) < 3 ? 'right' : 'center'
        } else if (nc > nl && nc >= nr) u.align = 'center'
        else if (nl > nc && nl >= nr) u.align = 'left'
        else if (nr > nl && nr > nc) u.align = 'right'
        else u.align = Math.abs(c - mid) < 3 ? 'center' : 'left'
      } else {
        // two lines of nearly equal width fit both "left" and "centre": the lines
        // around them decide, as for a single line
        const others = units.filter((o) => o !== u).flatMap((o) => o.lines.map((l) => l.bbox))
        const near = (f) => others.filter((o) => Math.abs(f(o) - f(b)) < 2).length
        const score = { left: near((x) => x[0]), center: near((x) => (x[0] + x[2]) / 2) + (Math.abs(c - pageMid) < 3 ? 3 : 0), right: near((x) => x[2]) }
        u.align = [...u.align].sort((p, q) => score[q] - score[p] || (p === 'left' ? -1 : q === 'left' ? 1 : 0))[0]
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
    const txtOf = (l) => l.spans.map((sp) => sp.t).join('').trim()
    const uniform = (l) => l.spans.every((sp) => sp.font === l.spans[0].font)
    const upper = (t) => /^[\p{Lu}\d]/u.test(t)
    for (let k = 0; k < widths.length - 1; k += 1) {
      const a = txtOf(u.lines[k])
      const b = txtOf(u.lines[k + 1])
      const next = u.lines[k + 1]
      const label = next.spans[0].font !== u.baseFont && /^[^:]{1,24}:/.test(b)             // "Carats : 0.05" after "Setting : …"
      const item = upper(b) && (/[.!?:;]$/.test(a) || (a.length <= 45 && b.length <= 45))   // a new short sentence or list item
      const style = uniform(u.lines[k]) && uniform(next) && u.lines[k].spans[0].font !== next.spans[0].font // bold line, then regular line
      if (widths[k] < 0.8 * maxw || label || item || style) u.breaks.push(k)
    }
    // An address or contact block (3+ lines, at least half of them clearly short)
    // is a list: every line is its own line, including the widest one.
    if (widths.length >= 3 && u.breaks.length >= (widths.length - 1) / 2) u.breaks = widths.slice(0, -1).map((_, k) => k)
    let txt = ''
    u.lines.forEach((l, k) => {
      for (const s of l.spans) txt += s.font !== u.baseFont ? `**${s.t}**` : s.t
      txt += u.breaks.includes(k) ? '\n' : ' '
    })
    u.en = txt.replaceAll('** **', ' ').replaceAll('****', '').trim()
    const toks = plain(u.en).split(/\s+/).filter(Boolean)
    const byTokens = u.lines.length === 1 && toks.length >= 3 && toks.filter((t) => t.length <= 2).length / toks.length >= 0.7
    u.letter = byTokens || isTracked(u)
    if (u.letter) {
      u.cleanLines = u.lines.map((l) => letterClean(l))
      u.clean = u.cleanLines.join(' ')
    }
  })
  // A picture of a document with a diagonal stamp on it (the IGI certificate): the
  // stamp cannot be redrawn, and erasing the text around it would cut the stamp, so
  // the whole area is left as it is, in its own language.
  if (L.rotated?.length) {
    const grow = (r, m) => [r[0] - m, r[1] - m, r[2] + m, r[3] + m]
    const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]
    const box = (u) => u.lines.map((l) => l.bbox).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])])
    let zone = L.rotated.map((r) => grow(r, 0))
    for (let again = true; again;) {
      again = false
      for (const u of units) {
        if (!u.protected && zone.some((z) => hit(z, box(u)))) { u.protected = true; zone.push(box(u)); again = true }
      }
    }
    zone = zone.map((z) => grow(z, 18))
    for (const u of units) if (!u.protected && zone.some((z) => hit(z, box(u)))) u.protected = true
  }
  return units
}

const letterGaps = (l) => {
  const chars = l.chars.filter((c) => c.c.trim()).sort((a, b) => a.x0 - b.x0)
  return chars.slice(0, -1).map((c, i) => chars[i + 1].x0 - c.x1)
}

/**
 * Tracked (letter-spaced) label: on every line the gap between most letters is
 * a sizeable part of the font size, which running text never has. Mostly
 * capitals, so that a justified or widely set paragraph is not taken for one.
 */
function isTracked(u) {
  const letters = u.lines.flatMap((l) => l.chars.filter((c) => /\p{L}/u.test(c.c)))
  if (letters.length < 4) return false
  if (letters.filter((c) => c.c === c.c.toUpperCase()).length / letters.length < 0.8) return false
  const wide = (l) => {
    const gaps = letterGaps(l)
    const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
    return med > 0.1 * l.spans[0].size
  }
  // every line is wide-set; a short last line ("ONE") may have only 2 gaps
  return u.lines.every((l) => letterGaps(l).length >= 2 && wide(l)) && u.lines.some((l) => letterGaps(l).length >= 3)
}

/** Rebuild "A FIRST" from a letter-spaced line: gaps wider than the letter gap are word breaks. */
function letterClean(line) {
  const chars = line.chars.filter((c) => c.c.trim()).sort((a, b) => a.x0 - b.x0)
  if (chars.length < 2) return chars.map((c) => c.c).join('')
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
      if (u.protected) continue
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
