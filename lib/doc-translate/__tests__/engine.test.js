/**
 * @jest-environment node
 */
import { promises as fs } from 'node:fs'
import { translateDocument } from '../engine'

const file = { name: 'Brand.pdf', path: '/BRAND PRESENTATION DOCS/LoveLab_Brand_Presentation_General_EN.pdf' }
const fr = { code: 'fr', name: 'French' }

const extracted = {
  pages: [{ page: 0, units: [
    { id: 0, text: 'Who We Are', chars: 10, lines: 1, letter_spaced: false },
    { id: 1, text: 'THE BRAND', chars: 9, lines: 1, letter_spaced: true },
  ] }],
}

function makeRun({ flagsByCall = [] } = {}) {
  const calls = []
  const run = jest.fn(async (args) => {
    calls.push(args)
    if (args[0] === 'extract') return extracted
    await fs.writeFile(args[3], Buffer.from('%PDF-fake'))
    const flags = flagsByCall.shift() || []
    return { units: 2, flags }
  })
  return { run, calls }
}

describe('translateDocument', () => {
  it('extracts, translates, renders and returns the PDF', async () => {
    const { run, calls } = makeRun()
    const translate = jest.fn(async () => ({ map: new Map([['0:0', 'Qui sommes-nous'], ['0:1', 'LA MARQUE']]), failed: [] }))
    const res = await translateDocument({ file, language: fr }, { runPython: run, translateUnits: translate })
    expect(res.ok).toBe(true)
    expect(res.pdf.toString()).toBe('%PDF-fake')
    expect(res.stats).toEqual({ pages: 1, units: 2, shortened: 0 })
    expect(calls[0][0]).toBe('extract')
    expect(calls[0][1]).toMatch(/public\/BRAND PRESENTATION DOCS\/LoveLab_Brand_Presentation_General_EN\.pdf$/)
    expect(translate.mock.calls[0][0].items[1]).toMatchObject({ key: '0:1', letterSpaced: true })
    const trPath = calls[1][2]
    expect(trPath).toMatch(/translations\.json$/)
  })

  it('sends overflowing paragraphs back to be shortened, then re-renders', async () => {
    const { run, calls } = makeRun({ flagsByCall: [[{ page: 0, id: 0, kind: 'overflow', detail: '4 lines instead of 3' }], []] })
    const translate = jest.fn(async () => ({ map: new Map([['0:0', 'Une très longue traduction'], ['0:1', 'LA MARQUE']]), failed: [] }))
    const shorten = jest.fn(async () => new Map([['0:0', 'Qui sommes-nous']]))
    const res = await translateDocument({ file, language: fr }, { runPython: run, translateUnits: translate, shortenUnits: shorten })
    expect(res.ok).toBe(true)
    expect(shorten).toHaveBeenCalledTimes(1)
    expect(shorten.mock.calls[0][0].items[0]).toMatchObject({ key: '0:0', current: 'Une très longue traduction', maxChars: 10 })
    expect(calls.filter((c) => c[0] === 'render')).toHaveLength(2)
    expect(res.stats.shortened).toBe(1)
    expect(res.flags).toEqual([])
  })

  it('keeps unresolved overflow as a flag after two shortening rounds', async () => {
    const over = [{ page: 0, id: 0, kind: 'overflow', detail: 'x' }]
    const { run } = makeRun({ flagsByCall: [over, over, over] })
    const translate = jest.fn(async () => ({ map: new Map([['0:0', 'long']]), failed: [] }))
    const shorten = jest.fn(async () => new Map([['0:0', 'long2']]))
    const res = await translateDocument({ file, language: fr }, { runPython: run, translateUnits: translate, shortenUnits: shorten })
    expect(shorten).toHaveBeenCalledTimes(2)
    expect(res.flags.some((f) => f.kind === 'overflow')).toBe(true)
  })

  it('flags paragraphs Claude could not translate', async () => {
    const { run } = makeRun()
    const translate = jest.fn(async () => ({ map: new Map([['0:0', 'Qui sommes-nous']]), failed: ['0:1'] }))
    const res = await translateDocument({ file, language: fr }, { runPython: run, translateUnits: translate })
    expect(res.flags).toEqual([expect.objectContaining({ key: '0:1', kind: 'untranslated' })])
  })

  it('refuses a PDF with no text', async () => {
    const run = jest.fn(async () => ({ pages: [{ page: 0, units: [] }] }))
    const res = await translateDocument({ file, language: fr }, { runPython: run, translateUnits: jest.fn() })
    expect(res).toMatchObject({ ok: false, status: 422 })
  })

  it('reports 501 when Python or PyMuPDF is missing', async () => {
    const run = jest.fn(async () => { const e = new Error('No module named pymupdf'); e.unavailable = true; throw e })
    const res = await translateDocument({ file, language: fr }, { runPython: run, translateUnits: jest.fn() })
    expect(res).toMatchObject({ ok: false, status: 501 })
    expect(res.error).toMatch(/not available/)
  })

  it('rejects a path that escapes the public folder', async () => {
    const res = await translateDocument({ file: { path: '/../../etc/passwd' }, language: fr }, { runPython: jest.fn() })
    expect(res).toMatchObject({ ok: false, status: 400 })
  })
})
