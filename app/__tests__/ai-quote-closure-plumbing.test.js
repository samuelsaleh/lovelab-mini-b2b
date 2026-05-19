/**
 * @jest-environment node
 *
 * When the "Describe your situation" AI Advisor returns a quote with
 * lines, App.jsx expands those lines into builder colorConfigs. This
 * expansion has to forward EVERY field the AI set — including the new
 * certType and closureType fields — otherwise CUTY/CUBIX rows land in
 * the builder with empty closure and the agent gets a validation error
 * the moment they try to save the order.
 *
 * Static source-pin: the simplest, most durable way to guarantee the
 * expansion code keeps these two keys.
 */

const fs = require('node:fs')
const path = require('node:path')

function readApp() {
  return fs.readFileSync(path.resolve(__dirname, '../App.jsx'), 'utf8')
}

describe('app/App.jsx — AI quote → builder line plumbing', () => {
  const src = readApp()

  it('forwards certType from AI quote line into the builder config', () => {
    expect(src).toMatch(/certType:\s*ql\.certType/)
  })

  it('forwards closureType from AI quote line into the builder config', () => {
    expect(src).toMatch(/closureType:\s*ql\.closureType/)
  })

  it('the base object spread for color expansion lives inside the AI handler block', () => {
    // The base object should be in the "for (const ql of qls)" loop
    // immediately after caratIdx is computed. This sanity check pins
    // the location so a future refactor doesn't accidentally rebuild
    // the line without these fields.
    const m = src.match(/for\s*\(const ql of qls\)\s*\{[\s\S]*?const base\s*=\s*\{[\s\S]*?\}/)
    expect(m).not.toBeNull()
    expect(m[0]).toMatch(/certType/)
    expect(m[0]).toMatch(/closureType/)
  })
})

describe('app/App.jsx — OrderForm rows → builder line plumbing', () => {
  const src = readApp()

  it('forwards closure from saved/order form rows into builder configs', () => {
    const m = src.match(/function builderLinesFromFormRows\(formRows\) \{[\s\S]*?return \{ uid: uniqueId\(\), collectionId: colId, colorConfigs, expanded: true \}/)
    expect(m).not.toBeNull()
    expect(m[0]).toMatch(/row\.closure/)
    expect(m[0]).toMatch(/closureType/)
  })
})
