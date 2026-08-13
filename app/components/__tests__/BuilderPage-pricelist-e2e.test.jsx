/**
 * BuilderPage — end-to-end pricelist toggle flow
 *
 * Simulates the App.jsx-level state ownership: a parent owns pricelistYear
 * and pricelistYear-setter, mounts BuilderPage with a CUTY line that has
 * cert='inhouse' + caratIdx=0, clicks the 2025 toggle, confirms the modal,
 * and asserts that the carat dropdown text inside CollectionConfig now
 * shows €20 (the 2025 in-house number) — not €24 (the 2026 one).
 *
 * This is the contract Sam reported broken in the live app: clicking 2025
 * highlights the toggle but the carat values stay on 2026 numbers. If
 * this test passes, the React state plumbing is correct end-to-end and
 * any visual mismatch in the live app is a hot-reload / cached-bundle
 * artefact, not a code bug.
 */

import React, { useState } from 'react'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithI18n, mockColorConfig } from './testUtils'
import { resolvePricelist } from '@/lib/catalog'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))
jest.mock('@/lib/api', () => ({ sendBuilderChat: jest.fn() }))

const BuilderPage = require('../BuilderPage').default
const { mkLine } = require('../BuilderPage')
const { COLLECTIONS } = require('@/lib/catalog')
const CUTY = COLLECTIONS.find((c) => c.id === 'CUTY')
const MNH = COLLECTIONS.find((c) => c.id === 'MNH')

// The October list is offered to admins and a few granted agents only, so the
// harness signs in as an admin — the access rules are covered in
// BuilderPage-pricelist-toggle.test.jsx.
const ADMIN = { role: 'admin', email: 'admin@example.com' }

function ParentHarness({ initialYear = '2026', initialLines, profile = ADMIN }) {
  const [year, setYearRaw] = useState(initialYear)
  const setYear = (next) => setYearRaw(resolvePricelist(next))
  const [lines, setLines] = useState(initialLines)
  return (
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
      pricelistYear={year}
      setPricelistYear={setYear}
      isAdmin={profile?.role === 'admin'}
      profile={profile}
    />
  )
}

function makeCutyInhouseLine() {
  return {
    ...mkLine(),
    collectionId: CUTY.id,
    colorConfigs: [
      mockColorConfig({
        caratIdx: 0,
        qty: 1,
        certType: 'inhouse',
        colorName: 'Bordeaux',
        housing: 'Yellow',
        size: 'M',
      }),
    ],
    expanded: true,
  }
}

// Moonlight Multi at 0.40 ct — a size that exists on every list, so the line
// stays valid whichever way the toggle is flipped.
function makeMoonlightMultiLine() {
  return {
    ...mkLine(),
    collectionId: MNH.id,
    colorConfigs: [
      mockColorConfig({
        caratIdx: 1,
        qty: 2,
        certType: 'igi',
        colorName: 'Black',
        housing: 'Yellow',
        size: 'M',
      }),
    ],
    expanded: true,
  }
}

// Walk every <select> on screen and find the one whose options contain
// "ct - €" — that's a carat dropdown. Returns its option labels.
function caratOptionLabels() {
  const selects = document.querySelectorAll('select')
  for (const sel of selects) {
    const opts = Array.from(sel.options).map((o) => o.textContent || '')
    if (opts.some((t) => / ct - €\d/.test(t))) {
      return opts.filter((t) => / ct - €/.test(t))
    }
  }
  return []
}

describe('BuilderPage e2e — toggle 2026→2025 re-renders the carat dropdown', () => {
  it('starts on 2026 → dropdown shows €24/€34 for CUTY in-house', () => {
    renderWithI18n(<ParentHarness initialYear="2026" initialLines={[makeCutyInhouseLine()]} />)
    const labels = caratOptionLabels()
    expect(labels[0]).toContain('0.05 ct - €24')
    expect(labels[1]).toContain('0.10 ct - €34')
  })

  it('clicking 2025 + confirming the modal updates the dropdown to €20/€30', () => {
    renderWithI18n(<ParentHarness initialYear="2026" initialLines={[makeCutyInhouseLine()]} />)

    expect(caratOptionLabels()[0]).toContain('€24')

    fireEvent.click(screen.getByTestId('pricelist-toggle-2025'))
    expect(screen.getByTestId('pricelist-switch-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pricelist-switch-confirm'))

    const labels = caratOptionLabels()
    expect(labels[0]).toContain('0.05 ct - €20')
    expect(labels[1]).toContain('0.10 ct - €30')
  })

  it('flipping back 2025→2026 restores the 2026 numbers', () => {
    renderWithI18n(<ParentHarness initialYear="2025" initialLines={[makeCutyInhouseLine()]} />)
    expect(caratOptionLabels()[0]).toContain('€20')

    fireEvent.click(screen.getByTestId('pricelist-toggle-2026'))
    fireEvent.click(screen.getByTestId('pricelist-switch-confirm'))

    expect(caratOptionLabels()[0]).toContain('€24')
  })
})

// The October list changes prices AND which sizes exist, so the dropdown has to
// grow and shrink as the agent flips the toggle.
describe('BuilderPage e2e — toggling the October list', () => {
  it('switching 2026→October reprices Moonlight Multi and reveals its new sizes', () => {
    renderWithI18n(<ParentHarness initialYear="2026" initialLines={[makeMoonlightMultiLine()]} />)
    expect(caratOptionLabels()).toEqual([
      '0.20 ct - €75',
      '0.40 ct - €130',
    ])

    fireEvent.click(screen.getByTestId('pricelist-toggle-2026-10'))
    expect(screen.getByTestId('pricelist-switch-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pricelist-switch-confirm'))

    expect(caratOptionLabels()).toEqual([
      '0.20 ct - €90',
      '0.40 ct - €150',
      '0.70 ct - €200',
      '1.10 ct - €320',
    ])
  })

  it('switching October→2026 hides the sizes 2026 does not sell', () => {
    renderWithI18n(<ParentHarness initialYear="2026-10" initialLines={[makeMoonlightMultiLine()]} />)
    expect(caratOptionLabels()).toHaveLength(4)

    fireEvent.click(screen.getByTestId('pricelist-toggle-2026'))
    fireEvent.click(screen.getByTestId('pricelist-switch-confirm'))

    expect(caratOptionLabels()).toEqual([
      '0.20 ct - €75',
      '0.40 ct - €130',
    ])
  })

  it('a classic collection reads the same on October as on 2026', () => {
    renderWithI18n(<ParentHarness initialYear="2026" initialLines={[makeCutyInhouseLine()]} />)
    const before = caratOptionLabels()

    fireEvent.click(screen.getByTestId('pricelist-toggle-2026-10'))
    fireEvent.click(screen.getByTestId('pricelist-switch-confirm'))

    expect(caratOptionLabels()).toEqual(before)
  })
})
