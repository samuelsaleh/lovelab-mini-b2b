/**
 * Iconix silk in the Builder — the closure picker and the sizes it drives.
 *
 * Flower Heart keeps the choice: pick a colour, the row starts as Non-braided
 * with S/M · L/XL; switch to Braided and the sizes become S · M · L.
 *
 * Riviera Four is braided-only (Sam, Sep 2026): no Closure column at all, every
 * colour starts braided with S · M · L, and a row saved while non-braided was
 * still on offer is normalised to braided and loses its grouped size.
 *
 * The thread stays Thin throughout.
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
const RIV4 = COLLECTIONS.find((c) => c.id === 'RIV4')
const LUVA = COLLECTIONS.find((c) => c.id === 'LUVA')
const CollectionConfig = require('../CollectionConfig').default

function mockLine(col, configs = []) {
  return {
    uid: 'line-1', collectionId: col.id, colorConfigs: configs, expanded: true, sameForAll: false,
    sharedSettings: {
      caratIdx: null, housing: null, housingType: null, multiAttached: null,
      shape: null, size: null, cordType: null, thickness: null, closureType: null, qty: null,
    },
  }
}

function renderConfig(col, line, onChange = jest.fn()) {
  return renderWithI18n(
    <CollectionConfig
      line={line} col={col} onChange={onChange} onRemove={jest.fn()}
      selectedConfigs={new Set()} onToggleConfigSelect={jest.fn()} onToggleLineSelect={jest.fn()}
      recentlyDuplicated={new Set()}
    />,
  )
}

const selectWithOption = (text) =>
  screen.getAllByRole('combobox').find((sel) => Array.from(sel.options || []).some((o) => o.text === text))

const optionTexts = (sel) => Array.from(sel.options).map((o) => o.text).filter(Boolean)
const sizeLike = (t) => ['XS', 'S', 'M', 'L', 'XL', 'S/M', 'L/XL'].includes(t)

describe('Flower Heart — closure in the Builder', () => {
  test('a newly added colour starts as Non-braided', () => {
    const onChange = jest.fn()
    renderConfig(LUVA, mockLine(LUVA), onChange)
    // Silk needs a thickness first; Iconix is Thin-only so pick it.
    fireEvent.click(screen.getByText('Thin'))
    fireEvent.click(screen.getByTitle('Silver grey'))
    const cfg = onChange.mock.calls.at(-1)[1].colorConfigs[0]
    expect(cfg.closureType).toBe('nonBraided')
    expect(cfg.thickness).toBe('Thin')
  })

  test('shows the Closure column with both choices', () => {
    renderConfig(LUVA, mockLine(LUVA, [
      mockColorConfig({ id: 'c1', caratIdx: 0, housing: 'White', size: 'S/M', thickness: 'Thin', cordType: 'silk', closureType: 'nonBraided' }),
    ]))
    expect(screen.getByText('Closure')).toBeInTheDocument()
    const closure = selectWithOption('Braided')
    expect(optionTexts(closure)).toEqual(expect.arrayContaining(['Braided', 'Non-braided']))
  })

  test('non-braided offers S/M · L/XL', () => {
    renderConfig(LUVA, mockLine(LUVA, [
      mockColorConfig({ id: 'c1', caratIdx: 0, housing: 'White', size: 'S/M', thickness: 'Thin', cordType: 'silk', closureType: 'nonBraided' }),
    ]))
    const size = selectWithOption('S/M')
    expect(optionTexts(size)).toEqual(expect.arrayContaining(['S/M', 'L/XL']))
    expect(optionTexts(size)).not.toContain('M')
  })

  test('braided offers S · M · L', () => {
    renderConfig(LUVA, mockLine(LUVA, [
      mockColorConfig({ id: 'c1', caratIdx: 0, housing: 'White', size: 'M', thickness: 'Thin', cordType: 'silk', closureType: 'braided' }),
    ]))
    const size = selectWithOption('M')
    expect(optionTexts(size).filter(sizeLike)).toEqual(['S', 'M', 'L'])
  })

  test('switching to braided drops a grouped size that no longer applies', () => {
    const onChange = jest.fn()
    renderConfig(LUVA, mockLine(LUVA, [
      mockColorConfig({ id: 'c1', caratIdx: 0, housing: 'White', size: 'S/M', thickness: 'Thin', cordType: 'silk', closureType: 'nonBraided' }),
    ]), onChange)
    fireEvent.change(selectWithOption('Braided'), { target: { value: 'braided' } })
    const cfg = onChange.mock.calls.at(-1)[1].colorConfigs[0]
    expect(cfg.closureType).toBe('braided')
    expect(cfg.size).toBeNull()
  })

  test('a row saved before closures existed still counts as complete', () => {
    // Old Iconix rows have no closureType; the default resolves it, so the
    // completion counter must not suddenly report old orders as unfinished.
    renderConfig(LUVA, mockLine(LUVA, [
      mockColorConfig({ id: 'c1', caratIdx: 0, housing: 'White', size: 'S/M', thickness: 'Thin', cordType: 'silk', closureType: null }),
    ]))
    expect(screen.getByText(/1\/1 complete/i)).toBeInTheDocument()
  })
})

describe('Riviera Four — braided only in the Builder', () => {
  test('a newly added colour starts Braided', () => {
    const onChange = jest.fn()
    renderConfig(RIV4, mockLine(RIV4), onChange)
    fireEvent.click(screen.getByText('Thin'))
    fireEvent.click(screen.getByTitle('Silver grey'))
    const cfg = onChange.mock.calls.at(-1)[1].colorConfigs[0]
    expect(cfg.closureType).toBe('braided')
    expect(cfg.thickness).toBe('Thin')
  })

  test('has no Closure column and no Non-braided option anywhere', () => {
    renderConfig(RIV4, mockLine(RIV4, [
      mockColorConfig({ id: 'c1', caratIdx: 0, housing: 'White', size: 'M', thickness: 'Thin', cordType: 'silk', closureType: 'braided' }),
    ]))
    expect(screen.queryByText('Closure')).not.toBeInTheDocument()
    expect(selectWithOption('Non-braided')).toBeUndefined()
    expect(selectWithOption('Braided')).toBeUndefined()
  })

  test('sizes are S · M · L — never the grouped silk pair', () => {
    renderConfig(RIV4, mockLine(RIV4, [
      mockColorConfig({ id: 'c1', caratIdx: 0, housing: 'White', size: 'M', thickness: 'Thin', cordType: 'silk', closureType: 'braided' }),
    ]))
    const size = selectWithOption('M')
    expect(optionTexts(size).filter(sizeLike)).toEqual(['S', 'M', 'L'])
    expect(optionTexts(size)).not.toContain('S/M')
    expect(optionTexts(size)).not.toContain('L/XL')
  })

  test('a row saved as non-braided is pinned to braided and loses its S/M size', () => {
    const onChange = jest.fn()
    renderConfig(RIV4, mockLine(RIV4, [
      mockColorConfig({ id: 'c1', caratIdx: 0, housing: 'White', size: 'S/M', thickness: 'Thin', cordType: 'silk', closureType: 'nonBraided' }),
    ]), onChange)
    const cfg = onChange.mock.calls.at(-1)[1].colorConfigs[0]
    expect(cfg.closureType).toBe('braided')
    expect(cfg.size).toBeNull()
  })

  test('a row saved as non-braided keeps a size braided also offers', () => {
    // 'M' was never a non-braided size, but a row could carry it after a
    // collection switch; nothing to drop, only the closure moves.
    const onChange = jest.fn()
    renderConfig(RIV4, mockLine(RIV4, [
      mockColorConfig({ id: 'c1', caratIdx: 0, housing: 'White', size: 'M', thickness: 'Thin', cordType: 'silk', closureType: 'nonBraided' }),
    ]), onChange)
    const cfg = onChange.mock.calls.at(-1)[1].colorConfigs[0]
    expect(cfg.closureType).toBe('braided')
    expect(cfg.size).toBe('M')
  })

  test('a braided row with a valid size counts as complete', () => {
    renderConfig(RIV4, mockLine(RIV4, [
      mockColorConfig({ id: 'c1', caratIdx: 0, housing: 'White', size: 'M', thickness: 'Thin', cordType: 'silk', closureType: 'braided' }),
    ]))
    expect(screen.getByText(/1\/1 complete/i)).toBeInTheDocument()
  })
})
