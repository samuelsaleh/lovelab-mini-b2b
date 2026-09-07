/**
 * Riviera Four in the Builder — the closure picker and the sizes it drives.
 *
 * What an agent sees on the card: pick a colour, the row starts as
 * Non-braided with S/M · L/XL; switch to Braided and the sizes become
 * S · M · L; the thread stays Thin throughout.
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

function renderConfig(line, onChange = jest.fn()) {
  return renderWithI18n(
    <CollectionConfig
      line={line} col={RIV4} onChange={onChange} onRemove={jest.fn()}
      selectedConfigs={new Set()} onToggleConfigSelect={jest.fn()} onToggleLineSelect={jest.fn()}
      recentlyDuplicated={new Set()}
    />,
  )
}

const selectWithOption = (text) =>
  screen.getAllByRole('combobox').find((sel) => Array.from(sel.options || []).some((o) => o.text === text))

const optionTexts = (sel) => Array.from(sel.options).map((o) => o.text).filter(Boolean)

describe('Riviera Four — closure in the Builder', () => {
  test('a newly added colour starts as Non-braided', () => {
    const onChange = jest.fn()
    renderConfig(mockLine(RIV4), onChange)
    // Silk needs a thickness first; Iconix is Thin-only so pick it.
    fireEvent.click(screen.getByText('Thin'))
    fireEvent.click(screen.getByTitle('Silver grey'))
    const cfg = onChange.mock.calls.at(-1)[1].colorConfigs[0]
    expect(cfg.closureType).toBe('nonBraided')
    expect(cfg.thickness).toBe('Thin')
  })

  test('shows the Closure column with both choices', () => {
    renderConfig(mockLine(RIV4, [
      mockColorConfig({ id: 'c1', caratIdx: 0, housing: 'White', size: 'S/M', thickness: 'Thin', cordType: 'silk', closureType: 'nonBraided' }),
    ]))
    expect(screen.getByText('Closure')).toBeInTheDocument()
    const closure = selectWithOption('Braided')
    expect(optionTexts(closure)).toEqual(expect.arrayContaining(['Braided', 'Non-braided']))
  })

  test('non-braided offers S/M · L/XL', () => {
    renderConfig(mockLine(RIV4, [
      mockColorConfig({ id: 'c1', caratIdx: 0, housing: 'White', size: 'S/M', thickness: 'Thin', cordType: 'silk', closureType: 'nonBraided' }),
    ]))
    const size = selectWithOption('S/M')
    expect(optionTexts(size)).toEqual(expect.arrayContaining(['S/M', 'L/XL']))
    expect(optionTexts(size)).not.toContain('M')
  })

  test('braided offers S · M · L', () => {
    renderConfig(mockLine(RIV4, [
      mockColorConfig({ id: 'c1', caratIdx: 0, housing: 'White', size: 'M', thickness: 'Thin', cordType: 'silk', closureType: 'braided' }),
    ]))
    const size = selectWithOption('M')
    expect(optionTexts(size).filter((t) => ['XS', 'S', 'M', 'L', 'XL', 'S/M', 'L/XL'].includes(t))).toEqual(['S', 'M', 'L'])
  })

  test('switching to braided drops a grouped size that no longer applies', () => {
    const onChange = jest.fn()
    renderConfig(mockLine(RIV4, [
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
    renderConfig(mockLine(RIV4, [
      mockColorConfig({ id: 'c1', caratIdx: 0, housing: 'White', size: 'S/M', thickness: 'Thin', cordType: 'silk', closureType: null }),
    ]))
    expect(screen.getByText(/1\/1 complete/i)).toBeInTheDocument()
  })
})
