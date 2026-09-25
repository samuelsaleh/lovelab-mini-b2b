/**
 * HTML → a single phone-width PDF page, with the Chrome already installed on the machine (puppeteer-core
 * downloads no browser). CHROME_PATH overrides the lookup; on the server this
 * points at its Chromium once the report runs there.
 */

import { existsSync } from 'node:fs'
import { PAGE_WIDTH_MM } from './renderPdfHtml.js'

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

export function findChrome() {
  if (process.env.CHROME_PATH) return existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null
  return CANDIDATES.find((p) => existsSync(p)) || null
}

/** @returns {Promise<Buffer>} */
export async function htmlToPdf(html) {
  const executablePath = findChrome()
  if (!executablePath) {
    throw new Error('No Chrome/Chromium found for PDF generation. Install Chrome or set CHROME_PATH.')
  }
  const { default: puppeteer } = await import('puppeteer-core')
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
  try {
    const page = await browser.newPage()
    const widthPx = Math.round((PAGE_WIDTH_MM / 25.4) * 96)
    await page.setViewport({ width: widthPx, height: 1200 })
    await page.setContent(html, { waitUntil: 'load' })
    // One page exactly as tall as the report: no page breaks to split a
    // table, and on a phone it scrolls like a web page.
    const heightPx = await page.evaluate(() => Math.ceil(document.querySelector('.page')?.getBoundingClientRect().height || document.body.scrollHeight))
    const pdf = await page.pdf({ width: `${widthPx}px`, height: `${heightPx + 1}px`, printBackground: true, pageRanges: '1' })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
