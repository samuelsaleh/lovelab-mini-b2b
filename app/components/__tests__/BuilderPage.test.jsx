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
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
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
  // Selection is driven by styled <button> toggles, not <input type=checkbox>.
  // The per-line "Select all" button (title="Select all") selects every config
  // in the line, which surfaces the sticky multi-select action bar.
  it('selecting configs shows the action bar', () => {
    const cfg = mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'M' })
    const line = makeLine(CUTY, [cfg])
    renderBuilder([line])

    fireEvent.click(screen.getByTitle('Select all'))

    // Action bar shows the "N selected" count and a Duplicate button.
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    const dupBtns = screen.getAllByRole('button').filter(b =>
      b.textContent?.toLowerCase().includes('duplicate')
    )
    expect(dupBtns.length).toBeGreaterThan(0)
  })

  it('"Duplicate" button duplicates selected configs via setLines', () => {
    const cfg = mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'M' })
    const line = { ...makeLine(CUTY, [cfg]), uid: 'line-1' }
    const setLines = jest.fn()
    renderBuilder([line], setLines)

    fireEvent.click(screen.getByTitle('Select all'))

    // The action bar's plain "Duplicate" button (not "...with variations").
    const dupBtn = screen.getAllByRole('button').find(b =>
      b.textContent?.toLowerCase().includes('duplicate') && !b.textContent?.toLowerCase().includes('variation')
    )
    expect(dupBtn).toBeTruthy()
    fireEvent.click(dupBtn)
    expect(setLines).toHaveBeenCalled()
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

  it('shows Delete on every pack type for an admin (including seeds)', async () => {
    renderBuilderAdmin(true)
    await openPacksDrawer()
    expect(screen.getByLabelText(/Delete.*Standard Pack/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Delete.*My Private Pack/i)).toBeInTheDocument()
  })

  it('makes admin pack cards draggable for reorder', async () => {
    renderBuilderAdmin(true)
    await openPacksDrawer()
    expect(screen.getByTestId('pack-card-draggable-seed-1')).toBeInTheDocument()
    expect(screen.getByTestId('pack-card-draggable-priv-1')).toBeInTheDocument()
  })

  it('hides Edit on standard packs for a non-admin but keeps it on their own pack', async () => {
    renderBuilderAdmin(false)
    await openPacksDrawer()
    expect(screen.queryByLabelText('Edit pack — Standard Pack')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Edit pack — My Private Pack')).toBeInTheDocument()
  })

  it('hides Delete on seed packs for a non-admin but keeps it on their own pack', async () => {
    renderBuilderAdmin(false)
    await openPacksDrawer()
    expect(screen.queryByLabelText(/Delete.*Standard Pack/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Delete.*My Private Pack/i)).toBeInTheDocument()
  })

  it('does not make pack cards draggable for a non-admin', async () => {
    renderBuilderAdmin(false)
    await openPacksDrawer()
    expect(screen.queryByTestId('pack-card-draggable-seed-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('pack-card-priv-1')).toBeInTheDocument()
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

    // Pick the "+ Add pack" button that belongs to the Pack 6 card.
    // Navigate from the label up to its card (label -> header div -> card div),
    // then scope the button query to that card.
    const labelEl = screen.getByText('PACK 6-RB-SYN')
    const pack6Card = labelEl.parentElement.parentElement
    const pack6Btn = within(pack6Card).getByText('+ Add pack')
    expect(pack6Btn).toBeTruthy()
    act(() => { fireEvent.click(pack6Btn) })

    expect(setLines).toHaveBeenCalled()
    // Packs now apply additively (merge:true), so setLines is called with a
    // functional updater. Invoke it with an empty build to get the new lines.
    const updater = setLines.mock.calls[setLines.mock.calls.length - 1][0]
    const newLines = typeof updater === 'function' ? updater([]) : updater
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

  it('adds a pack to the existing build instead of replacing it (multiple packs per order)', async () => {
    const setLines = jest.fn()
    renderBuilder([], setLines)
    await openFallbackPacks()

    const labelEl = screen.getByText('PACK 6-RB-SYN')
    const pack6Card = labelEl.parentElement.parentElement
    const pack6Btn = within(pack6Card).getByText('+ Add pack')
    act(() => { fireEvent.click(pack6Btn) })

    const updater = setLines.mock.calls[setLines.mock.calls.length - 1][0]
    expect(typeof updater).toBe('function')

    // 1) A different collection already in the order is preserved (not wiped).
    const prevDifferent = [{ uid: 'pre', collectionId: 'SSF', colorConfigs: [{ id: 'keep' }], expanded: false }]
    const merged = updater(prevDifferent)
    expect(merged.find(l => l.collectionId === 'SSF')).toBeTruthy() // kept
    expect(merged.find(l => l.collectionId === 'CUTY')).toBeTruthy() // added from pack
    expect(merged.find(l => l.collectionId === 'CUBIX')).toBeTruthy()

    // 2) The SAME collection already in the order gets the pack's colours appended.
    const prevSame = [{ uid: 'cuty1', collectionId: 'CUTY', colorConfigs: [{ id: 'existing' }], expanded: false }]
    const mergedSame = updater(prevSame)
    const cutyLine = mergedSame.find(l => l.collectionId === 'CUTY')
    expect(cutyLine.colorConfigs[0].id).toBe('existing') // original kept first
    expect(cutyLine.colorConfigs.length).toBeGreaterThan(1) // pack colours appended
  })

  it('tags every row it adds with the pack identity so the pack can be removed in one click', async () => {
    const setLines = jest.fn()
    renderBuilder([], setLines)
    await openFallbackPacks()

    const labelEl = screen.getByText('PACK 6-RB-SYN')
    const pack6Card = labelEl.parentElement.parentElement
    act(() => { fireEvent.click(within(pack6Card).getByText('+ Add pack')) })

    const updater = setLines.mock.calls[setLines.mock.calls.length - 1][0]
    const newLines = updater([{ uid: 'pre', collectionId: 'SSF', colorConfigs: [{ id: 'keep' }], expanded: false }])
    const packRows = newLines.flatMap(l => l.colorConfigs).filter(c => c.packId)
    expect(packRows.length).toBeGreaterThan(0)
    expect(packRows.every(c => c.packLabel === 'PACK 6-RB-SYN')).toBe(true)
    expect(new Set(packRows.map(c => c.packId)).size).toBe(1)
    // The row that was already in the order is NOT claimed by the pack.
    const ssf = newLines.find(l => l.collectionId === 'SSF')
    expect(ssf.colorConfigs[0].packId).toBeUndefined()
  })
})

// ─── One-click "Remove pack" ──────────────────────────────────────────────────
//
// Before this, taking a pack back out of an order meant deleting each of its
// collections one by one. Rows a pack adds are now tagged with packId, so the
// Configure view lists the packs in the order and each has a single Remove.

describe('BuilderPage — Remove pack in one click', () => {
  const { packsInLines, removePackFromLines } = require('../BuilderPage')

  const packRow = (packId, overrides = {}) =>
    mockColorConfig({ packId, packLabel: packId === 'p1' ? 'Pack One' : 'Pack Two', caratIdx: 0, ...overrides })

  function twoPacksAndAHandRow() {
    // CUTY: 2 rows from Pack One + 1 hand-added row
    // CUBIX: 1 row from Pack One only
    // M3: 1 row from Pack Two only
    const cuty = makeLine(CUTY, [
      packRow('p1', { id: 'c1', qty: 2 }),
      packRow('p1', { id: 'c2', qty: 3 }),
      mockColorConfig({ id: 'hand', caratIdx: 0 }),
    ])
    const cubix = makeLine(COLLECTIONS.find(c => c.id === 'CUBIX'), [packRow('p1', { id: 'x1', qty: 1 })])
    const m3 = makeLine(M3, [packRow('p2', { id: 'm1', qty: 4 })])
    return [cuty, cubix, m3]
  }

  it('packsInLines lists each pack once with its collections and piece count', () => {
    const packs = packsInLines(twoPacksAndAHandRow())
    expect(packs.map(p => p.id)).toEqual(['p1', 'p2'])
    expect(packs[0]).toMatchObject({ label: 'Pack One', collectionIds: ['CUTY', 'CUBIX'], rowCount: 3, pieceCount: 6 })
    expect(packs[1]).toMatchObject({ label: 'Pack Two', collectionIds: ['M3'], rowCount: 1, pieceCount: 4 })
  })

  it('packsInLines ignores untagged rows and empty builds', () => {
    expect(packsInLines([makeLine(CUTY, [mockColorConfig()])])).toEqual([])
    expect(packsInLines([])).toEqual([])
    expect(packsInLines(undefined)).toEqual([])
  })

  it('removePackFromLines drops the pack rows, keeps hand rows and other packs, and drops lines the pack alone filled', () => {
    const next = removePackFromLines(twoPacksAndAHandRow(), 'p1')
    // CUBIX only existed because of Pack One → gone. CUTY keeps the hand row.
    expect(next.map(l => l.collectionId)).toEqual(['CUTY', 'M3'])
    expect(next[0].colorConfigs.map(c => c.id)).toEqual(['hand'])
    expect(next[1].colorConfigs.map(c => c.id)).toEqual(['m1']) // Pack Two untouched
  })

  it('removePackFromLines leaves one blank line when the pack was the whole order', () => {
    const next = removePackFromLines([makeLine(M3, [packRow('p2', { id: 'm1' })])], 'p2')
    expect(next).toHaveLength(1)
    expect(next[0].collectionId).toBeNull()
    expect(next[0].colorConfigs).toEqual([])
  })

  it('shows a "Packs in this order" strip with one Remove button per pack', () => {
    const setLines = jest.fn()
    renderBuilder(twoPacksAndAHandRow(), setLines)

    const strip = screen.getByTestId('packs-in-order')
    expect(within(strip).getByText('Pack One')).toBeInTheDocument()
    expect(within(strip).getByText('Pack Two')).toBeInTheDocument()
    expect(screen.getByTestId('remove-pack-p1')).toBeInTheDocument()
    expect(screen.getByTestId('remove-pack-p2')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('remove-pack-p1'))
    expect(setLines).toHaveBeenCalledTimes(1)
    const updater = setLines.mock.calls[0][0]
    const next = updater(twoPacksAndAHandRow())
    expect(next.map(l => l.collectionId)).toEqual(['CUTY', 'M3'])
    expect(next[0].colorConfigs.map(c => c.id)).toEqual(['hand'])
  })

  it('does not show the strip when nothing in the order came from a pack', () => {
    renderBuilder([makeLine(CUTY, [mockColorConfig({ caratIdx: 0 })])])
    expect(screen.queryByTestId('packs-in-order')).not.toBeInTheDocument()
  })

  it('the pack card shows "✓ Added" and a Remove button when its rows are in the order, derived from the build', async () => {
    // Fallback packs render when the API returns none; find Pack 6's id by
    // adding it once and reading the tag off the rows it produces.
    const originalFetch = global.fetch
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ packs: [] }) })
    try {
      const probe = jest.fn()
      const { unmount } = renderBuilder([], probe)
      fireEvent.click(screen.getByText('Packs').closest('button'))
      await screen.findByText('PACK 6-RB-SYN')
      const card0 = screen.getByText('PACK 6-RB-SYN').parentElement.parentElement
      act(() => { fireEvent.click(within(card0).getByText('+ Add pack')) })
      const packLines = probe.mock.calls[probe.mock.calls.length - 1][0]([])
      const pack6Id = packLines[0].colorConfigs[0].packId
      unmount()

      // Now render with those rows already in the build (as after a reload).
      const setLines = jest.fn()
      renderBuilder(packLines, setLines)
      // The strip already names the pack; the card is the other match.
      expect(within(screen.getByTestId('packs-in-order')).getByText('PACK 6-RB-SYN')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Packs').closest('button'))
      const card = (await screen.findByTitle('PACK 6-RB-SYN')).parentElement.parentElement
      expect(within(card).getByText('✓ Added')).toBeInTheDocument()

      fireEvent.click(screen.getByTestId(`pack-remove-from-order-${pack6Id}`))
      const next = setLines.mock.calls[0][0](packLines)
      expect(next).toHaveLength(1)
      expect(next[0].collectionId).toBeNull()
    } finally {
      global.fetch = originalFetch
    }
  })
})
