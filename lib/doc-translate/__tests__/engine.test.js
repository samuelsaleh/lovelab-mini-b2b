/**
 * @jest-environment node
 */
import { translateDocument, MAX_PDF_BYTES, MAX_PDF_PAGES } from '../engine'

const file = { name: 'Brand.pdf', path: '/BRAND PRESENTATION DOCS/LoveLab_Brand_Presentation_General_EN.pdf' }
const fr = { code: 'fr', name: 'French' }

const extracted = {
  pages: [{ page: 0, units: [
    { id: 0, text: 'Who We Are', chars: 10, lines: 1, letter_spaced: false },
    { id: 1, text: 'THE BRAND', chars: 9, lines: 1, letter_spaced: true },
  ] }],
}

function makePdf({ flagsByCall = [], pages = extracted } = {}) {
  const renders = []
  return {
    renders,
    pdf: {
      extractPdf: jest.fn(async () => pages),
      renderPdf: jest.fn(async (bytes, translations) => {
        renders.push({ ...translations })
        return { pdf: new TextEncoder().encode('%PDF-fake'), units: 2, flags: flagsByCall.shift() || [] }
      }),
    },
  }
}
const readFile = jest.fn(async () => Buffer.from('source-bytes'))

describe('translateDocument — limits', () => {
  it('refuses a PDF bigger than 25 MB before touching it', async () => {
    const { pdf } = makePdf()
    pdf.extractPdf = jest.fn()
    const big = jest.fn(async () => ({ length: MAX_PDF_BYTES + 1 }))
    const res = await translateDocument({ file, language: fr }, { pdf, readFile: big })
    expect(res).toMatchObject({ ok: false, status: 413 })
    expect(pdf.extractPdf).not.toHaveBeenCalled()
  })

  it('refuses a PDF with too many pages before spending anything on Claude', async () => {
    const { pdf } = makePdf()
    pdf.extractPdf = jest.fn(async () => ({ pages: Array.from({ length: MAX_PDF_PAGES + 1 }, (_, i) => ({ page: i, units: [{ id: 0, text: 'x', chars: 1 }] })) }))
    const translate = jest.fn()
    const res = await translateDocument({ file, language: fr }, { pdf, readFile, translateUnits: translate })
    expect(res).toMatchObject({ ok: false, status: 413 })
    expect(translate).not.toHaveBeenCalled()
  })
})

describe('translateDocument', () => {
  it('extracts, translates, renders and returns the PDF', async () => {
    const { pdf, renders } = makePdf()
    const translate = jest.fn(async () => ({ map: new Map([['0:0', 'Qui sommes-nous'], ['0:1', 'LA MARQUE']]), failed: [] }))
    const res = await translateDocument({ file, language: fr }, { pdf, readFile, translateUnits: translate })
    expect(res.ok).toBe(true)
    expect(res.pdf.toString()).toBe('%PDF-fake')
    expect(res.stats).toEqual({ pages: 1, units: 2, shortened: 0 })
    expect(readFile.mock.calls.at(-1)[0]).toMatch(/public\/BRAND PRESENTATION DOCS\/LoveLab_Brand_Presentation_General_EN\.pdf$/)
    expect(translate.mock.calls[0][0].items[1]).toMatchObject({ key: '0:1', letterSpaced: true })
    expect(renders[0]).toEqual({ '0:0': 'Qui sommes-nous', '0:1': 'LA MARQUE' })
  })

  it('sends overflowing paragraphs back to be shortened, then re-renders', async () => {
    const { pdf, renders } = makePdf({ flagsByCall: [[{ page: 0, id: 0, kind: 'overflow', detail: '4 lines instead of 3' }], []] })
    const translate = jest.fn(async () => ({ map: new Map([['0:0', 'Une très longue traduction'], ['0:1', 'LA MARQUE']]), failed: [] }))
    const shorten = jest.fn(async () => new Map([['0:0', 'Qui sommes-nous']]))
    const res = await translateDocument({ file, language: fr }, { pdf, readFile, translateUnits: translate, shortenUnits: shorten })
    expect(res.ok).toBe(true)
    expect(shorten).toHaveBeenCalledTimes(1)
    expect(shorten.mock.calls[0][0].items[0]).toMatchObject({ key: '0:0', current: 'Une très longue traduction', maxChars: 23 }) // 90% of the 26 chars that overflowed
    expect(renders).toHaveLength(2)
    expect(renders[1]['0:0']).toBe('Qui sommes-nous')
    expect(res.stats.shortened).toBe(1)
    expect(res.flags).toEqual([])
  })

  it('keeps unresolved overflow as a flag after two shortening rounds', async () => {
    const over = [{ page: 0, id: 0, kind: 'overflow', detail: 'x' }]
    const { pdf } = makePdf({ flagsByCall: [over, over, over] })
    const translate = jest.fn(async () => ({ map: new Map([['0:0', 'long']]), failed: [] }))
    const shorten = jest.fn(async () => new Map([['0:0', 'long2']]))
    const res = await translateDocument({ file, language: fr }, { pdf, readFile, translateUnits: translate, shortenUnits: shorten })
    expect(shorten).toHaveBeenCalledTimes(2)
    expect(res.flags.some((f) => f.kind === 'overflow' && f.key === '0:0')).toBe(true)
  })

  it('flags paragraphs Claude could not translate', async () => {
    const { pdf } = makePdf()
    const translate = jest.fn(async () => ({ map: new Map([['0:0', 'Qui sommes-nous']]), failed: ['0:1'] }))
    const res = await translateDocument({ file, language: fr }, { pdf, readFile, translateUnits: translate })
    expect(res.flags).toEqual([expect.objectContaining({ key: '0:1', kind: 'untranslated' })])
  })

  it('refuses a PDF with no text', async () => {
    const { pdf } = makePdf({ pages: { pages: [{ page: 0, units: [] }] } })
    const res = await translateDocument({ file, language: fr }, { pdf, readFile, translateUnits: jest.fn() })
    expect(res).toMatchObject({ ok: false, status: 422 })
  })

  it('reports a failure without leaking details', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const pdf = { extractPdf: jest.fn(async () => { throw new Error('wasm exploded at 0x1f') }), renderPdf: jest.fn() }
    const res = await translateDocument({ file, language: fr }, { pdf, readFile, translateUnits: jest.fn() })
    expect(res).toEqual({ ok: false, status: 500, error: 'Translation failed' })
  })

  it('rejects a path that escapes the public folder', async () => {
    const res = await translateDocument({ file: { path: '/../../etc/passwd' }, language: fr }, { pdf: makePdf().pdf, readFile })
    expect(res).toMatchObject({ ok: false, status: 400 })
  })
})
