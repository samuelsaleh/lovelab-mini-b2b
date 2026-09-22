/**
 * Dump text cells (decoded via ToUnicode) + page-point positions from the
 * October price list. Used to pin rewrite targets for reprice scripts.
 *
 * Usage: node scripts/dump-october-pdf-cells.mjs
 */
import { PDFDocument, PDFName, decodePDFRawStream } from 'pdf-lib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const full = path.join(__dirname, '..', 'public', 'Price Lists', 'Pricelist_LoveLab_2026_October.pdf')
const src = await PDFDocument.load(fs.readFileSync(full))
const SCALE = 0.75

function glyphMaps(doc, page) {
  const fonts = doc.context.lookup(page.node.Resources().get(PDFName.of('Font')))
  if (!fonts) return {}
  const out = {}
  for (const [name, ref] of fonts.entries()) {
    const toUnicode = doc.context.lookup(ref).get(PDFName.of('ToUnicode'))
    if (!toUnicode) continue
    const cmap = Buffer.from(decodePDFRawStream(doc.context.lookup(toUnicode)).decode()).toString('latin1')
    const toChar = {}
    for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const pair of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
        toChar[pair[1].toLowerCase()] = String.fromCharCode(parseInt(pair[2].slice(0, 4), 16))
      }
    }
    for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const r of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
        const lo = parseInt(r[1], 16)
        const hi = parseInt(r[2], 16)
        const uni = parseInt(r[3].slice(0, 4), 16)
        for (let g = lo; g <= hi; g++) {
          toChar[g.toString(16).padStart(4, '0')] = String.fromCharCode(uni + g - lo)
        }
      }
    }
    out[name.toString().slice(1)] = toChar
  }
  return out
}

function readStream(doc, page) {
  const c = page.node.get(PDFName.of('Contents'))
  if (c && typeof c.size === 'function') {
    let stream = ''
    for (let i = 0; i < c.size(); i++) {
      stream += Buffer.from(decodePDFRawStream(doc.context.lookup(c.get(i))).decode()).toString('latin1')
    }
    return stream
  }
  return Buffer.from(decodePDFRawStream(doc.context.lookup(c)).decode()).toString('latin1')
}

for (let i = 0; i < src.getPageCount(); i++) {
  const page = src.getPages()[i]
  let maps = {}
  let stream = ''
  try {
    maps = glyphMaps(src, page)
    stream = readStream(src, page)
  } catch (e) {
    console.log(`\n=== PAGE ${i + 1} (unreadable: ${e.message}) ===`)
    continue
  }
  const token = /\/(\w+)\s+[\d.]+\s+Tf|([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm|\[([^\]]*)\]\s*TJ/g
  let font = null
  let tx = 0
  let ty = 0
  let m
  console.log(`\n=== PAGE ${i + 1} ===`)
  while ((m = token.exec(stream))) {
    if (m[1]) { font = m[1]; continue }
    if (m[6] !== undefined) { tx = Number(m[6]); ty = Number(m[7]); continue }
    const toChar = maps[font]
    if (!toChar) continue
    const text = [...m[8].matchAll(/<([0-9a-fA-F]+)>/g)]
      .map((g) => toChar[g[1].toLowerCase()] ?? '?')
      .join('')
    if (!text.trim()) continue
    if (!/€|SIENNA|FLOWER|LINEA|RIVIERA|ZA|MOON|0,|1,|ICONIX|LONG|MULTI|ORIGINAL|N E W|SHAPY/.test(text)) continue
    console.log(`${(ty * SCALE).toFixed(2).padStart(8)} ${(tx * SCALE).toFixed(2).padStart(8)}  ${JSON.stringify(text)}`)
  }
}
