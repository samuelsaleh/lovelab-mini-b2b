/**
 * IGI's spreadsheet, read into lib/igi/seed.json.
 *
 * Michael keeps one sheet: a row per certificate model, a column per day he
 * handed certificates over, a totals row at the bottom, USED and REST at the
 * right. The seed's own comment says "regenerate figures only from a newer
 * source file — do not hand-edit them", and until 16 Sept 2026 nothing in the
 * repo could do that: the first seed was built by hand and the rule was a
 * promise. This is the rule kept.
 *
 * What comes from the sheet: the figures. Quantities ordered, and every
 * movement column — which serial, how many, on what day.
 *
 * What comes from the previous seed, by serial: everything LoveLab curated.
 * The model's own name (IGI's file says "HALO", LoveLab say "Multi
 * Moonlight"), its spec, its state, its place in the list, and the three
 * models still waiting for a serial, which IGI's sheet has no row for.
 *
 * Two things the sheet does that this has to understand:
 *
 *  - Nine columns from June 16 to July 28 are blank on every row but carry a
 *    figure in the totals row. Those are days IGI handed certificates over
 *    and nobody wrote down which. They become movements with a total and no
 *    lines, exactly as the first seed recorded them, so the pool arithmetic
 *    still comes out — and so the gap stays visible instead of vanishing.
 *
 *  - Some column headers are dates typed as "16/06" that Excel read as
 *    2016-06-01. They are kept as they are, flagged date_suspect, because
 *    inventing a date would be worse than showing the odd one.
 *
 * Pure: takes cells, returns a seed and a list of warnings. The script in
 * scripts/build-igi-seed.mjs does the file reading.
 */

import { formatModelName } from './modelName.js'

/** 1-based columns in Michael's sheet. */
export const COL = {
  COLLECTION: 3, STONES: 4, CARAT: 5, SHAPE: 6, QTY: 7,
  SERIAL: 8, SERIAL_FULL: 9, FIRST_DATE: 15,
}

const SERIAL = /^[A-Z]{2,6}\d{3,8}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function num(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Carats arrive as 0.30000000000000004; two decimals is what a carat is. */
function carat(value) {
  const n = num(value)
  return n === null ? null : Math.round(n * 100) / 100
}

/** "RD", "ROUND", "Round" are one shape. Kept as the seed writes it. */
export function normaliseShape(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const upper = s.toUpperCase()
  if (upper === 'RD') return 'Round'
  return upper[0] + upper.slice(1).toLowerCase()
}

/** A row is a model when it carries a serial. */
function isModelRow(row) {
  return SERIAL.test(String(row[COL.SERIAL] ?? '').trim())
}

/**
 * The date columns: a contiguous run from FIRST_DATE of headers that are
 * dates. USED and REST come after a gap, so the run stops on its own.
 */
export function dateColumns(header) {
  const cols = []
  for (let c = COL.FIRST_DATE; c < header.length; c++) {
    const h = header[c]
    if (typeof h !== 'string' || !ISO_DATE.test(h)) break
    cols.push(c)
  }
  return cols
}

/**
 * The totals row: the first row without a serial that carries a number in at
 * least three date columns. It is where the nine unattributed days live.
 */
export function findTotalsRow(rows, dateCols) {
  return rows.find((row) => !isModelRow(row)
    && dateCols.filter((c) => num(row[c]) !== null).length >= 3) || null
}

/** A header date is suspect when its year is not the year the sheet is about. */
export function isSuspectDate(iso, year) {
  return !iso.startsWith(`${year}-`)
}

/**
 * Build the seed.
 *
 * @param {object} o
 * @param {Array}  o.header   1-based array of header cells (index 0 unused)
 * @param {Array}  o.rows     rows as {colIndex: value}
 * @param {object} o.previous the seed being replaced — names, states, specs,
 *                            descriptions and the awaiting models come from it
 * @param {number} [o.fee]    the per-certificate fee from the "fee" sheet
 * @param {string} [o.source] file name, for the comment
 * @returns {{ seed: object, warnings: string[] }}
 */
export function buildSeed({ header, rows, previous, fee, source = "IGI's file" }) {
  const warnings = []
  const dateCols = dateColumns(header)
  if (!dateCols.length) throw new Error('No date columns found from column O — is this the models sheet?')

  const usedCol = header.findIndex((h) => String(h ?? '').trim().toUpperCase() === 'USED')
  const modelRows = rows.filter(isModelRow)
  const totals = findTotalsRow(rows, dateCols)
  if (!totals) warnings.push('No totals row found: columns with no per-model figures cannot be read as unattributed.')

  // The year the sheet is about: the one most headers carry.
  const years = dateCols.map((c) => header[c].slice(0, 4))
  const year = [...new Set(years)].sort((a, b) => years.filter((y) => y === b).length - years.filter((y) => y === a).length)[0]
  const goodDates = dateCols.map((c) => header[c]).filter((d) => !isSuspectDate(d, year))
  const asOf = goodDates.sort().at(-1)

  const prevBySerial = new Map((previous?.models || []).filter((m) => m.serial).map((m) => [m.serial, m]))
  const prevBatchDate = new Map((previous?.batches || []).map((b) => [b.serial, b.batch_date]))
  let nextSort = Math.max(0, ...(previous?.models || []).map((m) => m.sort_order || 0).filter((s) => s < 1000)) + 1

  // ── Models ────────────────────────────────────────────────────────────────
  const models = []
  for (const row of modelRows) {
    const serial = String(row[COL.SERIAL]).trim()
    const collection = String(row[COL.COLLECTION] ?? '').trim()
    const prev = prevBySerial.get(serial)
    const qty = num(row[COL.QTY])
    if (prev) {
      // A reserved serial is one IGI numbered but never produced. The day
      // IGI's file gives it a quantity, they have produced it (Sam, 16 Sept
      // 2026, on the fifteen that went from nothing to 500): it is in use,
      // and gets its opening run like every other model.
      const produced = prev.state === 'reserved' && qty ? 'in_use' : prev.state
      models.push({
        ...prev,
        serial_full: String(row[COL.SERIAL_FULL] ?? prev.serial_full ?? '').trim() || prev.serial_full,
        igi_name: collection || prev.igi_name,
        stones: String(row[COL.STONES] ?? prev.stones).trim(),
        carat: carat(row[COL.CARAT]) ?? prev.carat,
        state: produced,
        qty_ordered: qty,
      })
      if (produced !== prev.state) {
        warnings.push(`${serial} ${prev.name}: reserved serial now carries ${qty} — produced by IGI, now in use. Name it on the Models screen.`)
      } else if (prev.qty_ordered !== qty) {
        warnings.push(`${serial} ${prev.name}: quantity ordered ${prev.qty_ordered ?? 'none'} → ${qty ?? 'none'}`)
      }
    } else {
      const shape = normaliseShape(row[COL.SHAPE])
      const base = formatModelName(collection)
      // Shapy Shine and Matchy Fancy carry the shape in the name (the seed's
      // fourth naming rule), so a row can be told apart without the spec.
      const name = /^(Shapy Shine|Matchy Fancy)$/.test(base) ? `${base} ${shape}` : base
      models.push({
        serial, serial_full: String(row[COL.SERIAL_FULL] ?? '').trim() || null,
        name: name || serial, igi_name: collection || null,
        stones: String(row[COL.STONES] ?? '').trim(), carat: carat(row[COL.CARAT]),
        shape, spec: null, state: 'in_use', qty_ordered: qty, sort_order: nextSort++,
      })
      warnings.push(`${serial}: new in the sheet, named "${name}" from "${collection}" — check the name`)
    }
  }
  const seen = new Set(models.map((m) => m.serial))
  for (const m of prevBySerial.values()) {
    if (!seen.has(m.serial)) warnings.push(`${m.serial} ${m.name}: in the previous seed but not in the sheet — kept out`)
  }
  // Models with no row in IGI's sheet: the ones still waiting for a serial.
  for (const m of (previous?.models || []).filter((x) => !x.serial)) models.push({ ...m })

  // ── Movements ─────────────────────────────────────────────────────────────
  const visits = []
  let visitNo = 0
  for (const c of dateCols) {
    const date = header[c]
    const lines = modelRows
      .map((row) => ({ serial: String(row[COL.SERIAL]).trim(), qty: num(row[c]) }))
      .filter((l) => l.qty !== null && l.qty !== 0)
    const total = totals ? num(totals[c]) : null
    if (!lines.length && total === null) {
      warnings.push(`${date}: empty column, skipped`)
      continue
    }
    visitNo += 1
    const lineSum = lines.reduce((t, l) => t + l.qty, 0)
    if (lines.length && total !== null && total !== lineSum) {
      warnings.push(`${date}: the totals row says ${total}, the rows add up to ${lineSum}`)
    }
    visits.push({
      visit_no: visitNo,
      visit_date: date,
      status: 'closed',
      date_suspect: isSuspectDate(date, year),
      unattributed_total: lines.length ? null : total,
      lines,
    })
  }

  // ── USED cross-check: the sheet's own arithmetic against ours ────────────
  if (usedCol > 0) {
    for (const row of modelRows) {
      const used = num(row[usedCol])
      if (used === null) continue
      const ours = dateCols.reduce((t, c) => t + (num(row[c]) || 0), 0)
      if (used !== ours) warnings.push(`${String(row[COL.SERIAL]).trim()}: USED says ${used}, the columns add up to ${ours}`)
    }
  }

  // ── Batches: the commissioned run, one per model in use ─────────────────
  const batches = models
    .filter((m) => m.serial && m.state === 'in_use' && m.qty_ordered)
    .map((m) => ({ serial: m.serial, qty: m.qty_ordered, batch_date: prevBatchDate.get(m.serial) || asOf, reference: 'initial order' }))

  const seed = {
    _comment: `Opening balances for the LoveLab x IGI certificate module, taken from ${source} as of ${asOf}. `
      + 'Regenerate with scripts/build-igi-seed.mjs from a newer source file — do not hand-edit the figures. '
      + "Model names are LoveLab's own (Sam, 11 Sept 2026: digits not words, each word capitalised, products separated by \" / \", "
      + 'shape in the name for Shapy Shine and Matchy Fancy); igi_name keeps what IGI\'s file called it. '
      + 'Names, specs, states and the models awaiting a serial are carried over from the previous seed by serial.',
    as_of: asOf,
    fee_eur: fee ?? previous?.fee_eur ?? null,
    models,
    descriptions: (previous?.descriptions || []).map((d) => ({ ...d })),
    visits,
    batches,
  }
  return { seed, warnings }
}

/** The figures the importer reconciles against, computed from a seed. */
export function expectedFigures(seed) {
  const attributed = seed.visits.reduce((t, v) => t + v.lines.reduce((x, l) => x + l.qty, 0), 0)
  const unattributed = seed.visits.reduce((t, v) => t + (v.unattributed_total || 0), 0)
  const ordered = seed.batches.reduce((t, b) => t + b.qty, 0)
  return {
    'models in use': seed.models.filter((m) => m.state === 'in_use').length,
    'reserved serials': seed.models.filter((m) => m.state === 'reserved').length,
    'models awaiting a serial': seed.models.filter((m) => m.state === 'awaiting_serial').length,
    'certificates ordered': ordered,
    'issued with a model': attributed,
    'issued with no model': unattributed,
    'issued in total': attributed + unattributed,
    'unissued at IGI': ordered - attributed,
    movements: seed.visits.length,
    'descriptions classified': seed.descriptions.length,
    'descriptions linked to a model': seed.descriptions.filter((d) => d.serial).length,
  }
}
