/**
 * Print text from a PDF via pdf-parse. Used by Jest so pdfjs does not
 * have to boot inside the test VM.
 * Usage: node scripts/pdf-text.mjs path/to/file.pdf
 */
import { PDFParse } from 'pdf-parse'
import fs from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/pdf-text.mjs <pdf>')
  process.exit(2)
}

const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync(file)) })
const parsed = await parser.getText()
await parser.destroy()
process.stdout.write(parsed.text || '')
