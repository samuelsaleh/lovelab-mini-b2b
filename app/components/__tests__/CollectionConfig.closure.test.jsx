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
