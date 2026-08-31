/**
 * @jest-environment node
 *
 * The printed 2026 / October PDFs and lib/catalog.js must agree on the Shapy
 * families. Every Shapy row is generated from the catalog and looked up in the
 * text pdf-parse pulls off the PDF, so repricing one side without the other
 * fails here — the earlier version of this suite hard-coded the D VVS numbers
 * and so only caught drift on three of the thirteen rows.
 *
 * 2025 is the legacy list and stays on its old IGI-only D VVS row.
 */

const { execFileSync } = require('child_process')
const path = require('path')

const { COLLECTIONS, getPrice, getRetail } = require('../catalog')

const ROOT = path.join(__dirname, '..', '..')
const LISTS = path.join(ROOT, 'public', 'Price Lists')
const EXTRACT = path.join(ROOT, 'scripts', 'pdf-text.mjs')

// Printed label → [collection id, cert per carat index]. The Shapy rows are the
// only ones this suite owns; the rest of both lists is covered by
// catalog-prices-2026*.test.js against the same catalog.
const PRINTED_ROWS = [
  ['SHAPY SHINE FANCY IGI', 'SSF', ['igi', 'igi', 'igi']],
  ['SHAPY SPARKLE FANCY IGI', 'SSPF', ['igi', 'igi']],
  ['SHAPY SPARKLE ROUND (G/H VS) INHOUSE', 'SSRG', ['inhouse', 'inhouse', 'inhouse']],
  ['SHAPY SPARKLE D VVS INHOUSE', 'SSRD', ['inhouse', 'inhouse', null]],
  ['SHAPY SPARKLE D VVS IGI', 'SSRD', [null, null, 'igi']],
  ['SHAPY SHINE NECKLACE IGI', 'SSF_NECK', ['igi', 'igi', 'igi']],
  ['SHAPY SPARKLE NECKLACE IGI', 'SSPF_NECK', ['igi', 'igi']],
]

function pdfText(name) {
  return execFileSync(process.execPath, [EXTRACT, path.join(LISTS, name)], {
    encoding: 'utf8',
    timeout: 20_000,
  })
}

// The lists print carats the Belgian way and drop trailing zeros: 0.10 → "0,1",
// 1.00 → "1". Money is grouped with a dot: 1200 → "€1.200".
function printedCarat(carat) {
  return String(Number(carat)).replace('.', ',')
}

function printedMoney(amount) {
  return `€${Number(amount).toLocaleString('de-DE')}`
}

// Every printed row, as the catalog says it should read.
function expectedLines(year) {
  const lines = []
  for (const [label, id, certByCarat] of PRINTED_ROWS) {
    const col = COLLECTIONS.find((c) => c.id === id)
    if (!col) throw new Error(`no collection ${id}`)
    col.carats.forEach((carat, i) => {
      const cert = certByCarat[i]
      if (!cert) return
      lines.push([
        label,
        printedCarat(carat),
        printedMoney(getPrice(col, i, cert, year)),
        printedMoney(getRetail(col, i, cert, year)),
      ].join(' '))
    })
  }
  return lines
}

// Collapse the tabs/spacing the two lists use so rows compare as plain text.
function normalize(text) {
  return text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim())
}

describe('printed pricelists — Shapy families match the catalog', () => {
  const texts = {}

  beforeAll(() => {
    texts['2026'] = normalize(pdfText('Pricelist_LoveLab_2026.pdf'))
    texts['2026-10'] = normalize(pdfText('Pricelist_LoveLab_2026_October.pdf'))
  })

  test.each([
    ['Pricelist_LoveLab_2026.pdf', '2026'],
    ['Pricelist_LoveLab_2026_October.pdf', '2026-10'],
  ])('%s prints every Shapy row at its catalog price', (_file, year) => {
    const lines = texts[year]
    for (const expected of expectedLines(year)) {
      expect(lines).toContain(expected)
    }
  })

  test.each([
    ['Pricelist_LoveLab_2026.pdf', '2026'],
    ['Pricelist_LoveLab_2026_October.pdf', '2026-10'],
  ])('%s carries no superseded Shapy price', (_file, year) => {
    const shapy = texts[year].filter((l) => /^SHAPY/.test(l)).join('\n')
    // The D VVS refonte dropped the old "ROUND (D VVS)" wording…
    expect(shapy).not.toMatch(/ROUND\s*\(\s*D\s*VVS\s*\)/i)
    // …and these are the pre-Aug-2026 numbers, each replaced above. None may
    // survive anywhere in the Shapy block, in the text layer or otherwise.
    for (const stale of ['€240', '€325', '€125', '€165', '€225', '€290', '€360', '€850', '€288', '€390', '€1.020']) {
      expect(shapy).not.toContain(stale)
    }
  })

  test('2025 PDF keeps the old IGI-only D VVS row', () => {
    const text = pdfText('Pricelist_LoveLab_2025.pdf')
    expect(text).toMatch(/SHAPY SPARKLE ROUND\s*\(\s*D VVS\s*\)\s*IGI/i)
    const lines = normalize(text).filter((l) => /D\s*VVS/i.test(l)).join('\n')
    for (const amount of [180, 200, 285]) {
      expect(lines).toMatch(new RegExp(`€\\s*${amount}`))
    }
  })
})
