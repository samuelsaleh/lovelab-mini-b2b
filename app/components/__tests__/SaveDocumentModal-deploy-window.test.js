/**
 * @jest-environment node
 *
 * Source-pin (same pattern as the other SaveDocumentModal tests): every
 * server answer the dialog reads goes through readJson, so a text page from
 * a restarting server (14 Sep 2026, an agent mid-deploy) is shown as a
 * sentence and never as "Unexpected token 'T' … is not valid JSON".
 */
const fs = require('node:fs')
const path = require('node:path')

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'SaveDocumentModal.jsx'), 'utf8')

test('no raw .json() call is left in the dialog', () => {
  expect(SRC).not.toMatch(/\.json\(\)/)
  expect(SRC).toMatch(/import \{ readJson \} from '@\/lib\/readJson'/)
  expect(SRC).toMatch(/const safeJson = readJson/)
})

test('a non-JSON events answer surfaces the updating message, not a parse error', () => {
  expect(SRC).toMatch(/const data = await safeJson\(eventsRes\);\s*\n\s*if \(!eventsRes\.ok \|\| data\?\.notJson\) throw new Error\(data\?\.error/)
})
