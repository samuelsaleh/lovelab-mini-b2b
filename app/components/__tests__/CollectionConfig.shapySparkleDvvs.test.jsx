/**
 * CollectionConfig — Shapy Sparkle D VVS (SSRD).
 *
 * The cert is a label that follows the carat (not a picker). Housing is a
 * real Prong | Bezel select. Long Cushion is not offered.
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
const SSRD = COLLECTIONS.find(c => c.id === 'SSRD')

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
      certType: null, closureType: null, qty: null,
    },
    ...overrides,
  }
}

function renderConfig(col, line, onChange = jest.fn()) {
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
    />
  )
}

function selectContaining(sentinel) {
  return screen
    .getAllByRole('combobox')
    .find(sel => Array.from(sel.options || []).some(o => o.text.includes(sentinel)))
}

function optionTexts(select) {
  return Array.from(select.options).map(o => o.text).filter(Boolean)
}

function rowAt(caratIdx, extra = {}) {
  return mockColorConfig({
    id: 'cfg-1',
    caratIdx,
    housing: 'Prong',
    shape: 'Round',
    size: 'S/M',
    ...extra,
  })
}

describe('CollectionConfig — SHAPY SPARKLE D VVS', () => {
  it('shows the new label', () => {
    renderConfig(SSRD, mockLine(SSRD, [rowAt(0)]))
    expect(screen.getByText('SHAPY SPARKLE D VVS')).toBeInTheDocument()
  })

  it('offers Prong and Bezel as a required housing pick', () => {
    renderConfig(SSRD, mockLine(SSRD, [rowAt(0, { housing: null })]))
    const housing = selectContaining('Prong')
    expect(housing).toBeTruthy()
    expect(optionTexts(housing)).toEqual(expect.arrayContaining(['Prong', 'Bezel']))
  })

  it('does not offer Long Cushion', () => {
    renderConfig(SSRD, mockLine(SSRD, [rowAt(0)]))
    const shape = selectContaining('Round')
    expect(shape).toBeTruthy()
    expect(optionTexts(shape)).not.toContain('Long Cushion')
    expect(optionTexts(shape)).toEqual(expect.arrayContaining(['Round', 'Pear', 'Cushion']))
  })

  it('shows In-house as a label at 0.50, not a picker', () => {
    renderConfig(SSRD, mockLine(SSRD, [rowAt(0)]))
    expect(screen.getByText('In-house')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'IGI' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'In-house' })).not.toBeInTheDocument()
  })

  it('shows IGI as a label at 1.00', () => {
    renderConfig(SSRD, mockLine(SSRD, [rowAt(2, { certType: 'igi' })]))
    expect(screen.getByText('IGI')).toBeInTheDocument()
    expect(screen.queryByText('In-house')).not.toBeInTheDocument()
  })

  it('re-resolves the cert label when the carat changes to 1.00', () => {
    const onChange = jest.fn()
    renderConfig(SSRD, mockLine(SSRD, [rowAt(0, { certType: 'inhouse' })]), onChange)

    const carat = selectContaining('0.50 ct')
    fireEvent.change(carat, { target: { value: '2' } })

    const call = onChange.mock.calls.find(c => c[1]?.colorConfigs)
    expect(call[1].colorConfigs[0].caratIdx).toBe(2)
    expect(call[1].colorConfigs[0].certType).toBe('igi')
  })
})
