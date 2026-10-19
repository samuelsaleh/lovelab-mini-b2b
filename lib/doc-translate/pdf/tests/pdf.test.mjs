// Run with: npm run test:pdf   (node:test: MuPDF is ESM + WASM, which jest cannot load)
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import * as mupdf from 'mupdf'
import { extractPdf, renderPdf } from '../index.mjs'
import { fontKey, FONT_DIR } from '../fonts.mjs'

const PUBLIC = path.join(process.cwd(), 'public')

async function fixture() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([300, 300])
  const f = await doc.embedFont(StandardFonts.Helvetica)
  page.drawRectangle({ x: 20, y: 10, width: 260, height: 140, color: rgb(0.8, 0.2, 0.2) }) // stands in for a photo
  page.drawText('Hello world', { x: 20, y: 260, size: 16, font: f })
  page.drawText('Every piece begins with', { x: 20, y: 230, size: 10, font: f })
  page.drawText('a spark and a story.', { x: 20, y: 215, size: 10, font: f })
  page.drawText('42', { x: 20, y: 180, size: 10, font: f })
  return doc.save()
}

const textOf = (bytes) => {
  const d = mupdf.Document.openDocument(bytes, 'application/pdf')
  return d.loadPage(0).toStructuredText().asText()
}
const pixelAt = (bytes, x, y) => {
  const d = mupdf.Document.openDocument(bytes, 'application/pdf')
  const pm = d.loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false)
  const px = Uint8Array.from(pm.getPixels())
  const i = (y * pm.getWidth() + x) * pm.getNumberOfComponents()
  return [px[i], px[i + 1], px[i + 2]]
}

test('extract groups lines into paragraphs and skips numbers', async () => {
  const { pages } = await extractPdf(await fixture())
  const texts = pages[0].units.map((u) => u.text)
  assert.ok(texts.includes('Hello world'))
  assert.ok(texts.includes('Every piece begins with a spark and a story.'))
  assert.ok(!texts.includes('42'))
})

test('render replaces the text and keeps the graphics', async () => {
  const src = await fixture()
  const { pages } = await extractPdf(src)
  const id = (t) => pages[0].units.find((u) => u.text === t).id
  const tr = { [`0:${id('Hello world')}`]: 'Bonjour le monde', [`0:${id('Every piece begins with a spark and a story.')}`]: "Chaque pièce naît d'une étincelle." }
  const out = await renderPdf(src, tr)
  const text = textOf(out.pdf)
  assert.match(text, /Bonjour le monde/)
  assert.match(text, /Chaque pièce/)
  assert.doesNotMatch(text, /Hello world/)
  assert.match(text, /42/)
  assert.deepEqual(out.flags, [])
  assert.deepEqual(pixelAt(out.pdf, 150, 220), [204, 51, 51]) // the filled box survived
})

test('a paragraph that cannot fit even widened and smaller is flagged', async () => {
  const src = await fixture()
  const { pages } = await extractPdf(src)
  const u = pages[0].units.find((x) => x.text.startsWith('Every'))
  const long = 'Chaque pièce commence par une étincelle, une histoire, un moment, un lien, une émotion, une promesse. '.repeat(8)
  const out = await renderPdf(src, { [`0:${u.id}`]: long })
  assert.ok(out.flags.some((f) => f.kind === 'overflow'))
})

test('a somewhat longer translation grows into free space instead of being flagged', async () => {
  const src = await fixture()
  const { pages } = await extractPdf(src)
  const u = pages[0].units.find((x) => x.text.startsWith('Every'))
  const out = await renderPdf(src, { [`0:${u.id}`]: 'Chaque pièce commence par une étincelle, une histoire, un moment, un lien, une émotion, une promesse.' })
  assert.ok(!out.flags.some((f) => f.kind === 'overflow'))
  assert.match(textOf(out.pdf), /une promesse/)
})

test('units without a translation are left alone', async () => {
  const out = await renderPdf(await fixture(), {})
  assert.equal(out.units, 0)
  assert.match(textOf(out.pdf), /Hello world/)
})

test('font names map to the bundled fonts', () => {
  assert.equal(fontKey('Montserrat-Bold'), 'Montserrat-700')
  assert.equal(fontKey('Montserrat-Semi-Bold'), 'Montserrat-600')
  assert.equal(fontKey('Cormorant-Garamond-Italic'), 'Cormorant-400i')
  assert.equal(fontKey('PlayfairDisplay-Bold'), 'Playfair-700')
  assert.equal(fontKey('HelveticaLTPro-Bold'), 'Arimo-700')
  assert.equal(fontKey('Whatever'), 'Arimo-400')
})

test('bundled fonts cover French, German, Greek and Cyrillic', () => {
  const has = (key, chars) => {
    const f = new mupdf.Font(key, fs.readFileSync(path.join(FONT_DIR, `${key}.ttf`)))
    return [...chars].every((c) => f.encodeCharacter(c.codePointAt(0)) !== 0)
  }
  for (const k of ['Montserrat-400', 'Arimo-400', 'Inter-400', 'Playfair-700', 'Cormorant-400']) assert.ok(has(k, 'éèçàüßñœ'), k)
  assert.ok(has('Arimo-400', 'αβγΩ'))
  assert.ok(has('Montserrat-400', 'ДЖЯ'))
})

// --- real LoveLab documents: text rows may change, nothing else ---

function pixmaps(bytes, dpi = 100) {
  const d = mupdf.Document.openDocument(bytes, 'application/pdf')
  const out = []
  for (let i = 0; i < d.countPages(); i += 1) {
    const p = d.loadPage(i)
    const pm = p.toPixmap(mupdf.Matrix.scale(dpi / 72, dpi / 72), mupdf.ColorSpace.DeviceRGB, false)
    const rows = new Uint8Array(pm.getHeight())
    p.toStructuredText().walk({
      beginLine(b) { for (let y = Math.max(0, Math.floor(b[1] * dpi / 72) - 5); y < Math.min(rows.length, Math.ceil(b[3] * dpi / 72) + 5); y += 1) rows[y] = 1 },
    })
    out.push({ px: Uint8Array.from(pm.getPixels()), // copy: the WASM heap view detaches when memory grows
       w: pm.getWidth(), h: pm.getHeight(), n: pm.getNumberOfComponents(), rows })
  }
  return out
}

// stand-in for Claude: accents instead of vowels, same length
const pseudo = (pages) => {
  const tr = {}
  for (const p of pages) for (const u of p.units) tr[`${p.page}:${u.id}`] = u.text.replace(/[aeiou]/g, (c) => ({ a: 'à', e: 'é', i: 'î', o: 'ô', u: 'ü' }[c]))
  return tr
}

for (const [name, rel, minUnits, nPages] of [
  ['brand presentation', 'BRAND PRESENTATION DOCS/LoveLab_Brand_Presentation_General_EN.pdf', 150, 11],
  ['catalogue', 'catalogues/English/Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf', 150, 24],
]) {
  test(`real PDF (${name}): only the text rows change`, { timeout: 120_000, skip: !fs.existsSync(path.join(PUBLIC, rel)) }, async () => {
    const src = fs.readFileSync(path.join(PUBLIC, rel))
    const ex = await extractPdf(src)
    assert.equal(ex.pages.length, nPages)
    assert.ok(ex.pages.reduce((a, p) => a + p.units.length, 0) > minUnits)
    const out = await renderPdf(src, pseudo(ex.pages))
    const A = pixmaps(src)
    const B = pixmaps(out.pdf)
    assert.equal(B.length, nPages)
    let outside = 0
    A.forEach((a, i) => {
      const b = B[i]
      for (let y = 0; y < a.h; y += 1) {
        if (a.rows[y] || b.rows[y]) continue
        for (let k = y * a.w * a.n; k < (y + 1) * a.w * a.n; k += 1) if (Math.abs(a.px[k] - b.px[k]) > 8) { outside += 1; break }
      }
    })
    assert.equal(outside, 0, 'pixel rows changed outside the text')
  })
}

const lineBoxes = (bytes) => {
  const out = []
  mupdf.Document.openDocument(bytes, 'application/pdf').loadPage(0).toStructuredText().walk({
    beginLine(bbox) { out.push({ bbox: [...bbox], text: '' }) },
    onChar(c) { out[out.length - 1].text += c },
  })
  return out
}

test('rotated text (a stamp) is neither extracted nor erased', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([300, 300])
  const f = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('Hello world', { x: 20, y: 260, size: 16, font: f })
  page.drawText('ELECTRONIC COPY', { x: 60, y: 100, size: 20, font: f, rotate: degrees(30) })
  const src = await doc.save()
  const { pages } = await extractPdf(src)
  assert.deepEqual(pages[0].units.map((u) => u.text), ['Hello world'])
  const out = await renderPdf(src, { [`0:${pages[0].units[0].id}`]: 'Bonjour le monde' })
  assert.match(textOf(out.pdf), /ELECTRONIC COPY/)
  assert.match(textOf(out.pdf), /Bonjour le monde/)
})

test('a heading and the text under it (same font, other colour) are separate blocks', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([300, 300])
  const f = await doc.embedFont(StandardFonts.HelveticaBold)
  page.drawText('SELL-READY', { x: 20, y: 260, size: 11, font: f, color: rgb(0.8, 0.65, 0.4) })
  page.drawText('No explaining.', { x: 20, y: 246, size: 11, font: f, color: rgb(0.36, 0.23, 0.37) })
  const { pages } = await extractPdf(await doc.save())
  assert.deepEqual(pages[0].units.map((u) => u.text), ['SELL-READY', 'No explaining.'])
})

test('a bold line followed by a regular line is two lines, not one wrapped paragraph', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([300, 300])
  const b = await doc.embedFont(StandardFonts.HelveticaBold)
  const r = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('Product cards', { x: 20, y: 260, size: 9, font: b })
  page.drawText('Care instructions', { x: 20, y: 249, size: 9, font: r })
  const { pages } = await extractPdf(await doc.save())
  assert.equal(pages[0].units.length, 1)
  assert.equal(pages[0].units[0].text, '**Product cards**\nCare instructions')
})

test('a line that grows stays inside the card it sits in', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 300])
  const f = await doc.embedFont(StandardFonts.Helvetica)
  page.drawRectangle({ x: 20, y: 200, width: 160, height: 60, color: rgb(1, 1, 1), borderWidth: 0 })
  page.drawText('Some lights shine softly.', { x: 30, y: 235, size: 10, font: f })
  const src = await doc.save()
  const { pages } = await extractPdf(src)
  const out = await renderPdf(src, { [`0:${pages[0].units[0].id}`]: 'Certaines lumières brillent doucement, et d’autres brillent en rythme avec elles.' })
  for (const l of lineBoxes(out.pdf)) assert.ok(l.bbox[2] <= 180, `line "${l.text}" ends at ${l.bbox[2]}, past the card edge (180)`)
})
