/**
 * CollectionConfig — Shapy Shine rules in the builder (BVB list 1.1 + 1.2).
 *
 * Covers what an agent can actually pick on screen:
 *   - 0.10 ct offers Bezel Yellow / Bezel White only — no prong, no Pink
 *   - 0.10 ct hides Cushion from the shape dropdown
 *   - 0.30 / 0.50 ct offer both settings and every shape
 *   - no braided / non-braided picker anywhere (Shapy Shine is braided-only)
 *   - moving a row down to 0.10 drops a shape / setting it no longer sells
 *   - rows restored from an order saved as non-braided get normalised
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
const SSF = COLLECTIONS.find(c => c.id === 'SSF')

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

// The dropdowns have no accessible labels, so identify each by a sentinel
// option only it can contain.
function selectContaining(sentinel) {
  return screen
    .getAllByRole('combobox')
    .find(sel => Array.from(sel.options || []).some(o => o.text === sentinel))
}

function optionTexts(select) {
  return Array.from(select.options).map(o => o.text).filter(Boolean)
}

// A Shapy Shine row at the given carat, already far enough along that the shape
// dropdown is unlocked (it needs a housing before it renders).
function rowAt(caratIdx, extra = {}) {
  return mockColorConfig({
    id: 'cfg-1',
    caratIdx,
    housing: caratIdx === 0 ? 'Bezel Yellow' : 'Prong Yellow',
    housingType: caratIdx === 0 ? 'bezel' : 'prong',
    shape: null,
    size: 'M',
    closureType: 'braided',
    ...extra,
  })
}

describe('CollectionConfig — Shapy Shine housing at 0.10 ct', () => {
  it('offers Bezel Yellow / Bezel White only (no prong, no Pink)', () => {
    renderConfig(SSF, mockLine(SSF, [rowAt(0)]))

    const housing = selectContaining('Bezel Yellow')
    expect(housing).toBeTruthy()
    expect(optionTexts(housing)).toEqual(expect.arrayContaining(['Bezel Yellow', 'Bezel White']))
    expect(optionTexts(housing).join(' ')).not.toMatch(/Pink/)
    expect(optionTexts(housing).join(' ')).not.toMatch(/Prong/)
  })

  it('renders no bezel/prong type selector at all at 0.10 ct', () => {
    renderConfig(SSF, mockLine(SSF, [rowAt(0)]))
    expect(screen.queryByRole('option', { name: 'Prongs' })).not.toBeInTheDocument()
  })

  it('offers both settings at 0.30 ct, still without Pink', () => {
    renderConfig(SSF, mockLine(SSF, [rowAt(1)]))

    const typeSelect = selectContaining('Prongs')
    expect(typeSelect).toBeTruthy()
    expect(optionTexts(typeSelect)).toEqual(expect.arrayContaining(['Bezel', 'Prongs']))

    const metal = selectContaining('Yellow')
    expect(optionTexts(metal)).toEqual(expect.arrayContaining(['Yellow', 'White']))
    expect(optionTexts(metal)).not.toContain('Pink')
  })
})

describe('CollectionConfig — Shapy Shine shapes per carat', () => {
  it('hides Cushion at 0.10 ct', () => {
    renderConfig(SSF, mockLine(SSF, [rowAt(0)]))

    const shape = selectContaining('Marquise')
    expect(shape).toBeTruthy()
    const texts = optionTexts(shape)
    expect(texts).toEqual(expect.arrayContaining(['Heart', 'Pear', 'Marquise', 'Oval', 'Emerald']))
    expect(texts).not.toContain('Cushion')
    expect(texts).not.toContain('Long Cushion')
  })

  it('offers Cushion at 0.30 ct but never Long Cushion', () => {
    renderConfig(SSF, mockLine(SSF, [rowAt(1)]))

    const shape = selectContaining('Cushion')
    expect(shape).toBeTruthy()
    expect(optionTexts(shape)).toEqual(expect.arrayContaining([
      'Heart', 'Pear', 'Marquise', 'Oval', 'Emerald', 'Cushion',
    ]))
    expect(optionTexts(shape)).not.toContain('Long Cushion')
  })

  it('drops a Cushion shape and the prong setting when the row moves down to 0.10', () => {
    const onChange = jest.fn()
    const line = mockLine(SSF, [rowAt(1, { shape: 'Cushion' })])
    renderConfig(SSF, line, onChange)

    const carat = selectContaining('0.10 ct - €55')
    expect(carat).toBeTruthy()
    fireEvent.change(carat, { target: { value: '0' } })

    const call = onChange.mock.calls.find(c => c[1]?.colorConfigs)
    expect(call).toBeTruthy()
    expect(call[1].colorConfigs).toEqual([
      expect.objectContaining({
        id: 'cfg-1',
        caratIdx: 0,
        shape: null,
        housingType: 'bezel',
        housing: null,
      }),
    ])
  })

  // Duplicating into another carat is the one path that carries a shape /
  // housing across sizes (the carat dropdown deliberately clears them), so it's
  // where the 0.10 rules have to hold.
  describe('duplicating a row into 0.10 ct', () => {
    function duplicateIntoSmallCarat(sourceCfg) {
      const onChange = jest.fn()
      renderConfig(SSF, mockLine(SSF, [sourceCfg]), onChange)

      fireEvent.click(screen.getAllByText(/Duplicate all with variations/i)[0])
      // Flip CARAT to "Change to", pick 0.10, then confirm.
      const caratRadios = document.querySelectorAll('input[type="radio"][name="dup-carat-line-1"]')
      fireEvent.click(caratRadios[1])
      fireEvent.change(selectContaining('0.10 ct - €55'), { target: { value: '0' } })
      fireEvent.click(screen.getByRole('button', { name: '+ Duplicate 1 colors' }))

      // The closure normalisation effect also emits colorConfigs, so take the
      // most recent call — the one the Duplicate button produced.
      const calls = onChange.mock.calls.filter(c => c[1]?.colorConfigs)
      expect(calls.length).toBeGreaterThan(0)
      const configs = calls[calls.length - 1][1].colorConfigs
      // The original row is kept, the copy is appended.
      expect(configs).toHaveLength(2)
      return configs[1]
    }

    it('keeps a shape that 0.10 still sells', () => {
      const copy = duplicateIntoSmallCarat(
        rowAt(1, { shape: 'Pear', housing: 'Bezel White', housingType: 'bezel' }),
      )
      expect(copy).toEqual(expect.objectContaining({
        caratIdx: 0, shape: 'Pear', housing: 'Bezel White', housingType: 'bezel',
      }))
    })

    it('drops a Cushion shape that 0.10 does not sell', () => {
      const copy = duplicateIntoSmallCarat(
        rowAt(1, { shape: 'Cushion', housing: 'Bezel White', housingType: 'bezel' }),
      )
      expect(copy).toEqual(expect.objectContaining({ caratIdx: 0, shape: null }))
    })

    it('forces a prong setting to bezel', () => {
      const copy = duplicateIntoSmallCarat(
        rowAt(1, { shape: 'Pear', housing: 'Prong Yellow', housingType: 'prong' }),
      )
      expect(copy).toEqual(expect.objectContaining({
        caratIdx: 0, housingType: 'bezel', housing: null,
      }))
    })

    it('drops a Pink bezel carried over from an old order', () => {
      const copy = duplicateIntoSmallCarat(
        rowAt(1, { shape: 'Pear', housing: 'Bezel Pink', housingType: 'bezel' }),
      )
      expect(copy).toEqual(expect.objectContaining({
        caratIdx: 0, housingType: 'bezel', housing: null,
      }))
    })

    it('always carries braided onto the copy', () => {
      const copy = duplicateIntoSmallCarat(
        rowAt(1, { shape: 'Pear', housing: 'Bezel White', housingType: 'bezel', closureType: 'nonBraided' }),
      )
      expect(copy.closureType).toBe('braided')
    })
  })
})

describe('CollectionConfig — Shapy Shine is braided only', () => {
  it('renders no Closure column and no braided/non-braided options', () => {
    renderConfig(SSF, mockLine(SSF, [rowAt(1, { shape: 'Pear' })]))
    expect(screen.queryByText('Closure')).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Braided' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Non-braided' })).not.toBeInTheDocument()
  })

  it('renders no closure row in the duplicate panel', () => {
    renderConfig(SSF, mockLine(SSF, [rowAt(1, { shape: 'Pear' })]))
    fireEvent.click(screen.getAllByText(/Duplicate all with variations/i)[0])
    expect(document.querySelectorAll('input[type="radio"][name^="dup-closure-"]')).toHaveLength(0)
  })

  it('normalises a row saved as non-braided back to braided', () => {
    const onChange = jest.fn()
    const line = mockLine(SSF, [rowAt(1, { shape: 'Pear', closureType: 'nonBraided' })])
    renderConfig(SSF, line, onChange)

    const call = onChange.mock.calls.find(c => c[1]?.colorConfigs)
    expect(call).toBeTruthy()
    expect(call[1].colorConfigs).toEqual([
      expect.objectContaining({ id: 'cfg-1', closureType: 'braided' }),
    ])
  })

  it('stamps braided onto a row that carries no closure at all', () => {
    const onChange = jest.fn()
    const line = mockLine(SSF, [rowAt(1, { shape: 'Pear', closureType: null })])
    renderConfig(SSF, line, onChange)

    const call = onChange.mock.calls.find(c => c[1]?.colorConfigs)
    expect(call[1].colorConfigs).toEqual([
      expect.objectContaining({ id: 'cfg-1', closureType: 'braided' }),
    ])
  })

  it('leaves an already-braided row untouched (no render loop)', () => {
    const onChange = jest.fn()
    const line = mockLine(SSF, [rowAt(1, { shape: 'Pear', closureType: 'braided' })])
    renderConfig(SSF, line, onChange)

    const closureCalls = onChange.mock.calls.filter(c =>
      c[1]?.colorConfigs?.some(cfg => cfg.closureType === 'braided'),
    )
    expect(closureCalls).toHaveLength(0)
  })

  it('still offers the full XS–XL size range', () => {
    renderConfig(SSF, mockLine(SSF, [rowAt(1, { shape: 'Pear', size: null })]))

    const size = selectContaining('XS')
    expect(size).toBeTruthy()
    expect(optionTexts(size)).toEqual(expect.arrayContaining(['XS', 'S', 'M', 'L', 'XL']))
    expect(optionTexts(size)).not.toContain('S/M')
  })
})
