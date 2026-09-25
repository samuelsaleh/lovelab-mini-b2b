/**
 * Tiny static SVG charts for the printed report. No library: the PDF is a
 * still page, so there is no hover layer — every value a chart leaves
 * unlabelled is in the tables beside it.
 *
 * Series colours were run through the dataviz palette validator (light
 * surface): plum and gold pass lightness, chroma, colour-blind separation
 * (ΔE 22.7) and 3:1 contrast. The brand's own #5D3A5E / #C9A665 do not — too
 * dark / too faint as chart fills — so these are their chart-safe steps.
 */

import { escapeHtml, euroShort } from './format.js'

export const CHART = {
  b2b: '#7E4A80',
  b2c: '#B08028',
  ink: '#3b2f3f',
  muted: '#8A6A7D',
  grid: '#EAE3EC',
  surface: '#ffffff',
}

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"
const GAP = 2 // surface gap between touching marks
const R = 3 // rounded data-end

/** A clean axis maximum and step: 0 / 20k / 40k … */
export function niceScale(max, ticks = 4) {
  if (!(max > 0)) return { max: 1, step: 1 }
  const raw = max / ticks
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)
  return { max: step * Math.ceil(max / step), step }
}

/** A bar rounded only at its data end (top for columns, right for bars). */
function roundedEnd(x, y, w, h, end) {
  const r = Math.min(R, end === 'top' ? h : w, end === 'top' ? w / 2 : h / 2)
  if (r <= 0 || w <= 0 || h <= 0) return ''
  if (end === 'top') {
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
  }
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`
}

const text = (x, y, s, { size = 8, fill = CHART.muted, anchor = 'start', weight = 400 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${escapeHtml(s)}</text>`

/**
 * Stacked columns, B2B at the base, B2C on top. The report month gets its
 * value on the cap and a bold axis label; the rest are read off the axis.
 */
export function stackedColumns(trend, { width = 300, height = 150, labelAll = false } = {}) {
  const pad = { top: 14, right: 4, bottom: 26, left: 34 }
  const w = width - pad.left - pad.right
  const h = height - pad.top - pad.bottom
  const { max, step } = niceScale(Math.max(0, ...trend.map((t) => t.total)))
  const y = (v) => pad.top + h - (v / max) * h
  const band = trend.length ? w / trend.length : w
  const colW = Math.min(18, band * 0.62)

  const parts = []
  for (let v = 0; v <= max + 1e-9; v += step) {
    parts.push(`<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(v)}" y2="${y(v)}" stroke="${CHART.grid}" stroke-width="1"/>`)
    parts.push(text(pad.left - 4, y(v) + 3, euroShort(v), { anchor: 'end', size: 7 }))
  }

  trend.forEach((t, i) => {
    const x = pad.left + i * band + (band - colW) / 2
    const b2bH = (t.b2b / max) * h
    const b2cH = (t.b2c / max) * h
    const base = pad.top + h
    if (t.b2c > 0 && t.b2b > 0) {
      // B2B square at the baseline, B2C carries the rounded end, 2px gap between.
      parts.push(`<rect x="${x}" y="${base - b2bH}" width="${colW}" height="${b2bH}" fill="${CHART.b2b}"/>`)
      const segH = Math.max(0, b2cH - GAP)
      parts.push(`<path d="${roundedEnd(x, base - b2bH - GAP - segH, colW, segH, 'top')}" fill="${CHART.b2c}"/>`)
    } else if (t.b2b > 0) {
      parts.push(`<path d="${roundedEnd(x, base - b2bH, colW, b2bH, 'top')}" fill="${CHART.b2b}"/>`)
    } else if (t.b2c > 0) {
      parts.push(`<path d="${roundedEnd(x, base - b2cH, colW, b2cH, 'top')}" fill="${CHART.b2c}"/>`)
    }
    const cx = x + colW / 2
    const showYear = i === 0 || t.label === 'Jan'
    parts.push(text(cx, base + 10, t.label, { anchor: 'middle', size: 7, fill: t.isReportMonth ? CHART.ink : CHART.muted, weight: t.isReportMonth ? 700 : 400 }))
    if (showYear) parts.push(text(cx, base + 19, t.year, { anchor: 'middle', size: 6.5 }))
    // Every month's total on its cap when asked (Rafi wants the figures on
    // the chart); otherwise only the report month, as a highlight.
    if (t.total > 0 && (labelAll || t.isReportMonth)) {
      parts.push(text(cx, y(t.total) - 4, euroShort(t.total), { anchor: 'middle', size: t.isReportMonth ? 7.5 : 6.8, fill: t.isReportMonth ? CHART.ink : CHART.muted, weight: t.isReportMonth ? 700 : 400 }))
    }
  })
  parts.push(`<line x1="${pad.left}" x2="${width - pad.right}" y1="${pad.top + h}" y2="${pad.top + h}" stroke="${CHART.muted}" stroke-width="1"/>`)

  return svg(width, height, parts, 'Sales by month, B2B and B2C stacked')
}

/**
 * Rough rendered width of a label in Helvetica. SVG text can't be measured
 * before printing, and a label wider than its gutter runs off the left edge
 * of a right-anchored column ("ILAS WHOLESALE FRA…"), so fit it by estimate.
 */
export function fitLabel(label, maxWidth, fontSize) {
  const width = (str) => [...str].reduce((w, ch) => w + (/[A-Z0-9MW]/.test(ch) ? 0.68 : /[ilj.,'’ ]/.test(ch) ? 0.3 : 0.53) * fontSize, 0)
  if (width(label) <= maxWidth) return label
  let out = label
  while (out.length > 1 && width(`${out}…`) > maxWidth) out = out.slice(0, -1)
  return `${out.trimEnd()}…`
}

/** One series of horizontal bars, value at each bar's tip. */
export function horizontalBars(items, { width = 300, height = 150, color = CHART.b2b } = {}) {
  if (!items.length) {
    return svg(width, height, [text(width / 2, height / 2, 'No agent sales this month', { anchor: 'middle', size: 9 })], 'No agent sales')
  }
  const labelW = 112
  const valueW = 38
  const rowH = Math.min(16, height / items.length)
  const barH = Math.min(10, rowH - GAP)
  const max = Math.max(...items.map((i) => i.value)) || 1
  const w = width - labelW - valueW
  const parts = []
  items.forEach((it, i) => {
    const y0 = i * rowH + (rowH - barH) / 2
    const bw = Math.max(1, (it.value / max) * w)
    const label = fitLabel(it.name, labelW - 10, 7.5)
    parts.push(text(labelW - 6, y0 + barH - 1.5, label, { anchor: 'end', size: 7.5, fill: CHART.ink }))
    parts.push(`<path d="${roundedEnd(labelW, y0, bw, barH, 'right')}" fill="${color}"/>`)
    parts.push(text(labelW + bw + 4, y0 + barH - 1.5, euroShort(it.value), { size: 7.5, fill: CHART.ink }))
  })
  return svg(width, Math.ceil(items.length * rowH), parts, 'Sales by agent')
}

/** Two 100% bars (this month, year to date), B2B | gap | B2C, % inside when it fits. */
export function splitBars(rows, { width = 300, barH = 18 } = {}) {
  const labelW = 70
  const w = width - labelW
  const rowH = barH + 22
  const parts = []
  rows.forEach((r, i) => {
    const total = r.b2b + r.b2c
    const y0 = i * rowH + 4
    parts.push(text(0, y0 + barH / 2 + 3, r.label, { size: 8, fill: CHART.ink, weight: 600 }))
    if (!total) {
      parts.push(`<rect x="${labelW}" y="${y0}" width="${w}" height="${barH}" fill="${CHART.grid}" rx="${R}"/>`)
      parts.push(text(labelW + w / 2, y0 + barH / 2 + 3, 'No sales', { anchor: 'middle', size: 7.5 }))
      return
    }
    const bw = (r.b2b / total) * w
    const cw = w - bw
    const b2bPct = Math.round((r.b2b / total) * 100)
    if (bw > 0) parts.push(`<rect x="${labelW}" y="${y0}" width="${Math.max(0, bw - (cw > 0 ? GAP / 2 : 0))}" height="${barH}" fill="${CHART.b2b}" rx="${R}"/>`)
    if (cw > 0) parts.push(`<rect x="${labelW + bw + (bw > 0 ? GAP / 2 : 0)}" y="${y0}" width="${Math.max(0, cw - (bw > 0 ? GAP / 2 : 0))}" height="${barH}" fill="${CHART.b2c}" rx="${R}"/>`)
    // Inside labels only where the text fits; otherwise the legend line below carries it.
    if (bw > 34) parts.push(text(labelW + 6, y0 + barH / 2 + 3, `${b2bPct}%`, { size: 8, fill: '#ffffff', weight: 700 }))
    if (cw > 34) parts.push(text(labelW + w - 6, y0 + barH / 2 + 3, `${100 - b2bPct}%`, { size: 8, fill: '#ffffff', weight: 700, anchor: 'end' }))
    parts.push(text(labelW, y0 + barH + 11, `B2B ${euroShort(r.b2b)}`, { size: 7.5, fill: CHART.ink }))
    parts.push(text(labelW + w, y0 + barH + 11, `B2C ${euroShort(r.b2c)}`, { size: 7.5, fill: CHART.ink, anchor: 'end' }))
  })
  return svg(width, rows.length * rowH, parts, 'B2B versus B2C share')
}

function svg(width, height, parts, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}"><title>${escapeHtml(title)}</title>${parts.join('')}</svg>`
}
