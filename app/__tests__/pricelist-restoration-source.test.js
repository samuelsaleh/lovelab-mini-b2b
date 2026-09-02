/**
 * @jest-environment node
 *
 * Source-pin regression tests for the pricelistYear restoration bugs:
 *
 *  - app/App.jsx handleReEdit must call setPricelistYear from
 *    metadata.formState.pricelistYear (or top-level metadata.pricelistYear)
 *  - app/App.jsx editInBuilder URL handler must do the same
 *  - app/components/OrderForm.jsx draft auto-save body must include
 *    pricelistYear AND list it as a dep in the useEffect array
 *
 * Audit pre-fix bugs:
 *  - editInBuilder loaded the formState rows but never restored the year, so
 *    a 2025 doc reopened at 2026 prices.
 *  - The draft body omitted pricelistYear, so refreshing mid-order also lost
 *    the year.
 *
 * These are static checks rather than full React tests because they catch
 * the exact regression with zero setup overhead, and the runtime behaviour
 * of pricelistYear threading is already covered by the BuilderPage unit tests.
 */

const fs = require('node:fs')
const path = require('node:path')

function readApp() {
  return fs.readFileSync(path.resolve(__dirname, '../App.jsx'), 'utf8')
}

function readOrderForm() {
  return fs.readFileSync(path.resolve(__dirname, '../components/OrderForm.jsx'), 'utf8')
}

describe('app/App.jsx — pricelistYear restoration', () => {
  it('handleReEdit reads pricelistYear from saved metadata', () => {
    const src = readApp()
    // Find the handleReEdit useCallback block.
    const match = src.match(/handleReEdit\s*=\s*useCallback\([\s\S]*?\}\s*,\s*\[[^\]]*\]\)/)
    expect(match).not.toBeNull()
    const block = match[0]
    expect(block).toMatch(/setPricelistYear/)
    expect(block).toMatch(/formState\.pricelistYear/)
    // Incoming website orders omit VAT/address/Order by. Re-edit must not
    // merge leftover session client data onto those gaps.
    expect(block).toMatch(/clientFromOrderFormState/)
  })

  it('editInBuilder URL branch restores pricelistYear before switching tabs', () => {
    const src = readApp()
    // The deep-link useEffect contains the editInBuilder branch.
    expect(src).toMatch(/editInBuilder/)
    // Restore must happen — find the editInBuilder branch and assert the call.
    const branch = src.match(/editInBuilderId[\s\S]*?setActiveTab\('builder'\)/)
    expect(branch).not.toBeNull()
    expect(branch[0]).toMatch(/setPricelistYear/)
    // Pulls from formState.pricelistYear OR top-level metadata.pricelistYear.
    expect(branch[0]).toMatch(/formState\?\.\s*pricelistYear|formState\.pricelistYear/)
  })

  it('handleDuplicate also restores pricelistYear for visual consistency', () => {
    const src = readApp()
    const match = src.match(/handleDuplicate\s*=\s*useCallback\([\s\S]*?\}\s*,\s*\[[^\]]*\]\)/)
    expect(match).not.toBeNull()
    expect(match[0]).toMatch(/setPricelistYear/)
    expect(match[0]).toMatch(/clientFromOrderFormState/)
  })
})

describe('app/components/OrderForm.jsx — draft round-trip', () => {
  it('draft auto-save body includes pricelistYear', () => {
    const src = readOrderForm()
    // The saveDraft helper builds a `formState` literal — pricelistYear
    // must be a key inside it. Look for the literal definition.
    const match = src.match(/const formState = \{[\s\S]*?\}\s*\n\s*await fetch\('\/api\/drafts'/)
    expect(match).not.toBeNull()
    expect(match[0]).toMatch(/pricelistYear/)
  })

  it('draft auto-save useEffect dep array includes pricelistYear', () => {
    const src = readOrderForm()
    // Find the deps array of the draft auto-save effect — the one that
    // calls setInterval(saveDraft, 2 * 60 * 1000).
    const match = src.match(/saveDraft, 2 \* 60 \* 1000\)[\s\S]*?\}\s*,\s*\[([^\]]+)\]\)/)
    expect(match).not.toBeNull()
    const deps = match[1]
    expect(deps).toMatch(/pricelistYear/)
  })
})
