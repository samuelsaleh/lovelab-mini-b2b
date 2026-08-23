/**
 * BuilderPage — selection grid shows ONE general card per collection
 *
 * Sam asked to keep the collection picker uncluttered: the Shapy Shine Necklace
 * (SSF_NECK) — and every other shape-based necklace (Shapy Sparkle, Holy,
 * Matchy) — must appear as a single general card on the selection grid, NOT one
 * card per shape. The shape is chosen later during configuration (exactly like
 * the Shapy Shine bracelet). SHAPE_CARD_IDS is therefore empty.
 *
 * The cardKey / parseCardKey / cardsForCollection helpers are retained (the
 * shape-card mechanism can be re-enabled by adding ids back to SHAPE_CARD_IDS),
 * so we still cover their round-trip behaviour.
 *
 * Covers:
 *   - Pure helpers: cardsForCollection / cardKey / parseCardKey
 *   - Grid renders SSF_NECK (and other necklaces) exactly once, no shape suffix
 *   - Selecting SHAPY SHINE NECKLACE → a single line with NO presetShape
 */

import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { renderWithI18n } from './testUtils'

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))

jest.mock('@/lib/api', () => ({
  sendBuilderChat: jest.fn(),
}))

// ─── Component under test ────────────────────────────────────────────────────

const BuilderPage = require('../BuilderPage').default
const { cardsForCollection, cardsForFamilyEntry, cardKey, parseCardKey, SHAPE_CARD_IDS } = require('../BuilderPage')
const { COLLECTIONS } = require('@/lib/catalog')
const { familyById } = require('@/lib/collectionFamilies')

const SSF_NECK = COLLECTIONS.find(c => c.id === 'SSF_NECK')
const CUTY_NECK = COLLECTIONS.find(c => c.id === 'CUTY_NECK')

function renderBuilder({ lines = [], setLines = jest.fn(), isAdmin = true } = {}) {
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
      isAdmin={isAdmin}
    />
  )
}

// Mount may lazily fetch packs in some paths; keep fetch harmless.
let originalFetch
beforeEach(() => {
  originalFetch = global.fetch
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({ packs: [] }),
  })
})
afterEach(() => {
  global.fetch = originalFetch
})

// ─── Pure helpers ─────────────────────────────────────────────────────────────

describe('BuilderPage — card key helpers', () => {
  it('SHAPE_CARD_IDS is empty (no collection explodes into per-shape cards)', () => {
    expect(SHAPE_CARD_IDS.size).toBe(0)
  })

  it('cardsForCollection yields a single general card for SSF_NECK', () => {
    const cards = cardsForCollection(SSF_NECK)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ key: 'SSF_NECK', shape: null })
  })

  it('cardsForCollection yields a single plain card for non-shape collections', () => {
    const cards = cardsForCollection(CUTY_NECK)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ key: 'CUTY_NECK', shape: null })
  })

  it('cardsForFamilyEntry expands Shine into one card per shape', () => {
    const ssf = COLLECTIONS.find(c => c.id === 'SSF')
    const cards = cardsForFamilyEntry({
      type: 'family',
      family: familyById('FAM_SHAPY_SHINE'),
      members: [ssf],
    })
    expect(cards.map(c => c.key)).toEqual([
      'SSF::Heart', 'SSF::Pear', 'SSF::Marquise', 'SSF::Oval', 'SSF::Emerald', 'SSF::Cushion',
    ])
  })

  it('cardsForFamilyEntry expands Sparkle Fancy into one card per shape', () => {
    const sspf = COLLECTIONS.find(c => c.id === 'SSPF')
    const cards = cardsForFamilyEntry({
      type: 'family',
      family: familyById('FAM_SHAPY_SPARKLE'),
      members: [sspf],
    })
    expect(cards.map(c => c.key)).toEqual([
      'SSPF::Round', 'SSPF::Pear', 'SSPF::Oval', 'SSPF::Heart', 'SSPF::Princess',
      'SSPF::Cushion', 'SSPF::Marquise', 'SSPF::Emerald', 'SSPF::Long Cushion',
    ])
  })

  it('cardKey / parseCardKey round-trip (mechanism retained)', () => {
    expect(cardKey('SSF_NECK', 'Heart')).toBe('SSF_NECK::Heart')
    expect(cardKey('CUTY_NECK', null)).toBe('CUTY_NECK')
    expect(parseCardKey('SSF_NECK::Heart')).toEqual({ id: 'SSF_NECK', shape: 'Heart' })
    expect(parseCardKey('CUTY_NECK')).toEqual({ id: 'CUTY_NECK', shape: null })
  })
})

// ─── Grid rendering ────────────────────────────────────────────────────────────

describe('BuilderPage — general cards in the selection grid', () => {
  function openNecklaceTab() {
    renderBuilder({ lines: [] })
    fireEvent.click(screen.getByText('Necklaces'))
  }

  it('renders SHAPY SHINE NECKLACE exactly once, with no shape suffix', () => {
    openNecklaceTab()
    expect(screen.getAllByText('SHAPY SHINE NECKLACE')).toHaveLength(1)
    // No per-shape cards any more.
    SSF_NECK.shapes.forEach(shape => {
      expect(screen.queryByText(`SHAPY SHINE NECKLACE — ${shape}`)).not.toBeInTheDocument()
    })
  })

  it('renders other necklaces exactly once (CUTY NECKLACE)', () => {
    openNecklaceTab()
    expect(screen.getAllByText('CUTY NECKLACE')).toHaveLength(1)
  })
})

// ─── Selection → configure ──────────────────────────────────────────────────

describe('BuilderPage — selecting a general necklace card creates an un-locked line', () => {
  function selectAndContinue(label) {
    const setLines = jest.fn()
    renderBuilder({ lines: [], setLines })
    fireEvent.click(screen.getByText('Necklaces'))
    fireEvent.click(screen.getByText(label))
    fireEvent.click(screen.getByRole('button', { name: /continue to configure/i }))
    expect(setLines).toHaveBeenCalled()
    const updater = setLines.mock.calls[setLines.mock.calls.length - 1][0]
    return typeof updater === 'function' ? updater([]) : updater
  }

  it('selecting SHAPY SHINE NECKLACE creates a single SSF_NECK line with NO presetShape', () => {
    const lines = selectAndContinue('SHAPY SHINE NECKLACE')
    const ssfLines = lines.filter(l => l.collectionId === 'SSF_NECK')
    expect(ssfLines).toHaveLength(1)
    expect(ssfLines[0].presetShape).toBeUndefined()
    expect(ssfLines[0].colorConfigs).toEqual([])
  })
})
