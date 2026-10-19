/**
 * Child process that does the PDF work (MuPDF, WASM) for one request and exits.
 * Started by isolated.mjs. Keeping it in its own process means its memory goes
 * back to the system when it ends, a runaway job can be killed without taking
 * the app down, and the app's single thread is never busy with PDF work.
 */
import * as pdf from './index.mjs'

process.once('message', async (msg) => {
  let reply
  try {
    const result = msg.op === 'extract' ? await pdf.extractPdf(msg.bytes) : await pdf.renderPdf(msg.bytes, msg.translations)
    reply = { ok: true, result }
  } catch (err) {
    reply = { ok: false, error: String(err?.message || err) }
  }
  process.send(reply, () => process.exit(0))
})
