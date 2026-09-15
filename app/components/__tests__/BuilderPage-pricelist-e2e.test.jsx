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

// Which lists are offered is covered in BuilderPage-pricelist-toggle.test.jsx;
// this harness signs in as an admin and exercises the prices.
const ADMIN = { role: 'admin', email: 'admin@example.com' }

function ParentHarness({ initialYear = '2026-10', initialLines, profile = ADMIN }) {
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

// Since 15 Sep 2026 a new order is offered October only. An order SAVED on
// 2025 or on the pre-October 2026 list reopens on that list, with the toggle
// showing it beside October — so the carat prices must follow the switch.
describe('BuilderPage e2e — an order saved on 2025 keeps its prices until moved to October', () => {
  it('reopens on 2025 → dropdown shows €20/€30 for CUTY in-house', () => {
    renderWithI18n(<ParentHarness initialYear="2025" initialLines={[makeCutyInhouseLine()]} />)
    const labels = caratOptionLabels()
    expect(labels[0]).toContain('0.05 ct - €20')
    expect(labels[1]).toContain('0.10 ct - €30')
    expect(screen.getByTestId('pricelist-toggle-2025')).toHaveAttribute('aria-checked', 'true')
  })

  it('moving it to October + confirming the modal updates the dropdown to €24/€34', () => {
    renderWithI18n(<ParentHarness initialYear="2025" initialLines={[makeCutyInhouseLine()]} />)
    expect(caratOptionLabels()[0]).toContain('€20')

    fireEvent.click(screen.getByTestId('pricelist-toggle-2026-10'))
    expect(screen.getByTestId('pricelist-switch-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pricelist-switch-confirm'))

    const labels = caratOptionLabels()
    expect(labels[0]).toContain('0.05 ct - €24')
    expect(labels[1]).toContain('0.10 ct - €34')
    // One-way: the retired list is gone once left.
    expect(screen.queryByTestId('pricelist-toggle')).not.toBeInTheDocument()
  })

  it('a new order starts on October with no toggle', () => {
    renderWithI18n(<ParentHarness initialYear="2026-10" initialLines={[makeCutyInhouseLine()]} />)
    expect(caratOptionLabels()[0]).toContain('0.05 ct - €24')
    expect(screen.queryByTestId('pricelist-toggle')).not.toBeInTheDocument()
  })
})

// The October list changes prices AND which sizes exist, so the dropdown has to
// grow when an order saved on the pre-October 2026 list is moved to October.
describe('BuilderPage e2e — moving a 2026 order to the October list', () => {
  it('reprices Moonlight Multi and reveals its new sizes', () => {
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

  it('an order reopened on October shows all four sizes and no toggle', () => {
    renderWithI18n(<ParentHarness initialYear="2026-10" initialLines={[makeMoonlightMultiLine()]} />)
    expect(caratOptionLabels()).toHaveLength(4)
    expect(screen.queryByTestId('pricelist-toggle')).not.toBeInTheDocument()
  })

  it('a classic collection reads the same on October as on 2026', () => {
    renderWithI18n(<ParentHarness initialYear="2026" initialLines={[makeCutyInhouseLine()]} />)
    const before = caratOptionLabels()

    fireEvent.click(screen.getByTestId('pricelist-toggle-2026-10'))
    fireEvent.click(screen.getByTestId('pricelist-switch-confirm'))

    expect(caratOptionLabels()).toEqual(before)
  })
})
