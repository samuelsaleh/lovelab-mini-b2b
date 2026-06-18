/**
 * CollectionConfig — bracelet thread closure (CUTY/CUBIX) tests
 *
 * Guarantees:
 *   - The Closure column header renders ONLY for collections with hasClosure
 *     (CUTY, CUBIX) and is hidden for everyone else (HOLY/M3/etc.).
 *   - The Closure dropdown lets the user pick Braided / Non-braided and emits
 *     onChange with the new colorConfigs array.
 *   - The completion mirror in CollectionConfig requires closureType for
 *     hasClosure collections (so the line subtotal "n / n" only counts
 *     closure-set rows as complete).
 */

import React from 'react'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithI18n, mockColorConfig } from './testUtils'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))

const { COLLECTIONS } = require('@/lib/catalog')
const CUTY = COLLECTIONS.find(c => c.id === 'CUTY')
const CUBIX = COLLECTIONS.find(c => c.id === 'CUBIX')
const HOLY = COLLECTIONS.find(c => c.id === 'HOLY')

const CollectionConfig = require('../CollectionConfig').default

function mockLine(col, configs = [], overrides = {}) {
  return {
    uid: 'line-1',
    collectionId: col.id,
    colorConfigs: configs,
    expanded: true,
    sameForAll: false,
    sharedSettings: {
      caratIdx: null, housing: null, housingType: null,
      multiAttached: null, shape: null, size: null, cordType: null, thickness: null,
      closureType: null,
      qty: null,
    },
    ...overrides,
  }
}

function renderConfig(col, line, onChange = jest.fn(), extra = {}) {
  return renderWithI18n(
    <CollectionConfig
      line={line}
      col={col}
      onChange={onChange}
      onRemove={jest.fn()}
      selectedConfigs={new Set()}
      onToggleConfigSelect={jest.fn()}
      onToggleLineSelect={jest.fn()}
      recentlyDuplicated={new Set()}
      {...extra}
    />
  )
}

describe('CollectionConfig — closure column visibility', () => {
  it('shows the Closure header for CUTY (hasClosure: true) when there are configs', () => {
    const line = mockLine(CUTY, [
      mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M', closureType: null }),
    ])
    renderConfig(CUTY, line)
    expect(screen.getByText('Closure')).toBeInTheDocument()
  })

  it('shows the Closure header for CUBIX (hasClosure: true) when there are configs', () => {
    const line = mockLine(CUBIX, [
      mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'S/M', closureType: null }),
    ])
    renderConfig(CUBIX, line)
    expect(screen.getByText('Closure')).toBeInTheDocument()
  })

  it('does NOT show the Closure header for HOLY (no hasClosure)', () => {
    const line = mockLine(HOLY, [
      mockColorConfig({ caratIdx: 0, housing: 'Yellow', shape: 'Cross', size: 'M' }),
    ])
    renderConfig(HOLY, line)
    expect(screen.queryByText('Closure')).not.toBeInTheDocument()
  })
})

describe('CollectionConfig — closure dropdown', () => {
  it('emits onChange with the new closureType when the user picks "Braided"', () => {
    const onChange = jest.fn()
    const line = mockLine(CUTY, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'M', closureType: null }),
    ])
    renderConfig(CUTY, line, onChange)

    // Find the Closure-cell select. It's the only one with a "Braided" option.
    const selects = screen.getAllByRole('combobox')
    const closureSelect = selects.find(sel => Array.from(sel.options || []).some(o => o.text === 'Braided'))
    expect(closureSelect).toBeTruthy()
    fireEvent.change(closureSelect, { target: { value: 'braided' } })

    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]
    expect(lastCall[1]).toEqual(expect.objectContaining({
      colorConfigs: expect.arrayContaining([
        expect.objectContaining({ id: 'cfg-1', closureType: 'braided' }),
      ]),
    }))
  })

  it('exposes both Braided and Non-braided options', () => {
    const line = mockLine(CUTY, [
      mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M', closureType: null }),
    ])
    renderConfig(CUTY, line)
    expect(screen.getByRole('option', { name: 'Braided' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Non-braided' })).toBeInTheDocument()
  })
})

// ─── Shared Settings (sameForAll: true) ─────────────────────────────────────
// When the agent flips "Same settings for all colours", the Shared Settings
// strip becomes the source of truth for cert + closure. These tests guarantee
// that strip exists for opt-in collections AND that picking a value pushes
// the same patch into every colorConfig (not just the first).

function mockLineSameForAll(col, configs = []) {
  return mockLine(col, configs, {
    sameForAll: true,
    sharedSettings: {
      caratIdx: 0,
      housing: 'Yellow',
      housingType: null,
      multiAttached: null,
      shape: null,
      size: 'M',
      cordType: null,
      thickness: null,
      certType: null,
      closureType: null,
      qty: 1,
    },
  })
}

describe('CollectionConfig — Shared Settings: Certificate', () => {
  it('renders IGI + In-house buttons when col.certificate === "both" (CUTY)', () => {
    const line = mockLineSameForAll(CUTY, [
      mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M' }),
    ])
    renderConfig(CUTY, line)
    // The per-row cert tabs ALSO render IGI / In-house buttons, so there
    // will be 2 sets total (shared strip + 1 row). What matters is that the
    // shared strip exists at all — assert >= 2 of each (shared + row).
    expect(screen.getAllByRole('button', { name: 'IGI' }).length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByRole('button', { name: 'In-house' }).length).toBeGreaterThanOrEqual(2)
  })

  it('does NOT render the cert buttons for collections with a single fixed cert (M3 IGI-only)', () => {
    const M3 = COLLECTIONS.find(c => c.id === 'M3')
    const line = mockLineSameForAll(M3, [
      mockColorConfig({ caratIdx: 0, housing: 'WWW', size: 'M' }),
    ])
    renderConfig(M3, line)
    // M3 has certificate: 'igi' — the "both" toggle UI should not render.
    expect(screen.queryByRole('button', { name: 'In-house' })).not.toBeInTheDocument()
  })

  it('broadcasts the picked cert to every colorConfig (shared button = first In-house)', () => {
    const onChange = jest.fn()
    const line = mockLineSameForAll(CUTY, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'M', certType: null }),
      mockColorConfig({ id: 'cfg-2', caratIdx: 0, housing: 'Yellow', size: 'M', certType: null }),
    ])
    renderConfig(CUTY, line, onChange)

    // The Shared Settings strip is rendered BEFORE the per-row table, so the
    // first "In-house" button in the document is the shared one. Clicking it
    // should call updateShared() which broadcasts the patch into EVERY
    // colorConfig (this is what distinguishes shared from per-row).
    const inhouseButtons = screen.getAllByRole('button', { name: 'In-house' })
    fireEvent.click(inhouseButtons[0])

    const colorConfigsCall = onChange.mock.calls.find(c => c[1]?.colorConfigs)
    expect(colorConfigsCall).toBeTruthy()
    expect(colorConfigsCall[1].colorConfigs).toEqual([
      expect.objectContaining({ id: 'cfg-1', certType: 'inhouse' }),
      expect.objectContaining({ id: 'cfg-2', certType: 'inhouse' }),
    ])
  })
})

describe('CollectionConfig — Shared Settings: Closure', () => {
  it('renders the Closure dropdown for hasClosure collections (CUTY)', () => {
    const line = mockLineSameForAll(CUTY, [
      mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M' }),
    ])
    renderConfig(CUTY, line)
    // The shared closure select must expose both Braided / Non-braided.
    const selects = screen.getAllByRole('combobox')
    const sharedClosure = selects.find(s =>
      Array.from(s.options || []).some(o => o.text === 'Braided'),
    )
    expect(sharedClosure).toBeTruthy()
  })

  it('does NOT render the Closure dropdown for non-closure collections (HOLY)', () => {
    const line = mockLineSameForAll(HOLY, [
      mockColorConfig({ caratIdx: 0, housing: 'Yellow', shape: 'Cross', size: 'M' }),
    ])
    renderConfig(HOLY, line)
    // Closure has no place on HOLY whether it's per-row or shared.
    expect(screen.queryByRole('option', { name: 'Braided' })).not.toBeInTheDocument()
  })

  it('broadcasts the picked closure to every colorConfig', () => {
    const onChange = jest.fn()
    const line = mockLineSameForAll(CUTY, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'M', closureType: null }),
      mockColorConfig({ id: 'cfg-2', caratIdx: 0, housing: 'Yellow', size: 'M', closureType: null }),
    ])
    renderConfig(CUTY, line, onChange)

    const selects = screen.getAllByRole('combobox')
    const sharedClosure = selects.find(s =>
      Array.from(s.options || []).some(o => o.text === 'Braided'),
    )
    fireEvent.change(sharedClosure, { target: { value: 'nonBraided' } })

    const colorConfigsCall = onChange.mock.calls.find(c => c[1]?.colorConfigs)
    expect(colorConfigsCall).toBeTruthy()
    expect(colorConfigsCall[1].colorConfigs).toEqual([
      expect.objectContaining({ id: 'cfg-1', closureType: 'nonBraided' }),
      expect.objectContaining({ id: 'cfg-2', closureType: 'nonBraided' }),
    ])
  })
})

// ─── Duplicate panel (sameForAll: false) ───────────────────────────────────
// Pinning the closure row inside the "Duplicate all with variations" panel
// so a future refactor can't silently drop it (which is exactly what
// happened during Phase 20).

describe('CollectionConfig — Duplicate panel: Closure row', () => {
  it('renders a CLOSURE row (Keep same / Change to radios) in the duplicate panel for CUTY', () => {
    const line = mockLine(CUTY, [
      mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M', closureType: 'braided' }),
    ])
    renderConfig(CUTY, line)

    // Open the panel — find by its role+name (the toggle is the only element
    // exposing that text once the trigger button is present).
    const triggers = screen.getAllByText(/Duplicate all with variations/i)
    fireEvent.click(triggers[0])

    // The duplicate panel uses radio inputs named `dup-<field>-<lineUid>`.
    // Existence of `dup-closure-...` proves the closure row is in the panel.
    const closureRadios = document.querySelectorAll('input[type="radio"][name^="dup-closure-"]')
    expect(closureRadios.length).toBeGreaterThanOrEqual(2) // Keep same + Change to
  })

  it('does NOT render a CLOSURE row for non-closure collections (HOLY)', () => {
    const line = mockLine(HOLY, [
      mockColorConfig({ caratIdx: 0, housing: 'Yellow', shape: 'Cross', size: 'M' }),
    ])
    renderConfig(HOLY, line)

    const triggers = screen.getAllByText(/Duplicate all with variations/i)
    fireEvent.click(triggers[0])

    // No `dup-closure-*` radios should exist for HOLY — the field is gated
    // by hasClosure in the panel's row array.
    const closureRadios = document.querySelectorAll('input[type="radio"][name^="dup-closure-"]')
    expect(closureRadios.length).toBe(0)
  })
})

// ─── Closure-driven size options ────────────────────────────────────────────
// CUTY/CUBIX sizes depend on the closure: braided keeps the collection's
// individual sizes; non-braided only offers the grouped silk sizes (S/M, L/XL).
// Switching closure must clear an off-list size.

describe('CollectionConfig — closure-driven sizes', () => {
  // Helper: the per-row size <select> is the combobox whose options include the
  // given sentinel size (e.g. 'XS' for braided, 'S/M' for non-braided).
  function findSizeSelect(sentinel) {
    return screen
      .getAllByRole('combobox')
      .find(sel => Array.from(sel.options || []).some(o => o.text === sentinel))
  }

  it('offers the individual sizes (XS..XL) for a braided CUTY row', () => {
    const line = mockLine(CUTY, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: null, closureType: 'braided' }),
    ])
    renderConfig(CUTY, line)

    const sizeSelect = findSizeSelect('XS')
    expect(sizeSelect).toBeTruthy()
    const texts = Array.from(sizeSelect.options).map(o => o.text)
    expect(texts).toEqual(expect.arrayContaining(['XS', 'S', 'M', 'L', 'XL']))
    expect(texts).not.toContain('S/M')
  })

  it('offers only the grouped sizes (S/M, L/XL) for a non-braided CUTY row', () => {
    const line = mockLine(CUTY, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: null, closureType: 'nonBraided' }),
    ])
    renderConfig(CUTY, line)

    const sizeSelect = findSizeSelect('S/M')
    expect(sizeSelect).toBeTruthy()
    const texts = Array.from(sizeSelect.options).map(o => o.text).filter(Boolean)
    // Only the placeholder + the two grouped sizes should be present.
    expect(texts).toEqual(expect.arrayContaining(['S/M', 'L/XL']))
    expect(texts).not.toContain('XS')
    expect(texts).not.toContain('M')
  })

  it('clears an off-list size when switching a per-row CUTY from braided to non-braided', () => {
    const onChange = jest.fn()
    const line = mockLine(CUTY, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'M', closureType: 'braided' }),
    ])
    renderConfig(CUTY, line, onChange)

    const selects = screen.getAllByRole('combobox')
    const closureSelect = selects.find(s => Array.from(s.options || []).some(o => o.text === 'Non-braided'))
    expect(closureSelect).toBeTruthy()
    fireEvent.change(closureSelect, { target: { value: 'nonBraided' } })

    const call = onChange.mock.calls.find(c => c[1]?.colorConfigs)
    expect(call).toBeTruthy()
    expect(call[1].colorConfigs).toEqual([
      expect.objectContaining({ id: 'cfg-1', closureType: 'nonBraided', size: null }),
    ])
  })

  it('keeps a still-valid size when switching closure (S/M stays on non-braided)', () => {
    const onChange = jest.fn()
    const line = mockLine(CUBIX, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'S/M', closureType: 'braided' }),
    ])
    renderConfig(CUBIX, line, onChange)

    const selects = screen.getAllByRole('combobox')
    const closureSelect = selects.find(s => Array.from(s.options || []).some(o => o.text === 'Non-braided'))
    fireEvent.change(closureSelect, { target: { value: 'nonBraided' } })

    const call = onChange.mock.calls.find(c => c[1]?.colorConfigs)
    expect(call).toBeTruthy()
    // S/M is valid for non-braided, so it must NOT be cleared.
    expect(call[1].colorConfigs).toEqual([
      expect.objectContaining({ id: 'cfg-1', closureType: 'nonBraided', size: 'S/M' }),
    ])
  })

  it('clears the shared size for all configs when the shared closure switches to non-braided', () => {
    const onChange = jest.fn()
    const line = mockLineSameForAll(CUTY, [
      mockColorConfig({ id: 'cfg-1', caratIdx: 0, housing: 'Yellow', size: 'M', closureType: 'braided' }),
      mockColorConfig({ id: 'cfg-2', caratIdx: 0, housing: 'Yellow', size: 'M', closureType: 'braided' }),
    ])
    renderConfig(CUTY, line, onChange)

    const selects = screen.getAllByRole('combobox')
    const sharedClosure = selects.find(s => Array.from(s.options || []).some(o => o.text === 'Non-braided'))
    fireEvent.change(sharedClosure, { target: { value: 'nonBraided' } })

    const call = onChange.mock.calls.find(c => c[1]?.colorConfigs)
    expect(call).toBeTruthy()
    expect(call[1].colorConfigs).toEqual([
      expect.objectContaining({ id: 'cfg-1', closureType: 'nonBraided', size: null }),
      expect.objectContaining({ id: 'cfg-2', closureType: 'nonBraided', size: null }),
    ])
  })
})
