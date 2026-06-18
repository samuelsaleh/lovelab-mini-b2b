/**
 * BuilderPage — shape cards on the selection grid (SHAPY SHINE NECKLACE)
 *
 * The Shapy Shine Necklace (SSF_NECK) is the only collection that splits into
 * one selection card per shape (Heart, Pear, Marquise, …). Selecting a shape
 * card produces a config line locked to that shape (line.presetShape).
 *
 * Covers:
 *   - Pure helpers: cardsForCollection / cardKey / parseCardKey
 *   - Grid renders 7 SSF_NECK shape cards + non-shape necklaces render once
 *   - Each shape card resolves a packshot image
 *   - Selecting a shape card → goToConfigure creates a line with presetShape
 *   - Selecting Heart + Pear → two distinct SSF_NECK lines
 *   - Re-entering the select step re-checks the previously selected shape card
 */

import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { renderWithI18n } from './testUtils'

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
}))

jest.mock('@/lib/api', () => ({
  sendBuilderChat: jest.fn(),
}))

// ─── Component under test ────────────────────────────────────────────────────

const BuilderPage = require('../BuilderPage').default
const { cardsForCollection, cardKey, parseCardKey } = require('../BuilderPage')
const { COLLECTIONS } = require('@/lib/catalog')

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
  it('cardsForCollection splits SSF_NECK into one card per shape', () => {
    const cards = cardsForCollection(SSF_NECK)
    expect(cards).toHaveLength(SSF_NECK.shapes.length)
    expect(cards.map(c => c.shape)).toEqual(SSF_NECK.shapes)
    expect(cards.map(c => c.key)).toEqual(SSF_NECK.shapes.map(s => `SSF_NECK::${s}`))
    expect(cards.every(c => c.col === SSF_NECK)).toBe(true)
  })

  it('cardsForCollection yields a single plain card for non-shape collections', () => {
    const cards = cardsForCollection(CUTY_NECK)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ key: 'CUTY_NECK', shape: null })
  })

  it('cardKey / parseCardKey round-trip', () => {
    expect(cardKey('SSF_NECK', 'Heart')).toBe('SSF_NECK::Heart')
    expect(cardKey('CUTY_NECK', null)).toBe('CUTY_NECK')
    expect(parseCardKey('SSF_NECK::Heart')).toEqual({ id: 'SSF_NECK', shape: 'Heart' })
    expect(parseCardKey('CUTY_NECK')).toEqual({ id: 'CUTY_NECK', shape: null })
  })
})

// ─── Grid rendering ────────────────────────────────────────────────────────────

describe('BuilderPage — shape cards in the selection grid', () => {
  function openNecklaceTab() {
    renderBuilder({ lines: [] })
    fireEvent.click(screen.getByText('Necklaces'))
  }

  it('renders one card per shape for SHAPY SHINE NECKLACE', () => {
    openNecklaceTab()
    SSF_NECK.shapes.forEach(shape => {
      expect(screen.getByText(`SHAPY SHINE NECKLACE — ${shape}`)).toBeInTheDocument()
    })
    // No bare "SHAPY SHINE NECKLACE" card — every Shapy card is shape-suffixed.
    expect(screen.queryByText('SHAPY SHINE NECKLACE')).not.toBeInTheDocument()
  })

  it('renders non-shape necklaces exactly once (CUTY NECKLACE)', () => {
    openNecklaceTab()
    expect(screen.getAllByText('CUTY NECKLACE')).toHaveLength(1)
  })

  it('each shape card has its own packshot image', () => {
    openNecklaceTab()
    SSF_NECK.shapes.forEach(shape => {
      const img = screen.getByAltText(`SHAPY SHINE NECKLACE — ${shape}`)
      expect(img.tagName).toBe('IMG')
      expect(img.getAttribute('src')).toBeTruthy()
    })
  })
})

// ─── Selection → configure ──────────────────────────────────────────────────

describe('BuilderPage — selecting shape cards creates shape-locked lines', () => {
  function selectShapesAndContinue(shapes) {
    const setLines = jest.fn()
    renderBuilder({ lines: [], setLines })
    fireEvent.click(screen.getByText('Necklaces'))
    shapes.forEach(shape => {
      fireEvent.click(screen.getByText(`SHAPY SHINE NECKLACE — ${shape}`))
    })
    fireEvent.click(screen.getByRole('button', { name: /continue to configure/i }))
    expect(setLines).toHaveBeenCalled()
    const updater = setLines.mock.calls[setLines.mock.calls.length - 1][0]
    return typeof updater === 'function' ? updater([]) : updater
  }

  it('selecting one shape card creates a single SSF_NECK line with presetShape', () => {
    const lines = selectShapesAndContinue(['Heart'])
    const ssfLines = lines.filter(l => l.collectionId === 'SSF_NECK')
    expect(ssfLines).toHaveLength(1)
    expect(ssfLines[0].presetShape).toBe('Heart')
    expect(ssfLines[0].colorConfigs).toEqual([])
  })

  it('selecting Heart + Pear creates two distinct SSF_NECK lines', () => {
    const lines = selectShapesAndContinue(['Heart', 'Pear'])
    const ssfLines = lines.filter(l => l.collectionId === 'SSF_NECK')
    expect(ssfLines).toHaveLength(2)
    expect(ssfLines.map(l => l.presetShape).sort()).toEqual(['Heart', 'Pear'])
    // Distinct line ids.
    expect(new Set(ssfLines.map(l => l.uid)).size).toBe(2)
  })
})

// ─── Round-trip: configure → back to select ───────────────────────────────────

describe('BuilderPage — re-entering select re-checks the chosen shape card', () => {
  it('an existing shape-locked line marks its shape card selected', () => {
    const line = {
      uid: 'ssf-heart', collectionId: 'SSF_NECK', presetShape: 'Heart',
      colorConfigs: [], expanded: true,
    }
    renderBuilder({ lines: [line] })
    // Opens on configure (line has a collection). Go back to the grid.
    fireEvent.click(screen.getByText(/edit collections/i))
    // The necklace tab is active (first line is a necklace); the Heart card is selected.
    const heartCard = screen.getByText('SHAPY SHINE NECKLACE — Heart').closest('button')
    expect(within(heartCard).getByText('✓')).toBeInTheDocument()
  })
})
