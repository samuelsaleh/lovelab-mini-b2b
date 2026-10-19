/**
 * Write translations back into a PDF in place: the old text is removed
 * (images and vector graphics stay), the new text is drawn at the same
 * position, size, colour and alignment, with embedded OFL fonts.
 */
import { fontBytes, fontKey } from './fonts.mjs'
import { group, loadMupdf, plain } from './extract.mjs'

const FALLBACK = (key) => (key.endsWith('700') ? 'Arimo-700' : 'Arimo-400')

class FontSet {
  constructor(mupdf, doc) { this.mupdf = mupdf; this.doc = doc; this.map = new Map() }
  get(key) {
    if (!this.map.has(key)) {
      const font = new this.mupdf.Font(key, fontBytes(key))
      this.map.set(key, { font, obj: this.doc.addFont(font), res: `FZ${this.map.size + 1}`, key })
    }
    return this.map.get(key)
  }
  has(key, text) {
    const { font } = this.get(key)
    return [...text].every((ch) => /\s/.test(ch) || font.encodeCharacter(ch.codePointAt(0)) !== 0)
  }
  /** Bundled font for an original font name, falling back to Arimo for missing glyphs. */
  forName(name, text) {
    const key = fontKey(name)
    if (this.has(key, text)) return { key, ok: true }
    const alt = FALLBACK(key)
    return { key: alt, ok: this.has(alt, text) }
  }
  width(key, text, size) {
    const { font } = this.get(key)
    let w = 0
    for (const ch of text) w += font.advanceGlyph(font.encodeCharacter(ch.codePointAt(0))) * size
    return w
  }
}

function runsToWords(fr, baseKey, altKey, baseCol, altCol) {
  const runs = []
  fr.split('**').forEach((part, i) => { if (part) runs.push([part, i % 2 ? altKey : baseKey, i % 2 ? altCol : baseCol]) })
  const words = []
  let glue = false
  for (const [txt, k, c] of runs) {
    for (const p of txt.match(/\S+|\s+/g) || []) {
      if (/^\s+$/.test(p)) { glue = false; continue }
      if (glue && words.length) words[words.length - 1].push([p, k, c])
      else words.push([[p, k, c]])
      glue = true
    }
  }
  return words
}

const rectOf = (lines) => [
  Math.min(...lines.map((l) => l.bbox[0])), Math.min(...lines.map((l) => l.bbox[1])),
  Math.max(...lines.map((l) => l.bbox[2])), Math.max(...lines.map((l) => l.bbox[3])),
]
const area = (a, b) => {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0])
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1])
  return w > 0 && h > 0 ? w * h : 0
}

function hexOf(font, text) {
  let h = ''
  for (const ch of text) h += font.encodeCharacter(ch.codePointAt(0)).toString(16).padStart(4, '0')
  return h
}

const f2 = (n) => n.toFixed(3)

// Type sizes tried, in order, until the text fits its box. Overlapping the next block is worse than 12% smaller type.
const FIT_SCALES = [1.0, 0.98, 0.96, 0.94, 0.92, 0.9, 0.88]

function drawUnit({ fonts, ops, pn, u, fr, pageH }) {
  const flags = []
  const L = u.lines
  const size = L[0].spans[0].size
  const baseSpan = L.flatMap((l) => l.spans).find((s) => s.font === u.baseFont)
  const altSpan = L.flatMap((l) => l.spans).find((s) => s.font !== u.baseFont)
  const text = plain(fr)
  const base = fonts.forName(u.baseFont, text)
  const altKey = altSpan ? fonts.forName(altSpan.font, text).key : base.key
  if (!base.ok) flags.push({ page: pn, id: u.id, kind: 'glyph', detail: 'font lacks some characters' })
  const baseCol = baseSpan.color
  const altCol = altSpan ? altSpan.color : baseCol
  const x0 = Math.min(...L.map((l) => l.bbox[0]))
  const x1 = Math.max(...L.map((l) => l.bbox[2]))
  const W = x1 - x0
  const cx = L.reduce((a, l) => a + (l.bbox[0] + l.bbox[2]) / 2, 0) / L.length
  const al = u.align
  const n = L.length
  const top = Math.min(...L.map((l) => l.bbox[1]))
  const put = (x, y, t, key, sz, col, tc = 0) => {
    const f = fonts.get(key)
    ops.push(`BT ${col.map(f2).join(' ')} rg /${f.res} ${sz.toFixed(3)} Tf ${tc.toFixed(3)} Tc 1 0 0 1 ${x.toFixed(3)} ${(pageH - y).toFixed(3)} Tm <${hexOf(f.font, t)}> Tj ET`)
  }

  if (u.letter) {
    // Tracked label. The tracking is measured on the original's first line and
    // kept; a label that wrapped over several lines is wrapped again. If it
    // does not fit, tighten the tracking first, then shrink the type.
    const orig = u.cleanLines[0]
    const W0 = L[0].bbox[2] - L[0].bbox[0]
    const track0 = (W0 - fonts.width(base.key, orig, size)) / Math.max(orig.length - 1, 1)
    const words = text.split(/\s+/).filter(Boolean)
    const lead = n > 1 ? (L[n - 1].base - L[0].base) / (n - 1) : 0
    const widthOf = (str, sz, tr) => fonts.width(base.key, str, sz) + tr * Math.max([...str].length - 1, 0)
    let chosen = null
    let wrapped = []
    for (const scale of FIT_SCALES) {
      const sz = size * scale
      for (const k of [1, 0.7, 0.4, 0]) {
        const tr = track0 * scale * k
        wrapped = []
        let cur = ''
        for (const w of words) {
          const trial = cur ? `${cur} ${w}` : w
          if (cur && widthOf(trial, sz, tr) > W + 0.5) { wrapped.push(cur); cur = w } else cur = trial
        }
        if (cur) wrapped.push(cur)
        if (wrapped.length <= n && wrapped.every((ln) => widthOf(ln, sz, tr) <= W + 0.5)) { chosen = { sz, tr, scale }; break }
      }
      if (chosen) break
    }
    if (!chosen) chosen = { sz: size * FIT_SCALES.at(-1), tr: 0, scale: FIT_SCALES.at(-1) }
    const { sz, tr } = chosen
    if (chosen.scale < 1) flags.push({ page: pn, id: u.id, kind: 'shrunk', detail: `font reduced by ${Math.round((1 - chosen.scale) * 100)}%` })
    if (wrapped.length > n) flags.push({ page: pn, id: u.id, kind: 'overflow', detail: `${wrapped.length} lines instead of ${n}` })
    let xmin = 1e9
    let xmax = -1e9
    wrapped.forEach((ln, i) => {
      const w = widthOf(ln, sz, tr)
      const xs = al === 'left' ? x0 : al === 'right' ? x1 - w : cx - w / 2
      xmin = Math.min(xmin, xs)
      xmax = Math.max(xmax, xs + w)
      put(xs, L[0].base + i * lead, ln, base.key, sz, baseCol, tr)
    })
    const lh = L[0].bbox[3] - L[0].bbox[1]
    return { flags, rect: [xmin, top, xmax, L[0].bbox[1] + (wrapped.length - 1) * (lead || lh) + lh] }
  }

  let segs = fr.split('\n')
  if (segs.length !== u.breaks.length + 1) {
    if (segs.length > 1) flags.push({ page: pn, id: u.id, kind: 'linebreaks', detail: 'line breaks not kept' })
    segs = [fr.replaceAll('\n', ' ')]
  }
  let carry = false
  const segWords = segs.map((sg) => {
    let s = carry ? `**${sg}` : sg
    carry = (s.match(/\*\*/g) || []).length % 2 === 1
    if (carry) s += '**'
    return runsToWords(s, base.key, altKey, baseCol, altCol)
  })
  if (!segWords.some((w) => w.length)) return { flags, rect: [x0, top, x1, top] }
  const lead = n > 1 ? (L[n - 1].base - L[0].base) / (n - 1) : 0
  const wordW = (w, sz) => w.reduce((a, [t, k]) => a + fonts.width(k, t, sz), 0)
  const space = (sz) => fonts.width(base.key, ' ', sz)
  const lineW = (ws, sz) => ws.reduce((a, w) => a + wordW(w, sz), 0) + space(sz) * (ws.length - 1)

  let chosen = null
  let lines = []
  for (const scale of FIT_SCALES) {
    const sz = size * scale
    lines = []
    for (const words of segWords) {
      let cur = [[]]
      if (n === 1) cur = [words]
      else {
        for (const w of words) {
          const trial = [...cur[cur.length - 1], w]
          if (cur[cur.length - 1].length && lineW(trial, sz) > W + 0.5) cur.push([w])
          else cur[cur.length - 1] = trial
        }
      }
      lines.push(...cur)
    }
    if (lines.length <= n && lines.every((l) => n === 1 || lineW(l, sz) <= W + 0.5)) { chosen = { sz, lines, scale }; break }
  }
  if (!chosen) chosen = { sz: size * FIT_SCALES.at(-1), lines, scale: FIT_SCALES.at(-1) }
  const { sz } = chosen
  lines = chosen.lines
  if (chosen.scale < 1) flags.push({ page: pn, id: u.id, kind: 'shrunk', detail: `font reduced by ${Math.round((1 - chosen.scale) * 100)}%` })
  if (lines.length > n) flags.push({ page: pn, id: u.id, kind: 'overflow', detail: `${lines.length} lines instead of ${n}` })
  let xmin = 1e9
  let xmax = -1e9
  lines.forEach((ln, i) => {
    const w = lineW(ln, sz)
    const xs = al === 'left' ? x0 : al === 'right' ? x1 - w : cx - w / 2
    xmin = Math.min(xmin, xs)
    xmax = Math.max(xmax, xs + w)
    const y = L[0].base + i * (lead || 0)
    let x = xs
    for (const wd of ln) {
      for (const [t, k, c] of wd) { put(x, y, t, k, sz, c); x += fonts.width(k, t, sz) }
      x += space(sz)
    }
  })
  const lh = lead || (L[0].bbox[3] - L[0].bbox[1])
  const bottom = L[0].bbox[1] + (lines.length - 1) * lh + (L[0].bbox[3] - L[0].bbox[1])
  return { flags, rect: [xmin, top, xmax, bottom] }
}

/**
 * @param {Uint8Array|Buffer} bytes  source PDF
 * @param {Record<string,string>} translations  "<page>:<id>" → translated text (with **bold** markers)
 * @returns {{ pdf: Uint8Array, units: number, flags: object[] }}
 */
export async function renderPdf(bytes, translations) {
  const mupdf = await loadMupdf()
  const doc = mupdf.PDFDocument.openDocument(bytes, 'application/pdf')
  const fonts = new FontSet(mupdf, doc)
  const flags = []
  let count = 0
  const n = doc.countPages()
  for (let pn = 0; pn < n; pn += 1) {
    const page = doc.loadPage(pn)
    const units = group(page)
    const todo = []
    for (const u of units) {
      const fr = translations[`${pn}:${u.id}`]
      if (typeof fr === 'string' && fr.trim()) todo.push([u, fr])
    }
    if (todo.length === 0) continue
    const [bx0, by0, bx1, by1] = page.getBounds()
    const pobj = page.getObject()
    const rot = pobj.get('Rotate')
    if (bx0 !== 0 || by0 !== 0 || (rot && !rot.isNull() && rot.asNumber() % 360 !== 0)) {
      flags.push({ page: pn, id: -1, kind: 'unsupported', detail: 'rotated or offset page left untranslated' })
      continue
    }
    for (const [u] of todo) {
      for (const l of u.lines) {
        const a = page.createAnnotation('Redact')
        a.setRect([l.bbox[0] + 0.3, l.bbox[1] + 1.2, l.bbox[2] - 0.3, l.bbox[3] - 1.2])
      }
    }
    page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_NONE, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE)

    const ops = []
    const placed = []
    for (const [u, fr] of todo) {
      const info = drawUnit({ fonts, ops, pn, u, fr, pageH: by1 })
      flags.push(...info.flags)
      placed.push([u, info.rect])
      count += 1
    }
    for (const [u, rect] of placed) {
      const orig = rectOf(u.lines)
      for (const v of units) {
        if (v === u) continue
        const vr = rectOf(v.lines)
        if (area(rect, vr) > area(orig, vr) + 3 && !flags.some((f) => f.page === pn && f.id === u.id && f.kind === 'overflow')) {
          flags.push({ page: pn, id: u.id, kind: 'overflow', detail: 'text runs into the next block' })
        }
      }
      if (rect[0] < -1 || rect[2] > bx1 + 1 || rect[3] > by1 + 1) {
        flags.push({ page: pn, id: u.id, kind: 'overflow', detail: 'text leaves the page' })
      }
    }

    // resources + content
    let res = pobj.getInheritable ? pobj.getInheritable('Resources') : pobj.get('Resources')
    if (!res || res.isNull()) { res = doc.newDictionary(); pobj.put('Resources', res) }
    let fd = res.get('Font')
    if (!fd || fd.isNull()) { fd = doc.newDictionary(); res.put('Font', fd) }
    for (const f of fonts.map.values()) fd.put(f.res, f.obj)
    const stream = doc.addStream(`q\n${ops.join('\n')}\nQ`, doc.newDictionary())
    const contents = pobj.get('Contents')
    const arr = doc.newArray()
    if (contents && contents.isArray()) { for (let i = 0; i < contents.length; i += 1) arr.push(contents.get(i)) } else if (contents && !contents.isNull()) arr.push(contents)
    arr.push(stream)
    pobj.put('Contents', arr)
  }
  const pdf = Uint8Array.from(doc.saveToBuffer('compress').asUint8Array()) // copy: a view into WASM memory detaches when the heap grows
  return { pdf, units: count, flags }
}
