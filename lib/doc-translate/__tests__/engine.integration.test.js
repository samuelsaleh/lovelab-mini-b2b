/**
 * @jest-environment node
 *
 * Real pipeline on a real LoveLab PDF with Python + PyMuPDF, and a fake Claude
 * (no API cost). Skipped unless PDF_ENGINE_INTEGRATION=1 and PDF_ENGINE_PYTHON
 * points at a Python with PyMuPDF installed.
 */
import { PDFDocument } from 'pdf-lib'
import { translateDocument } from '../engine'
import { translateUnits, shortenUnits } from '../translator'

const run = process.env.PDF_ENGINE_INTEGRATION === '1' ? describe : describe.skip

// Stand-in for Claude: swaps vowels for accented ones and, on the first pass,
// makes long paragraphs ~12% longer so the shorten loop has something to do.
const fake = (shorten) => async ({ messages }) => {
  const sent = JSON.parse(messages[0].content.split('\n\n')[1]).items
  return {
    text: JSON.stringify({
      items: sent.map((s) => {
        let t = s.text.replace(/[aeiou]/g, (c) => ({ a: 'à', e: 'é', i: 'î', o: 'ô', u: 'ü' }[c]))
        if (!shorten && !s.letter_spaced && s.text.length > 80) t += ' ' + 'encore'.repeat(1)
        if (shorten) t = t.slice(0, Math.floor(t.length * 0.9)).replace(/\s+\S*$/, '').replace(/\*\*/g, '')
        return { k: s.k, t }
      }),
    }),
  }
}

run('pipeline on a real PDF', () => {
  jest.setTimeout(120_000)
  it('translates the English brand presentation end to end', async () => {
    const file = { name: 'Brand.pdf', path: '/BRAND PRESENTATION DOCS/LoveLab_Brand_Presentation_General_EN.pdf' }
    const res = await translateDocument(
      { file, language: { code: 'fr', name: 'French' } },
      {
        translateUnits: (a) => translateUnits(a, { createMessage: fake(false) }),
        shortenUnits: (a) => shortenUnits(a, { createMessage: fake(true) }),
      },
    )
    expect(res.ok).toBe(true)
    expect(res.stats.pages).toBe(11)
    const doc = await PDFDocument.load(res.pdf)
    expect(doc.getPageCount()).toBe(11)
    expect(res.stats.units).toBeGreaterThan(150)
  })
})
