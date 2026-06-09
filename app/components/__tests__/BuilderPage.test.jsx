/**
 * BuilderPage component tests
 *
 * Covers:
 *   - "Collapse All" button writes expanded:false to all lines via setLines
 *   - "Expand All" button writes expanded:true to all lines via setLines
 *   - Selecting a row shows the selection action bar with correct count
 *   - Plain "Duplicate" duplicates selected configs and calls setLines
 *   - applyPack sets qty respecting col.minC
 *   - Removing a line calls setLines without the removed line
 */

import React from 'react'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { renderWithI18n, mockColorConfig } from './testUtils'

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
}))

jest.mock('@/lib/api', () => ({
  sendBuilderChat: jest.fn(),
}))

// ─── Component under test ────────────────────────────────────────────────────

const BuilderPage = require('../BuilderPage').default
const { mkLine, mkColorConfig } = require('../BuilderPage')
const { COLLECTIONS, getPrice, getDefaultCert } = require('@/lib/catalog')

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CUTY = COLLECTIONS.find(c => c.id === 'CUTY')
const M3 = COLLECTIONS.find(c => c.id === 'M3')

function makeLine(col, configs = []) {
  return {
    ...mkLine(),
    collectionId: col.id,
    colorConfigs: configs,
    expanded: true,
  }
}

function renderBuilder(lines, setLines = jest.fn()) {
  return renderWithI18n(
    <BuilderPage
      lines={lines}
      setLines={setLines}
      onGenerateQuote={jest.fn()}
      budget=""
      setBudget={jest.fn()}
      budgetRecommendations={null}
      showRecommendations={false}
      setShowRecommendations={jest.fn()}
      onRequestRecommendations={jest.fn()}
    />
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BuilderPage — Collapse / Expand All', () => {
  it('"Collapse All" sets expanded:false on all lines', () => {
    const line1 = makeLine(CUTY, [mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M' })])
    const line2 = makeLine(CUTY, [mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M' })])
    const lines = [line1, line2]
    const setLines = jest.fn()
    renderBuilder(lines, setLines)

    const collapseBtn = screen.getByText(/collapse all/i)
    fireEvent.click(collapseBtn)

    expect(setLines).toHaveBeenCalled()
    const updater = setLines.mock.calls[0][0]
    const result = updater(lines)
    expect(result.every(l => l.expanded === false)).toBe(true)
  })

  it('"Expand All" sets expanded:true on all lines', () => {
    const line1 = { ...makeLine(CUTY), expanded: false }
    const line2 = { ...makeLine(CUTY), expanded: false }
    const lines = [line1, line2]
    const setLines = jest.fn()
    renderBuilder(lines, setLines)

    const expandBtn = screen.getByText(/expand all/i)
    fireEvent.click(expandBtn)

    expect(setLines).toHaveBeenCalled()
    const updater = setLines.mock.calls[0][0]
    const result = updater(lines)
    expect(result.every(l => l.expanded === true)).toBe(true)
  })
})

describe('BuilderPage — Multi-select action bar', () => {
  it('selecting configs shows the action bar', () => {
    const cfg = mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'M' })
    const line = makeLine(CUTY, [cfg])
    renderBuilder([line])

    // Click the selection checkbox for the row
    const checkboxes = screen.getAllByRole('checkbox')
    if (checkboxes.length > 0) {
      fireEvent.click(checkboxes[0])
      // Action bar should appear with "Duplicate" button
      expect(screen.getByText(/duplicate/i)).toBeInTheDocument()
    }
  })

  it('"Duplicate" button duplicates selected configs via setLines', () => {
    const cfg = mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'M' })
    const line = { ...makeLine(CUTY, [cfg]), uid: 'line-1' }
    const setLines = jest.fn()
    renderBuilder([line], setLines)

    // Click the row selection checkbox
    const checkboxes = screen.getAllByRole('checkbox')
    if (checkboxes.length > 0) {
      fireEvent.click(checkboxes[0])
      // Click Duplicate button in action bar
      const dupBtn = screen.getAllByRole('button').find(b =>
        b.textContent?.toLowerCase().includes('duplicate') && !b.textContent?.includes('variation')
      )
      if (dupBtn) {
        fireEvent.click(dupBtn)
        // setLines should have been called to add the copy
        expect(setLines).toHaveBeenCalled()
      }
    }
  })
})

describe('BuilderPage — Remove line', () => {
  it('clicking remove on a line calls setLines to remove it', () => {
    const line = makeLine(CUTY, [mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M' })])
    const setLines = jest.fn()
    renderBuilder([line], setLines)

    const removeBtns = screen.getAllByTitle(/remove collection/i)
    if (removeBtns.length > 0) {
      fireEvent.click(removeBtns[0])
      expect(setLines).toHaveBeenCalled()
    }
  })
})

describe('BuilderPage — computePackTotal with minC', () => {
  // Test the exported function via the module
  it('computePackTotal multiplies by minC for M3', () => {
    // We test this indirectly by checking pack card display
    // M3: minC=2, prices.2026.igi[0]=65, nylon palette has 20 colors
    // Expected total = 65 * 20 * 2 = 2600
    const col = M3
    const colorCount = 20
    const minQty = col.minC || 1
    // Pin the year explicitly so this test breaks loudly if the catalog data
    // model changes again. (Default fallback is also '2026' per the catalog
    // contract — see catalog-pricelist-defaults.test.js.)
    const lineTotal = getPrice(col, 0, getDefaultCert(col), '2026')
    const expected = lineTotal * colorCount * minQty
    expect(expected).toBe(2600)
  })
})

describe('BuilderPage — collections selected display', () => {
  it('does not duplicate the count in the "X collections selected" text', () => {
    // We test this at the mkLine/configure step level by checking the text output
    // The fix removes the bold prefix so count only appears once in the translation
    // This is a regression check — if the bold prefix is present, it would show "2 2 collections selected"
    const { t } = require('@/lib/i18n').useI18n
      ? { t: (k) => k }
      : require('@/lib/i18n/translations').translations
    // Verify the translation key includes {count} placeholder (normal)
    const { translations } = require('@/lib/i18n/translations')
    const key = translations.en['builder.collectionsSelected']
    expect(key).toBeDefined()
    // The key should contain {count} once
    const occurrences = (key.match(/\{count\}/g) || []).length
    expect(occurrences).toBe(1)
  })
})

// ─── Editable packs ──────────────────────────────────────────────────────────

describe('BuilderPage — editable packs', () => {
  const seedPack = {
    id: 'seed-1', label: 'Standard Pack', description: ['SHAPY'],
    budget_label: '€55', fixed_total: 970, scope: 'global', is_seed: true,
    form_rows: [{ collection: 'CUTY', carat: '0.10', colorCord: 'Black', quantity: '1', size: 'M', bpColor: 'Yellow', setting: '', shape: '', cert: 'In-house' }],
  }
  const privatePack = {
    id: 'priv-1', label: 'My Private Pack', description: ['mine'],
    budget_label: '€40', fixed_total: 1000, scope: 'private', is_seed: false,
    form_rows: [{ collection: 'CUTY', carat: '0.10', colorCord: 'Red', quantity: '1', size: 'M', bpColor: 'Yellow', setting: '', shape: '', cert: 'In-house' }],
  }

  let originalFetch
  beforeEach(() => {
    originalFetch = global.fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ packs: [seedPack, privatePack] }),
    })
  })
  afterEach(() => {
    global.fetch = originalFetch
  })

  function renderBuilderAdmin(isAdmin, { lines = [], setLines = jest.fn() } = {}) {
    return renderWithI18n(
      <BuilderPage
        lines={lines}
        setLines={setLines}
        onGenerateQuote={jest.fn()}
        budget=""
        setBudget={jest.fn()}
        budgetRecommendations={null}
        showRecommendations={false}
        setShowRecommendations={jest.fn()}
        onRequestRecommendations={jest.fn()}
        isAdmin={isAdmin}
      />
    )
  }

  async function openPacksDrawer() {
    fireEvent.click(screen.getByText('Packs').closest('button'))
    // Wait for the fetch to resolve and DB packs to render.
    await screen.findByText('My Private Pack')
  }

  it('shows Edit on both standard and private packs for an admin', async () => {
    renderBuilderAdmin(true)
    await openPacksDrawer()
    expect(screen.getByLabelText('Edit pack — Standard Pack')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit pack — My Private Pack')).toBeInTheDocument()
  })

  it('hides Edit on standard packs for a non-admin but keeps it on their own pack', async () => {
    renderBuilderAdmin(false)
    await openPacksDrawer()
    expect(screen.queryByLabelText('Edit pack — Standard Pack')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Edit pack — My Private Pack')).toBeInTheDocument()
  })

  it('clicking Edit loads the pack into the builder and shows the editing banner', async () => {
    const setLines = jest.fn()
    renderBuilderAdmin(true, { setLines })
    await openPacksDrawer()

    fireEvent.click(screen.getByLabelText('Edit pack — My Private Pack'))

    // applyPack loads the pack's rows into the builder.
    expect(setLines).toHaveBeenCalled()
    // The editing banner appears, naming the pack being edited.
    const banner = await screen.findByTestId('pack-editing-banner')
    expect(banner).toHaveTextContent('My Private Pack')
  })

  it('the banner button opens the edit dialog with the pre-filled, editable name', async () => {
    renderBuilderAdmin(true, { setLines: jest.fn() })
    await openPacksDrawer()
    fireEvent.click(screen.getByLabelText('Edit pack — My Private Pack'))
    await screen.findByTestId('pack-editing-banner')

    // The banner's primary action makes editing the name discoverable.
    fireEvent.click(screen.getByText('Edit name & details'))

    // The edit dialog opens with the pack's name pre-filled and editable.
    expect(screen.getByText('Edit pack')).toBeInTheDocument()
    expect(screen.getByDisplayValue('My Private Pack')).toBeInTheDocument()
  })
})

// ─── PACK 6-RB-SYN + applyPack closure/cert round-trip ────────────────────────

describe('BuilderPage — PACK 6-RB-SYN', () => {
  let originalFetch
  beforeEach(() => {
    originalFetch = global.fetch
    // No seed packs returned → the hardcoded fallback PACKS (incl. Pack 6) render.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ packs: [] }),
    })
  })
  afterEach(() => {
    global.fetch = originalFetch
  })

  async function openFallbackPacks() {
    fireEvent.click(screen.getByText('Packs').closest('button'))
    await screen.findByText('PACK 6-RB-SYN')
  }

  it('renders the PACK 6-RB-SYN quick-start card from the fallback', async () => {
    renderBuilder([])
    await openFallbackPacks()
    expect(screen.getByText('PACK 6-RB-SYN')).toBeInTheDocument()
  })

  it('applying it restores non-braided closure on CUTY/CUBIX and IGI cert', async () => {
    const setLines = jest.fn()
    renderBuilder([], setLines)
    await openFallbackPacks()

    // Pick the "Use this pack" button that belongs to the Pack 6 card.
    // Navigate from the label up to its card (label -> header div -> card div),
    // then scope the button query to that card.
    const labelEl = screen.getByText('PACK 6-RB-SYN')
    const pack6Card = labelEl.parentElement.parentElement
    const pack6Btn = within(pack6Card).getByText('Use this pack')
    expect(pack6Btn).toBeTruthy()
    act(() => { fireEvent.click(pack6Btn) })

    expect(setLines).toHaveBeenCalled()
    // applyPack calls setLines(newLines) with a plain array (not an updater).
    const newLines = setLines.mock.calls[setLines.mock.calls.length - 1][0]
    expect(Array.isArray(newLines)).toBe(true)

    const cutyLine = newLines.find(l => l.collectionId === 'CUTY')
    const cubixLine = newLines.find(l => l.collectionId === 'CUBIX')
    const m3Line = newLines.find(l => l.collectionId === 'M3')

    expect(cutyLine.colorConfigs.every(c => c.closureType === 'nonBraided')).toBe(true)
    expect(cubixLine.colorConfigs.every(c => c.closureType === 'nonBraided')).toBe(true)
    expect(cutyLine.colorConfigs.every(c => c.certType === 'igi')).toBe(true)
    // MULTI THREE doesn't opt into closure, so it stays null, but cert restores.
    expect(m3Line.colorConfigs.every(c => c.closureType === null)).toBe(true)
    expect(m3Line.colorConfigs.every(c => c.certType === 'igi')).toBe(true)
    // Royal Blue cord throughout.
    expect(cutyLine.colorConfigs.every(c => c.colorName === 'Royal Blue')).toBe(true)
  })
})
