/**
 * applyPack — MATCHY prong housing normalization.
 *
 * Legacy pack sheets (incl. the seed "Pack 2" in Supabase) wrote MATCHY prong
 * same-metal pairs with the bezel-style codes (WW/YY/PP), which are not valid
 * prong options in the catalog — the housing dropdown rendered blank after
 * applying such a pack. applyPack now normalizes those codes to the prong
 * names (White/Yellow/Pink), while the mixed pairs (WY/WP/YP) pass through
 * since they are now first-class prong options.
 */

import React from 'react'
import { screen, fireEvent, act, within } from '@testing-library/react'
import { renderWithI18n } from './testUtils'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))

jest.mock('@/lib/api', () => ({
  sendBuilderChat: jest.fn(),
}))

const BuilderPage = require('../BuilderPage').default

const LEGACY_MATCHY_PACK = {
  id: 'db-pack-legacy',
  label: 'Legacy Matchy Pack',
  scope: 'global',
  is_seed: true,
  description: ['MATCHY FANCY — legacy prong codes'],
  budget_label: '€200 – €310/bracelet',
  fixed_total: 1220,
  form_rows: [
    // Legacy same-metal pair codes under Prong → must normalize to catalog names.
    { collection: 'MATCHY FANCY', carat: '1.00', shape: 'Pear', bpColor: 'YY', setting: 'Prong', size: 'M', colorCord: 'Bordeaux', quantity: '1', unitPrice: '310', cert: 'IGI' },
    { collection: 'MATCHY FANCY', carat: '0.60', shape: 'Emerald', bpColor: 'WW', setting: 'Prong', size: 'M', colorCord: 'Black', quantity: '1', unitPrice: '200', cert: 'IGI' },
    // Already-valid values must pass through untouched.
    { collection: 'MATCHY FANCY', carat: '0.60', shape: 'Emerald', bpColor: 'White', setting: 'Prong', size: 'M', colorCord: 'Navy Blue', quantity: '1', unitPrice: '200', cert: 'IGI' },
    { collection: 'MATCHY FANCY', carat: '0.60', shape: 'Heart', bpColor: 'WY', setting: 'Prong', size: 'M', colorCord: 'Red', quantity: '1', unitPrice: '200', cert: 'IGI' },
    { collection: 'MATCHY FANCY', carat: '0.60', shape: 'Heart', bpColor: 'WY', setting: 'Bezel', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '200', cert: 'IGI' },
  ],
}

function renderBuilder(lines, setLines = jest.fn()) {
  return renderWithI18n(
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
    />
  )
}

describe('BuilderPage — applyPack MATCHY prong normalization', () => {
  let originalFetch
  beforeEach(() => {
    originalFetch = global.fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ packs: [LEGACY_MATCHY_PACK] }),
    })
  })
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('normalizes legacy WW/YY prong codes and keeps valid pairs untouched', async () => {
    const setLines = jest.fn()
    renderBuilder([], setLines)

    fireEvent.click(screen.getByText('Packs').closest('button'))
    const labelEl = await screen.findByText('Legacy Matchy Pack')
    const card = labelEl.parentElement.parentElement
    act(() => { fireEvent.click(within(card).getByText('+ Add pack')) })

    expect(setLines).toHaveBeenCalled()
    const updater = setLines.mock.calls[setLines.mock.calls.length - 1][0]
    const newLines = typeof updater === 'function' ? updater([]) : updater
    const mfLine = newLines.find(l => l.collectionId === 'MF')
    expect(mfLine).toBeTruthy()

    const housings = mfLine.colorConfigs.map(c => c.housing)
    expect(housings).toEqual([
      'Prong Yellow',  // YY normalized
      'Prong White',   // WW normalized
      'Prong White',   // already valid
      'Prong WY',      // mixed pair passes through
      'Bezel WY',      // bezel untouched
    ])
    // Every restored housing must be selectable in the builder dropdown.
    const { HOUSING } = require('@/lib/catalog')
    const validValues = [
      ...HOUSING.matchyBezel.map(h => `Bezel ${h.label}`),
      ...HOUSING.matchyProng.map(h => `Prong ${h.label}`),
    ]
    housings.forEach(h => expect(validValues).toContain(h))
  })
})
