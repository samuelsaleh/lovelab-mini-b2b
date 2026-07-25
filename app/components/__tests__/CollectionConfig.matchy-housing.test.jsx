/**
 * MATCHY housing selector tests.
 *
 * MATCHY FANCY carries two diamonds, so the housing is a metal PAIR in both
 * settings. Bezel uses pair codes (WW..YP); Prong keeps the legacy single
 * names for same-metal pairs (White/Yellow/Pink) and offers the mixed pairs
 * (WY/WP/YP) too — a client asked for "white with yellow together" on prong
 * and the option didn't exist.
 *
 * Covers:
 *   - Bezel dropdown lists all 6 pair codes; selecting "Bezel WY" patches housing
 *   - Prong dropdown lists White/Yellow/Pink + WY/WP/YP; selecting "Prong WY" patches housing
 *   - Same behaviour on the MATCHY FANCY NECKLACE (same housing config)
 *   - Duplicate-with-variations panel offers the mixed prong pairs as well
 */

import React from 'react'
import { screen, fireEvent, within } from '@testing-library/react'
import { renderWithI18n, mockColorConfig } from './testUtils'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))

const { COLLECTIONS } = require('@/lib/catalog')
const MF = COLLECTIONS.find(c => c.id === 'MF')
const MF_NECK = COLLECTIONS.find(c => c.id === 'MF_NECK')

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
      multiAttached: null, shape: null, size: null, cordType: null, thickness: null, qty: null,
    },
    ...overrides,
  }
}

function renderConfig(col, line, onChange = jest.fn(), extraProps = {}) {
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
      {...extraProps}
    />
  )
}

function findHousingSelect(optionName) {
  return screen.getAllByRole('combobox').find(s =>
    within(s).queryByRole('option', { name: optionName })
  )
}

describe('MATCHY housing — bezel pairs', () => {
  it('lists all 6 bezel pair codes and selecting WY patches the config', () => {
    const onChange = jest.fn()
    const line = mockLine(MF, [
      mockColorConfig({ id: 'cfg-1', colorName: 'Red', caratIdx: 0, housing: null, housingType: 'bezel', qty: 1 }),
    ])
    renderConfig(MF, line, onChange)

    const housingSelect = findHousingSelect('WW')
    expect(housingSelect).toBeTruthy()
    const values = Array.from(housingSelect.options).map(o => o.value)
    expect(values).toEqual(expect.arrayContaining([
      'Bezel WW', 'Bezel YY', 'Bezel PP', 'Bezel WY', 'Bezel WP', 'Bezel YP',
    ]))

    fireEvent.change(housingSelect, { target: { value: 'Bezel WY' } })
    const call = onChange.mock.calls[onChange.mock.calls.length - 1]
    expect(call[1].colorConfigs[0].housing).toBe('Bezel WY')
  })
})

describe('MATCHY housing — prong pairs', () => {
  it('lists single metals AND mixed pairs; selecting WY patches the config', () => {
    const onChange = jest.fn()
    const line = mockLine(MF, [
      mockColorConfig({ id: 'cfg-1', colorName: 'Red', caratIdx: 0, housing: null, housingType: 'prong', qty: 1 }),
    ])
    renderConfig(MF, line, onChange)

    const housingSelect = findHousingSelect('WY')
    expect(housingSelect).toBeTruthy()
    const values = Array.from(housingSelect.options).map(o => o.value)
    expect(values).toEqual(expect.arrayContaining([
      'Prong White', 'Prong Yellow', 'Prong Pink',
      'Prong WY', 'Prong WP', 'Prong YP',
    ]))

    fireEvent.change(housingSelect, { target: { value: 'Prong WY' } })
    const call = onChange.mock.calls[onChange.mock.calls.length - 1]
    expect(call[1].colorConfigs[0].housing).toBe('Prong WY')
  })

  it('legacy single-metal prong values still render as the selected option', () => {
    const line = mockLine(MF, [
      mockColorConfig({ id: 'cfg-1', colorName: 'Red', caratIdx: 0, housing: 'Prong Yellow', housingType: 'prong', qty: 1 }),
    ])
    renderConfig(MF, line)
    const housingSelect = screen.getAllByRole('combobox').find(s =>
      Array.from(s.options).some(o => o.value === 'Prong Yellow')
    )
    expect(housingSelect.value).toBe('Prong Yellow')
  })

  it('MATCHY FANCY NECKLACE offers the same mixed prong pairs', () => {
    const line = mockLine(MF_NECK, [
      mockColorConfig({ id: 'cfg-1', colorName: 'Red', caratIdx: 0, housing: null, housingType: 'prong', size: null, qty: 1 }),
    ])
    renderConfig(MF_NECK, line)
    const housingSelect = findHousingSelect('WY')
    expect(housingSelect).toBeTruthy()
    const values = Array.from(housingSelect.options).map(o => o.value)
    expect(values).toEqual(expect.arrayContaining(['Prong WY', 'Prong WP', 'Prong YP']))
  })
})

describe('MATCHY housing — duplicate-with-variations panel', () => {
  it('the prong housing variation select offers the mixed pairs', () => {
    const line = mockLine(MF, [
      mockColorConfig({ id: 'cfg-1', colorName: 'Red', caratIdx: 0, housing: 'Prong White', housingType: 'prong', shape: 'Heart', size: 'M', qty: 1 }),
    ])
    renderConfig(MF, line)

    fireEvent.click(screen.getByText(/Duplicate all with variations/i))

    const housingRow = document.querySelector('[data-field="housing"]')
    expect(housingRow).toBeTruthy()
    fireEvent.click(within(housingRow).getByRole('radio', { name: /change to/i }))

    // First pick the setting (bezel/prong), then the pair select appears.
    const typeSelect = within(housingRow).getAllByRole('combobox')[0]
    fireEvent.change(typeSelect, { target: { value: 'prong' } })

    const pairSelect = within(housingRow).getAllByRole('combobox')[1]
    const values = Array.from(pairSelect.options).map(o => o.value)
    expect(values).toEqual(expect.arrayContaining(['Prong White', 'Prong WY', 'Prong WP', 'Prong YP']))
  })
})
