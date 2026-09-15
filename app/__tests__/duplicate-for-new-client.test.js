/**
 * @jest-environment node
 *
 * Duplicate wiring (Sam, 15 Sep 2026). App.handleDuplicate and the Documents
 * panel are too entangled with the builder to mount here, so these pin the
 * three things that make the feature work, at the source:
 *   - the dialog decides the mode, and handleDuplicate honours both;
 *   - a duplicate never keeps editingDocumentId, so saving writes a new order;
 *   - the Duplicate button has no admin or owner gate, so agents can use it.
 */
const fs = require('node:fs')
const path = require('node:path')

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

describe('handleDuplicate', () => {
  const src = read('app/App.jsx')
  const fn = src.match(/const handleDuplicate = useCallback\([\s\S]*?\}, \[[^\]]*\]\)/)?.[0]

  it('exists and takes the dialog’s choice', () => {
    expect(fn).toBeTruthy()
    expect(fn).toMatch(/\(doc, choice = \{\}\)/)
  })

  it('swaps the client for mode "new" and restocks otherwise', () => {
    expect(fn).toMatch(/choice\.mode === 'new'/)
    expect(fn).toMatch(/formStateForNewClient\(formState, choice\.clientFields \|\| \{\}\)/)
    expect(fn).toMatch(/formStateForRestock\(formState\)/)
  })

  it('keeps the fair only when the dialog asked to', () => {
    expect(fn).toMatch(/choice\.keepFair && formState\.eventName/)
  })

  it('still clears editingDocumentId, so the save creates a new order', () => {
    expect(fn).toMatch(/setEditingDocumentId\(null\)/)
  })

  it('still restores the price list and the client snapshot', () => {
    expect(fn).toMatch(/setPricelistYear/)
    expect(fn).toMatch(/clientFromOrderFormState/)
  })
})

describe('the Duplicate button', () => {
  it('is shown to anyone who can see the order — no admin or canEdit gate', () => {
    const row = read('app/components/DocumentRow.jsx')
    const duplicate = row.match(/\{onDuplicate && [\s\S]*?\)\}/)?.[0]
    expect(duplicate).toBeTruthy()
    expect(duplicate).not.toMatch(/canEdit|isAdmin/)
    // Re-edit, right above it, is the one that checks.
    expect(row).toMatch(/\{onReEdit && doc\.metadata\?\.formState && canEdit &&/)
  })

  it('opens the dialog instead of duplicating straight away', () => {
    const panel = read('app/components/DocumentsPanel.jsx')
    expect(panel).toMatch(/onDuplicate=\{onDuplicate \? \(\(d\) => setDuplicateDoc\(d\)\) : undefined\}/)
    expect(panel).toMatch(/<DuplicateOrderModal/)
    expect(panel).toMatch(/onDuplicate\?\.\(doc, choice\)/)
  })

  it('reads "Duplicate", not "Copy"', () => {
    const t = read('lib/i18n/translations.js')
    expect(t).toMatch(/'order\.duplicate': 'Duplicate',/)
    expect(t).toMatch(/'order\.duplicate': 'Dupliquer',/)
    expect(t).not.toMatch(/'order\.duplicate': 'Copy',/)
  })
})
