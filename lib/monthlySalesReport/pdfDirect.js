/**
 * The report PDF, drawn directly with pdf-lib — no browser, no Chrome.
 * Runs anywhere plain JavaScript runs: Node, the Next.js server, and Google
 * Apps Script (where the monthly report is scheduled, 25/09/2026: nothing
 * is installed on the LoveLab server).
 *
 * One phone-width page (120 mm), as tall as its content, no page breaks —
 * it reads like a web page on an iPhone. Same layout, sizes and colours as
 * the earlier HTML version: header · four headline figures (2×2) · sales by
 * month (chart + B2B/B2C/total table) · sales by agent · B2B vs B2C · agents
 * table · one block per fair this month · every fair of the year · footer.
 *
 * The charts come from svgCharts.js unchanged; their few shapes (rect, path,
 * line, text) are replayed here as PDF drawing operations.
 *
 * Text is Liberation Sans (embedded, full Latin Extended, so "Kiciński"
 * prints as is). Only the title uses the built-in serif (Times) — its € sign
 * is poor, so every amount is set in the sans.
 */

import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { LIBERATION_SANS_BOLD, LIBERATION_SANS_REGULAR } from './fonts/liberationSans.js'
import { AMOUNT_BASIS_LABEL, change, cost, count, dateRange, euro, pct } from './format.js'
import { CHART, horizontalBars, splitBars, stackedColumns } from './svgCharts.js'

const MM = 72 / 25.4
export const PAGE_WIDTH_MM = 120
const PAGE_W = PAGE_WIDTH_MM * MM
const MARGIN = 6 * MM
const CONTENT_W = PAGE_W - 2 * MARGIN
const GAP = 3.2 * MM

const C = {
  plum: '#5D3A5E',
  text: '#4F4F4F',
  heading: '#3b2f3f',
  muted: '#8A6A7D',
  line: '#EAE3EC',
  rowLine: '#f3eef4',
  dotted: '#eee4ef',
  shade: '#FBF6FB',
  cost: '#9A3B2E',
  amber: '#8A5A00',
  amberBg: '#FFF4E5',
  amberLine: '#E8B45A',
  b2b: CHART.b2b,
  b2c: CHART.b2c,
  white: '#ffffff',
}

function hex(h) {
  const n = parseInt(h.replace('#', '').replace(/^(.)(.)(.)$/, '$1$1$2$2$3$3'), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** base64 → bytes without atob/Buffer (Apps Script has neither in plain JS). */
export function base64ToBytes(b64) {
  const map = new Uint8Array(128)
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  for (let i = 0; i < abc.length; i++) map[abc.charCodeAt(i)] = i
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const a = map[clean.charCodeAt(i)], b = map[clean.charCodeAt(i + 1)]
    const c = map[clean.charCodeAt(i + 2)], d = map[clean.charCodeAt(i + 3)]
    const n = (a << 18) | (b << 12) | ((c || 0) << 6) | (d || 0)
    if (o < out.length) out[o++] = (n >> 16) & 255
    if (i + 2 < clean.length && o < out.length) out[o++] = (n >> 8) & 255
    if (i + 3 < clean.length && o < out.length) out[o++] = n & 255
  }
  return out.subarray(0, o)
}

// ── Drawing surface: record operations top-down, replay once the height is known ──

class Surface {
  constructor(fonts) {
    this.fonts = fonts
    this.bg = []
    this.fg = []
  }
  width(text, font, size) {
    return this.fonts[font].widthOfTextAtSize(text, size)
  }
  /** Serif can't show every character (e.g. "−", "ń"); fall back to sans for that string. */
  pick(font, text) {
    if (font !== 'serif') return font
    try { this.fonts.serif.encodeText(text); return 'serif' } catch { return 'sans' }
  }
  text(str, x, y, { font = 'sans', size = 8, color = C.text, align = 'left', opacity } = {}) {
    const s = String(str ?? '')
    if (!s) return
    const f = this.pick(font, s)
    const w = this.width(s, f, size)
    const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
    this.fg.push({ t: 'text', s, x: left, y, size, font: f, color, opacity })
  }
  rect(x, y, w, h, { fill, stroke, lw = 0.75, layer = 'fg' } = {}) {
    this[layer].push({ t: 'rect', x, y, w, h, fill, stroke, lw })
  }
  line(x1, y1, x2, y2, { color = C.line, lw = 0.75, dash } = {}) {
    this.fg.push({ t: 'line', x1, y1, x2, y2, color, lw, dash })
  }
  path(d, x, y, scale, color) {
    this.fg.push({ t: 'path', d, x, y, scale, color })
  }
  image(img, x, y, w, h) {
    this.fg.push({ t: 'image', img, x, y, w, h })
  }
  /** Wrap to a width; returns the lines. */
  wrap(str, font, size, maxW) {
    const words = String(str ?? '').split(/\s+/).filter(Boolean)
    const lines = []
    let cur = ''
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w
      if (this.width(next, font, size) <= maxW || !cur) cur = next
      else { lines.push(cur); cur = w }
    }
    if (cur) lines.push(cur)
    return lines
  }
  /** Draw wrapped text; returns the height used. */
  para(str, x, y, maxW, { font = 'sans', size = 8, color = C.text, lh = 1.4 } = {}) {
    const lines = this.wrap(str, this.pick(font, str), size, maxW)
    lines.forEach((l, i) => this.text(l, x, y + i * size * lh, { font, size, color }))
    return lines.length * size * lh
  }
}

function replay(page, surface, H) {
  const baseline = (op) => H - op.y - op.size * 0.8
  for (const op of [...surface.bg, ...surface.fg]) {
    if (op.t === 'rect') {
      page.drawRectangle({
        x: op.x, y: H - op.y - op.h, width: op.w, height: op.h,
        ...(op.fill ? { color: hex(op.fill) } : {}),
        ...(op.stroke ? { borderColor: hex(op.stroke), borderWidth: op.lw } : {}),
      })
    } else if (op.t === 'line') {
      page.drawLine({ start: { x: op.x1, y: H - op.y1 }, end: { x: op.x2, y: H - op.y2 }, thickness: op.lw, color: hex(op.color), ...(op.dash ? { dashArray: op.dash } : {}) })
    } else if (op.t === 'text') {
      page.drawText(op.s, { x: op.x, y: baseline(op), size: op.size, font: surface.fonts[op.font], color: hex(op.color), ...(op.opacity != null ? { opacity: op.opacity } : {}) })
    } else if (op.t === 'path') {
      page.drawSvgPath(op.d, { x: op.x, y: H - op.y, scale: op.scale, color: hex(op.color) })
    } else if (op.t === 'image') {
      page.drawImage(op.img, { x: op.x, y: H - op.y - op.h, width: op.w, height: op.h })
    } else if (op.t === 'watermark') {
      page.drawText(op.s, { x: op.x, y: H * 0.62, size: op.size, font: surface.fonts.sansBold, color: hex(C.b2c), opacity: 0.09, rotate: degrees(60) })
    }
  }
}

// ── The charts: replay svgCharts.js output ────────────────────────────

const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

export function parseSvg(svg) {
  const head = svg.match(/<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/)
  const elements = []
  const re = /<(rect|path|line|text)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/text>)/g
  let m
  while ((m = re.exec(svg))) {
    const attrs = {}
    for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2]
    elements.push({ tag: m[1], attrs, text: m[3] !== undefined ? unescape(m[3]) : null })
  }
  return { width: Number(head?.[1] || 0), height: Number(head?.[2] || 0), elements }
}

function roundedRectPath(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  return `M${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x + r}Q${x},${y + h} ${x},${y + h - r}V${y + r}Q${x},${y} ${x + r},${y}Z`
}

/** Draw an svgCharts.js chart at (x, y), scaled to width; returns the height used. */
function drawChart(s, svg, x, y, width) {
  const { width: vw, height: vh, elements } = parseSvg(svg)
  const k = width / (vw || width)
  for (const el of elements) {
    const a = el.attrs
    const n = (v) => Number(v) || 0
    if (el.tag === 'rect') {
      const d = roundedRectPath(n(a.x), n(a.y), n(a.width), n(a.height), n(a.rx))
      if (n(a.width) > 0 && n(a.height) > 0) s.path(d, x, y, k, a.fill || C.text)
    } else if (el.tag === 'path') {
      if (a.d) s.path(a.d, x, y, k, a.fill || C.text)
    } else if (el.tag === 'line') {
      s.line(x + n(a.x1) * k, y + n(a.y1) * k, x + n(a.x2) * k, y + n(a.y2) * k, { color: a.stroke || C.line, lw: n(a['stroke-width']) * k || 0.5 })
    } else if (el.tag === 'text') {
      const size = n(a['font-size']) * k
      const bold = Number(a['font-weight']) >= 600
      const align = a['text-anchor'] === 'end' ? 'right' : a['text-anchor'] === 'middle' ? 'center' : 'left'
      // SVG y is the baseline; the surface wants the top of the line.
      s.text(el.text, x + n(a.x) * k, y + n(a.y) * k - size * 0.8, { font: bold ? 'sansBold' : 'sans', size, color: a.fill || C.text, align })
    }
  }
  return vh * k
}

// ── Building blocks ───────────────────────────────────────────────────

const legend = (s, xRight, y) => {
  let x = xRight
  for (const [label, color] of [['B2C', C.b2c], ['B2B', C.b2b]]) {
    s.text(label, x, y, { size: 7.2, align: 'right' })
    x -= s.width(label, 'sans', 7.2) + 1.2 * MM + 2.4 * MM
    s.rect(x, y + 0.6, 2.4 * MM, 2.4 * MM, { fill: color })
    x -= 3 * MM
  }
}

/** A bordered card: title row, then content; returns the y after it. */
function card(s, y, title, draw, { legendRight = false, note } = {}) {
  const padX = 3 * MM
  const top = y
  const ix = MARGIN + padX
  const iw = CONTENT_W - 2 * padX
  let cy = y + 2.6 * MM
  s.text(title.toUpperCase(), ix, cy, { font: 'sansBold', size: 7.6, color: C.heading })
  if (legendRight) legend(s, ix + iw, cy)
  if (note) s.text(note, ix + iw, cy + 0.4, { size: 7.2, align: 'right' })
  cy += 7.6 * 1.3 + 2 * MM
  cy = draw(ix, cy, iw)
  cy += 2.2 * MM
  s.rect(MARGIN, top, CONTENT_W, cy - top, { stroke: C.line, lw: 0.75 })
  return cy
}

/**
 * A table. columns: [{ label, align, w }] (the first column takes the rest);
 * rows: [{ cells: [{ text, sub, color, bold, italic }], shade, muted }]; foot like a row.
 */
function table(s, x, y, width, { columns, rows, foot, size = 7.8, headSize = 6.4 }) {
  const fixed = columns.slice(1).reduce((t, c) => t + c.w, 0)
  const widths = [width - fixed, ...columns.slice(1).map((c) => c.w)]
  const lefts = widths.map((_, i) => x + widths.slice(0, i).reduce((t, w) => t + w, 0))
  const padX = 1 * MM
  // header
  const headLines = columns.map((c) => c.label.toUpperCase().split('\n'))
  const headH = Math.max(...headLines.map((l) => l.length)) * headSize * 1.25
  columns.forEach((c, i) => {
    const lines = headLines[i]
    lines.forEach((l, j) => {
      const ly = y + headH - (lines.length - j) * headSize * 1.25
      if (c.align === 'right') s.text(l, lefts[i] + widths[i] - padX, ly, { font: 'sansBold', size: headSize, color: C.muted, align: 'right' })
      else s.text(l, lefts[i] + padX, ly, { font: 'sansBold', size: headSize, color: C.muted })
    })
  })
  let cy = y + headH + 1 * MM
  s.line(x, cy, x + width, cy, { color: C.line })

  const drawRow = (row, isFoot) => {
    const padY = 1.1 * MM
    // wrap the first column if needed
    const first = row.cells[0]
    const firstFont = isFoot || first.bold ? 'sansBold' : 'sans'
    const nameLines = s.wrap(first.text, firstFont, size, widths[0] - 2 * padX)
    const hasSub = row.cells.some((c) => c.sub)
    const h = padY * 2 + nameLines.length * size * 1.25 + (hasSub ? 6.6 * 1.3 : 0)
    if (row.shade) s.rect(x, cy, width, h, { fill: C.shade, layer: 'bg' })
    if (isFoot) s.line(x, cy, x + width, cy, { color: C.muted })
    row.cells.forEach((cell, i) => {
      const font = isFoot || cell.bold ? 'sansBold' : 'sans'
      const color = cell.color || (row.muted ? C.muted : C.heading)
      const ty = cy + padY
      if (i === 0) {
        nameLines.forEach((l, j) => s.text(l, lefts[0] + padX, ty + j * size * 1.25, { font, size, color }))
        if (cell.sub) s.text(cell.sub, lefts[0] + padX, ty + nameLines.length * size * 1.25, { size: 6.6, color: C.muted })
      } else {
        const tx = columns[i].align === 'right' ? lefts[i] + widths[i] - padX : lefts[i] + padX
        s.text(cell.text, tx, ty, { font, size, color, align: columns[i].align === 'right' ? 'right' : 'left' })
        if (cell.sub) s.text(cell.sub, tx, ty + size * 1.25, { size: 6.6, color: C.muted, align: columns[i].align === 'right' ? 'right' : 'left' })
      }
    })
    cy += h
    if (!isFoot) s.line(x, cy, x + width, cy, { color: C.rowLine, lw: 0.6 })
  }
  rows.forEach((r) => drawRow(r, false))
  if (foot) drawRow(foot, true)
  return cy
}

function kpiTile(s, x, y, w, { label, value, valueColor, sub, fairs }) {
  const pad = { x: 3 * MM, y: 2.2 * MM }
  const iw = w - 2 * pad.x
  let cy = y + pad.y
  s.text(label.toUpperCase(), x + pad.x, cy, { size: 6.8, color: C.muted })
  cy += 6.8 * 1.35
  if (fairs) {
    for (const f of fairs) {
      const amount = euro(f.sales)
      const aw = s.width(amount, 'sans', 11)
      const nameLines = s.wrap(f.name, 'sans', 8, iw - aw - 2 * MM)
      nameLines.forEach((l, i) => s.text(l, x + pad.x, cy + 1.2 + i * 8 * 1.25, { size: 8, color: C.heading }))
      s.text(amount, x + pad.x + iw, cy, { size: 11, color: C.heading, align: 'right' })
      cy += Math.max(11 * 1.2, nameLines.length * 8 * 1.25) + 0.6 * MM
      s.line(x + pad.x, cy, x + pad.x + iw, cy, { color: C.dotted, lw: 0.5, dash: [1, 1.5] })
      cy += 0.6 * MM
    }
  } else {
    s.text(value, x + pad.x, cy, { size: 15, color: valueColor || C.heading })
    cy += 15 * 1.2
  }
  cy += s.para(sub, x + pad.x, cy, iw, { size: 7.2, lh: 1.35 })
  return cy + pad.y - y
}

function fairBlock(s, x, y, w, f, { heldEarlierNote, first }) {
  let cy = y
  if (!first) { s.line(x, cy, x + w, cy, { color: C.line }); cy += 2 * MM }
  s.text(f.name, x, cy, { font: 'sansBold', size: 8.6, color: C.heading })
  if (f.startDate) s.text(dateRange(f.startDate, f.endDate), x + s.width(f.name, 'sansBold', 8.6) + 1.5 * MM, cy + 1.3, { size: 7, color: C.muted })
  cy += 8.6 * 1.3 + 1.2 * MM
  const items = [
    ['Revenue', euro(f.sales)],
    ['LoveLab keeps', euro(f.net)],
    ['Commission owed to agents', cost(f.commission), C.cost],
    ['Orders', count(f.orders), null, f.agentOrders ? `(${count(f.agentOrders)} via agents)` : '(no agents)'],
    ['Clients', count(f.clients)],
    ['Average order', euro(f.avgOrder)],
    ['Biggest order', euro(f.biggestOrder)],
  ]
  const colW = (w - 4 * MM) / 2
  const rowH = 7.6 * 1.25 + 1.4 * MM
  items.forEach(([label, value, color, extra], i) => {
    const cx = x + (i % 2) * (colW + 4 * MM)
    const ry = cy + Math.floor(i / 2) * rowH
    s.text(label, cx, ry, { size: 7.6, color: C.muted })
    let right = cx + colW
    if (extra) {
      s.text(extra, right, ry + 1, { size: 6.6, color: C.muted, align: 'right' })
      right -= s.width(extra, 'sans', 6.6) + 1.2
    }
    s.text(value, right, ry, { font: 'sansBold', size: 7.6, color: color || C.heading, align: 'right' })
    s.line(cx, ry + 7.6 * 1.25 + 0.4 * MM, cx + colW, ry + 7.6 * 1.25 + 0.4 * MM, { color: C.dotted, lw: 0.5, dash: [1, 1.5] })
  })
  cy += Math.ceil(items.length / 2) * rowH
  if (heldEarlierNote) cy += 1.2 * MM + s.para(heldEarlierNote, x, cy + 1.2 * MM, w, { size: 6.8, color: C.amber, lh: 1.35 })
  return cy + 1.5 * MM
}

// ── The page ──────────────────────────────────────────────────────────

async function newDocument(report) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  pdf.setTitle(`LoveLab — ${report.monthLabel} sales report`)
  pdf.setAuthor('LoveLab')
  pdf.setCreator('LoveLab monthly sales report')
  const fonts = {
    sans: await pdf.embedFont(base64ToBytes(LIBERATION_SANS_REGULAR), { subset: true }),
    sansBold: await pdf.embedFont(base64ToBytes(LIBERATION_SANS_BOLD), { subset: true }),
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
  }
  return { pdf, fonts }
}

/**
 * @param {object} report  from buildReportData
 * @param {object} [o]
 * @param {Uint8Array} [o.logoPng]   LoveLab wordmark (public/email/logo.png)
 * @param {string}     [o.generatedAt]
 * @returns {Promise<Uint8Array>} the PDF bytes
 */
export async function renderReportPdf(report, opts = {}) {
  const { pdf, fonts } = await newDocument(report)
  const { s, H } = await layout(pdf, fonts, report, opts)
  const page = pdf.addPage([PAGE_W, H])
  replay(page, s, H)
  return pdf.save()
}

/** Every string the page shows, top to bottom — for tests and checks. */
export async function reportPdfText(report, opts = {}) {
  const { pdf, fonts } = await newDocument(report)
  const { s } = await layout(pdf, fonts, report, opts)
  return s.fg.filter((op) => op.t === 'text' || op.t === 'watermark').map((op) => op.s).join('\n')
}

async function layout(pdf, fonts, report, { logoPng, generatedAt = '' } = {}) {
  const s = new Surface(fonts)
  const k = report.kpis
  const monthShort = report.monthLabel.split(' ')[0]
  const salesWord = report.amountBasis === 'net_ex_vat' ? 'Net sales' : 'Sales'
  let y = 7 * MM

  // Header
  if (logoPng) {
    const img = await pdf.embedPng(logoPng)
    const h = 7 * MM
    s.image(img, MARGIN, y, (img.width / img.height) * h, h)
    y += h + 2 * MM
  }
  s.text(`${report.monthLabel} — sales report`, MARGIN, y, { font: 'serif', size: 16, color: C.plum })
  y += 16 * 1.2 + 1 * MM
  if (report.isSample) {
    const label = 'SAMPLE DATA — NOT REAL'
    const w = s.width(label, 'sansBold', 7.6) + 5 * MM
    s.rect(MARGIN, y, w, 7.6 * 1.3 + 2 * MM, { fill: C.amberBg, stroke: C.amberLine })
    s.text(label, MARGIN + 2.5 * MM, y + 1 * MM, { font: 'sansBold', size: 7.6, color: C.amber })
    y += 7.6 * 1.3 + 3.5 * MM
  }
  y += s.para(`${report.partial ? `Partial month · data to ${report.dataThrough} · ` : ''}Amounts ${AMOUNT_BASIS_LABEL[report.amountBasis] || ''}`, MARGIN, y, CONTENT_W, { size: 7.6, color: C.muted })
  y += 3 * MM
  s.line(MARGIN, y, MARGIN + CONTENT_W, y, { color: C.line })
  y += GAP

  // Headline figures, 2×2
  const vsPrev = k.salesChangePct === null
    ? `no ${report.prevMonthLabel.split(' ')[0]} sales to compare`
    : `${change(k.salesChangePct)} vs ${report.prevMonthLabel.split(' ')[0]} (${euro(k.salesPrev)})`
  const tiles = [
    { label: salesWord, value: euro(k.sales), sub: `${vsPrev} · ${count(k.orders)} orders` },
    { label: 'B2B / B2C', value: `${pct(k.b2bShare)} / ${pct(k.sales ? 100 - k.b2bShare : 0)}`, sub: `${euro(k.b2b)} B2B (${count(k.b2bOrders)}) · ${euro(k.b2c)} B2C (${count(k.b2cOrders)})` },
    {
      label: 'Agent commission · cost', value: cost(k.commissionEarned), valueColor: C.cost,
      sub: `LoveLab owes its agents this on ${monthShort} sales · ${k.commissionPaidOut ? `${cost(k.commissionPaidOut)} actually paid to agents in ${monthShort}` : `nothing paid to agents yet in ${monthShort}`}`,
    },
    k.topFair
      ? { label: `Fair revenue · ${monthShort}`, fairs: report.fairs, sub: 'each fair separately · details below' }
      : { label: 'Fairs', value: '—', sub: 'No fairs this month' },
  ]
  const tileW = (CONTENT_W - 2.4 * MM) / 2
  for (let r = 0; r < 2; r++) {
    // measure both, then draw both at the taller height
    const probe = new Surface(fonts)
    const hs = [0, 1].map((c) => kpiTile(probe, 0, 0, tileW, tiles[r * 2 + c]))
    const h = Math.max(...hs)
    ;[0, 1].forEach((c) => {
      const x = MARGIN + c * (tileW + 2.4 * MM)
      kpiTile(s, x, y, tileW, tiles[r * 2 + c])
      s.rect(x, y, tileW, h, { stroke: C.line })
    })
    y += h + 2.4 * MM
  }
  const pageNotes = report.notes.filter((n) => !n.startsWith('Partial month'))
  if (pageNotes.length) y += s.para(pageNotes.join(' · '), MARGIN, y, CONTENT_W, { font: 'sansBold', size: 7.6, color: C.amber }) + 1 * MM
  y += GAP - 2.4 * MM

  // Sales by month: chart + B2B / B2C / total per month
  y = card(s, y, 'Sales by month', (x, cy, w) => {
    cy += drawChart(s, stackedColumns(report.trend, { width: 340, height: 160, labelAll: true }), x, cy, w)
    if (!report.trend.length) return cy
    const t = report.trend.reduce((a, m) => ({ b2b: a.b2b + m.b2b, b2c: a.b2c + m.b2c, total: a.total + m.total }), { b2b: 0, b2c: 0, total: 0 })
    return table(s, x, cy + 2.5 * MM, w, {
      columns: [{ label: 'Month' }, { label: 'B2B', align: 'right', w: 26 * MM }, { label: 'B2C', align: 'right', w: 22 * MM }, { label: 'Total', align: 'right', w: 26 * MM }],
      rows: report.trend.map((m) => ({ shade: m.isReportMonth, cells: [{ text: `${m.label} ${m.year}` }, { text: euro(m.b2b) }, { text: euro(m.b2c) }, { text: euro(m.total), bold: true }] })),
      foot: { cells: [{ text: `Total ${report.trend.length} months` }, { text: euro(t.b2b) }, { text: euro(t.b2c) }, { text: euro(t.total) }] },
    })
  }, { legendRight: true })
  y += GAP

  // Sales by agent
  y = card(s, y, `Sales by agent · ${monthShort}`, (x, cy, w) => {
    cy += drawChart(s, horizontalBars(report.agentChart, { width: 340, height: 140 }), x, cy, w)
    if (report.agentChartRest) {
      const r = report.agentChartRest
      cy += 1.5 * MM + s.para(`+ ${r.count} more agent${r.count > 1 ? 's' : ''} · ${euro(r.value)} — full list in the table below`, x, cy + 1.5 * MM, w, { size: 6.6, color: C.muted })
    }
    return cy
  })
  y += GAP

  // B2B vs B2C
  y = card(s, y, 'B2B vs B2C', (x, cy, w) =>
    cy + drawChart(s, splitBars([{ label: monthShort, ...report.channelSplit.month }, { label: `${report.month.slice(0, 4)} to date`, ...report.channelSplit.ytd }], { width: 340 }), x, cy, w),
  { legendRight: true })
  y += GAP

  // Agents table
  y = card(s, y, `Agents · ${report.monthLabel}`, (x, cy, w) => {
    if (!report.agents.length) return cy + s.para('No agent activity this month.', x, cy, w, { color: C.muted })
    const t = report.agents.reduce((a, r) => ({ orders: a.orders + r.orders, sales: a.sales + r.sales, earned: a.earned + r.commissionEarned, paid: a.paid + r.commissionPaidOut }), { orders: 0, sales: 0, earned: 0, paid: 0 })
    cy = table(s, x, cy, w, {
      columns: [{ label: 'Agent' }, { label: 'Orders', align: 'right', w: 13 * MM }, { label: 'Sales', align: 'right', w: 18 * MM }, { label: 'Owed to\nagent', align: 'right', w: 17 * MM }, { label: 'Paid to\nagent', align: 'right', w: 15 * MM }],
      rows: report.agents.map((a) => ({
        muted: a.agentId === null,
        cells: [{ text: a.name, sub: `${pct(a.share)} of sales` }, { text: count(a.orders) }, { text: euro(a.sales) }, { text: cost(a.commissionEarned), color: C.cost }, { text: cost(a.commissionPaidOut), color: C.cost }],
      })),
      foot: { cells: [{ text: 'Total' }, { text: count(t.orders) }, { text: euro(t.sales) }, { text: cost(t.earned), color: C.cost }, { text: cost(t.paid), color: C.cost }] },
    })
    return cy + 1.5 * MM + s.para('Owed to agent = commission LoveLab owes on this month’s sales (a cost). Paid to agent = commission LoveLab actually paid this month (a cost).', x, cy + 1.5 * MM, w, { size: 6.6, color: C.muted })
  })
  y += GAP

  // Each fair this month, separately
  y = card(s, y, `Fairs · ${report.monthLabel}`, (x, cy, w) => {
    if (!report.fairs.length) return cy + s.para('No fairs this month.', x, cy, w, { color: C.muted })
    report.fairs.forEach((f, i) => {
      const heldEarlier = f.startDate && f.startDate.slice(0, 7) < report.month
      const note = heldEarlier
        ? `This fair was held ${dateRange(f.startDate, f.endDate)}. The figures above are the orders from it dated in ${report.monthLabel}; the fair’s total so far is ${euro(f.salesToDate)} from ${count(f.ordersToDate)} orders.`
        : f.salesToDate > f.sales + 0.005 ? `Fair total so far, all months: ${euro(f.salesToDate)} from ${count(f.ordersToDate)} orders.` : null
      cy = fairBlock(s, x, cy, w, f, { heldEarlierNote: note, first: i === 0 })
    })
    return cy
  })
  y += GAP

  // Every fair of the year
  y = card(s, y, `All fairs · ${report.month.slice(0, 4)} to date`, (x, cy, w) => {
    const fairs = report.fairsYear || []
    if (!fairs.length) return cy + s.para('No fair orders yet this year.', x, cy, w, { color: C.muted })
    const t = fairs.reduce((a, f) => ({ orders: a.orders + f.orders, sales: a.sales + f.sales, commission: a.commission + f.commission, net: a.net + f.net }), { orders: 0, sales: 0, commission: 0, net: 0 })
    return table(s, x, cy, w, {
      columns: [{ label: 'Fair' }, { label: 'Orders', align: 'right', w: 12 * MM }, { label: 'Revenue', align: 'right', w: 18 * MM }, { label: 'Owed to\nagents', align: 'right', w: 16 * MM }, { label: 'LoveLab\nkeeps', align: 'right', w: 18 * MM }],
      rows: fairs.map((f) => ({
        shade: report.fairs.some((m) => m.eventId === f.eventId),
        cells: [{ text: f.name, sub: `${f.startDate ? `${dateRange(f.startDate, f.endDate)} · ` : ''}${count(f.clients)} client${f.clients === 1 ? '' : 's'}` }, { text: count(f.orders) }, { text: euro(f.sales) }, { text: cost(f.commission), color: C.cost }, { text: euro(f.net), bold: true }],
      })),
      foot: { cells: [{ text: `Total ${report.month.slice(0, 4)}` }, { text: count(t.orders) }, { text: euro(t.sales) }, { text: cost(t.commission), color: C.cost }, { text: euro(t.net) }] },
    })
  }, { note: 'shaded = had orders this month' })
  y += GAP

  // Footer
  s.line(MARGIN, y, MARGIN + CONTENT_W, y, { color: C.line })
  y += 2 * MM
  y += s.para('Confirmed orders only: no drafts, quotes, deleted orders, samples, consignment or internal stock moves. An order belongs to the month of its order date (else the day it was entered). Commission is money LoveLab pays its agents, so it is shown as a cost (−): “owed” = due on this month’s sales, including bonuses, not necessarily paid yet; “paid” = actually transferred to agents this month. “LoveLab keeps” = fair revenue minus the agent commission on it (stand and travel costs are not recorded, so not deducted).', MARGIN, y, CONTENT_W, { size: 6.4, color: C.muted, lh: 1.45 })
  y += 1.2 * MM
  const source = report.isSample ? 'SAMPLE DATA — invented numbers, not LoveLab’s' : report.source === 'supabase' ? 'LoveLab database (live)' : report.source
  y += s.para(`Source: ${source}${generatedAt ? ` · Generated ${generatedAt}` : ''}`, MARGIN, y, CONTENT_W, { size: 6.4, color: C.muted })
  y += 6 * MM

  if (report.isSample) s.fg.push({ t: 'watermark', s: 'SAMPLE DATA — NOT REAL', x: PAGE_W * 0.22, size: 34 })

  return { s, H: y }
}
