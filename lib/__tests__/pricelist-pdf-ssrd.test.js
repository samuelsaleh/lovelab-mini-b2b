/**
 * @jest-environment node
 *
 * The printed 2026 / October PDFs must show the D VVS refonte (no RND,
 * In-house 0.50/0.70, IGI 1.00, B2B 200/300/400, B2C 600/900/1200).
 * 2025 stays on the old IGI-only row.
 */

const { execFileSync } = require('child_process')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const LISTS = path.join(ROOT, 'public', 'Price Lists')
const EXTRACT = path.join(ROOT, 'scripts', 'pdf-text.mjs')

function pdfText(name) {
  return execFileSync(process.execPath, [EXTRACT, path.join(LISTS, name)], {
    encoding: 'utf8',
    timeout: 20_000,
  })
}

function dVvsLines(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /D\s*VVS/i.test(l))
}

function hasEuro(text, n) {
  const re = new RegExp(`€\\s*${String(n).replace('.', '\\.')}|€\\s*${Number(n).toLocaleString('de-DE')}`)
  return re.test(text)
}

describe('printed pricelists — Shapy Sparkle D VVS', () => {
  let text2026
  let textOct
  let text2025

  beforeAll(() => {
    text2026 = pdfText('Pricelist_LoveLab_2026.pdf')
    textOct = pdfText('Pricelist_LoveLab_2026_October.pdf')
    text2025 = pdfText('Pricelist_LoveLab_2025.pdf')
  })

  test.each(['2026', 'October'])('%s lists the new D VVS name, certs and prices', (which) => {
    const text = which === '2026' ? text2026 : textOct
    const lines = dVvsLines(text)
    expect(lines.join('\n')).toMatch(/SHAPY SPARKLE D VVS/)
    expect(text).not.toMatch(/ROUND\s*\(\s*D\s*VVS\s*\)/i)

    const block = lines.join('\n')
    expect(block).toMatch(/INHOUSE/)
    expect(block).toMatch(/IGI/)
    expect(hasEuro(block, 200)).toBe(true)
    expect(hasEuro(block, 300)).toBe(true)
    expect(hasEuro(block, 400)).toBe(true)
    expect(hasEuro(block, 600)).toBe(true)
    expect(hasEuro(block, 900)).toBe(true)
    expect(hasEuro(block, 1200) || hasEuro(text, '1.200')).toBe(true)
    expect(block).not.toMatch(/€\s*220/)
    expect(block).not.toMatch(/€\s*305/)
    expect(block).not.toMatch(/€\s*550/)
    expect(block).not.toMatch(/€\s*650/)
    expect(block).not.toMatch(/€\s*850/)
  })

  test('2025 PDF keeps the old IGI-only D VVS row', () => {
    expect(text2025).toMatch(/SHAPY SPARKLE ROUND\s*\(\s*D VVS\s*\)\s*IGI/i)
    const lines = dVvsLines(text2025).join('\n')
    expect(hasEuro(lines, 180)).toBe(true)
    expect(hasEuro(lines, 200)).toBe(true)
    expect(hasEuro(lines, 285)).toBe(true)
  })
})
