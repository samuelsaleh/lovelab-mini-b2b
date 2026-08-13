/**
 * CollectionConfig — carat-dropdown reflects the active pricelist year
 *
 * This test pins the bug Sam reported: when the pricelist toggle is on 2025,
 * the carat dropdown for a CUTY in-house line MUST show €20/€30 (the 2025
 * PDF numbers), not €24/€34 (the 2026 PDF numbers).
 *
 * We render CollectionConfig directly with a controlled `pricelistYear` prop
 * — that's the contract BuilderPage uses, so if this passes the toggle UI
 * really is propagating the year correctly into the dropdown options.
 */

import React from 'react'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithI18n, mockColorConfig } from './testUtils'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))

const CollectionConfig = require('../CollectionConfig').default
const { COLLECTIONS } = require('@/lib/catalog')

const CUTY = COLLECTIONS.find((c) => c.id === 'CUTY')
const MNH = COLLECTIONS.find((c) => c.id === 'MNH')

function renderCarat({ pricelistYear, certType, col = CUTY }) {
  const cfg = mockColorConfig({
    caratIdx: 0,
    qty: 1,
    certType,
    colorName: 'Black',
    housing: 'Yellow',
    size: 'M',
  })
  const line = {
    uid: 'l1',
    collectionId: col.id,
    colorConfigs: [cfg],
    expanded: true,
    sameForAll: false,
    sharedSettings: {},
  }
  return renderWithI18n(
    <CollectionConfig
      line={line}
      col={col}
      onChange={jest.fn()}
      onRemove={jest.fn()}
      pricelistYear={pricelistYear}
    />,
  )
}

// Render-only assertion. We extract every <option> in the carat <select> and
// assert its label text. (We can't query by data-testid because the carat
// options share the row-level <select> element with no per-option testid.)
function caratOptionLabels() {
  // Multiple <select>s exist (cert/housing/size etc.) — find the one whose
  // first option is the carat placeholder by walking each select.
  const selects = document.querySelectorAll('select')
  for (const sel of selects) {
    const opts = Array.from(sel.options).map((o) => o.textContent || '')
    // Carat dropdown options always include the literal " ct - €" segment.
    if (opts.some((t) => / ct - €\d/.test(t))) {
      return opts.filter((t) => / ct - €/.test(t))
    }
  }
  return []
}

describe('CollectionConfig — carat dropdown reflects pricelistYear', () => {
  // CUTY in-house only exists at 0.05 and 0.10 — the other two carats
  // legitimately render as "€0" because catalog has null there. So we only
  // assert the first two options where the year actually matters.

  it('2025 + inhouse → 0.05=€20, 0.10=€30', () => {
    renderCarat({ pricelistYear: '2025', certType: 'inhouse' })
    const labels = caratOptionLabels()
    expect(labels[0]).toContain('0.05 ct - €20')
    expect(labels[1]).toContain('0.10 ct - €30')
  })

  it('2026 + inhouse → 0.05=€24, 0.10=€34', () => {
    renderCarat({ pricelistYear: '2026', certType: 'inhouse' })
    const labels = caratOptionLabels()
    expect(labels[0]).toContain('0.05 ct - €24')
    expect(labels[1]).toContain('0.10 ct - €34')
  })

  it('2025 + igi → 0.20=€65, 0.30=€90', () => {
    renderCarat({ pricelistYear: '2025', certType: 'igi' })
    const labels = caratOptionLabels()
    expect(labels[2]).toContain('0.20 ct - €65')
    expect(labels[3]).toContain('0.30 ct - €90')
  })

  it('2026 + igi → 0.20=€70, 0.30=€100', () => {
    renderCarat({ pricelistYear: '2026', certType: 'igi' })
    const labels = caratOptionLabels()
    expect(labels[2]).toContain('0.20 ct - €70')
    expect(labels[3]).toContain('0.30 ct - €100')
  })

  it('switching pricelistYear prop re-renders the dropdown options', () => {
    // Same Cert (in-house), flip the year — the dropdown text MUST change
    // synchronously. Catches any stale-state / memoization regression where
    // the dropdown silently keeps the previous year's prices.
    const cfg = mockColorConfig({
      caratIdx: 0, qty: 1, certType: 'inhouse',
      colorName: 'Black', housing: 'Yellow', size: 'M',
    })
    const line = {
      uid: 'l1', collectionId: 'CUTY',
      colorConfigs: [cfg], expanded: true, sameForAll: false, sharedSettings: {},
    }
    const { rerender } = renderWithI18n(
      <CollectionConfig
        line={line} col={CUTY}
        onChange={jest.fn()} onRemove={jest.fn()}
        pricelistYear="2026"
      />,
    )
    expect(caratOptionLabels()[0]).toContain('€24')
    rerender(
      <CollectionConfig
        line={line} col={CUTY}
        onChange={jest.fn()} onRemove={jest.fn()}
        pricelistYear="2025"
      />,
    )
    expect(caratOptionLabels()[0]).toContain('€20')
  })
})

// The October list is the first one whose SIZES differ, not just its prices.
// Moonlight Multi sells 0.20 / 0.40 on 2026 and gains 0.70 / 1.10 in October,
// so the dropdown must grow — and must never offer a size at €0.
describe('CollectionConfig — carat dropdown per-pricelist sizes', () => {
  it('2026 offers only the two sizes Moonlight Multi sells on that list', () => {
    renderCarat({ pricelistYear: '2026', certType: 'igi', col: MNH })
    const labels = caratOptionLabels()
    expect(labels).toHaveLength(2)
    expect(labels[0]).toContain('0.20 ct - €75')
    expect(labels[1]).toContain('0.40 ct - €130')
  })

  it('October offers all four sizes at the new prices', () => {
    renderCarat({ pricelistYear: '2026-10', certType: 'igi', col: MNH })
    const labels = caratOptionLabels()
    expect(labels).toHaveLength(4)
    expect(labels[0]).toContain('0.20 ct - €90')
    expect(labels[1]).toContain('0.40 ct - €150')
    expect(labels[2]).toContain('0.70 ct - €200')
    expect(labels[3]).toContain('1.10 ct - €320')
  })

  it('never offers a carat at €0 on any pricelist', () => {
    for (const year of ['2025', '2026', '2026-10']) {
      const { unmount } = renderCarat({ pricelistYear: year, certType: 'igi', col: MNH })
      for (const label of caratOptionLabels()) {
        expect(`${year}: ${label}`).not.toMatch(/- €0$/)
      }
      unmount()
    }
  })

  it('an October-only size keeps its own option value (index into col.carats)', () => {
    renderCarat({ pricelistYear: '2026-10', certType: 'igi', col: MNH })
    const select = Array.from(document.querySelectorAll('select'))
      .find((s) => Array.from(s.options).some((o) => / ct - €\d/.test(o.textContent || '')))
    const values = Array.from(select.options)
      .filter((o) => / ct - €/.test(o.textContent || ''))
      .map((o) => o.value)
    expect(values).toEqual(['0', '1', '2', '3'])
    expect(MNH.carats[2]).toBe('0.70')
  })
})
