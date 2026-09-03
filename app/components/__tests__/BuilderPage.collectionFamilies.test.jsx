/**
 * BuilderPage — the selection grid groups a range behind one card.
 *
 * Sam, looking at the grid: "When you do select collection, you just have
 * everything." The Bracelets tab listed all 26 catalog entries side by side.
 * It now shows 10 cards; MULTI, SHAPY SHINE, SHAPY SPARKLE, MOONLIGHT, SIENNA
 * and ICONICS open into their products the way a pack card opens a fair folder.
 *
 * The invariant these tests defend is that grouping is skin deep: a selection
 * is still a collection id, and Continue to Configure still produces exactly
 * one line per product picked, whether it was picked from the root grid or
 * from inside a folder.
 */

import React from 'react'
import { screen, fireEvent, within } from '@testing-library/react'
import { renderWithI18n } from './testUtils'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))

jest.mock('@/lib/api', () => ({ sendBuilderChat: jest.fn() }))

const BuilderPage = require('../BuilderPage').default
const { priceRangeFor } = require('../BuilderPage')
const { COLLECTIONS } = require('@/lib/catalog')

const ADMIN_PROFILE = { role: 'admin' }
const AGENT_PROFILE = { role: 'agent', email: 'someone@example.com' }

let originalFetch
beforeEach(() => {
  originalFetch = global.fetch
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({ packs: [], fairs: [] }),
  })
})
afterEach(() => { global.fetch = originalFetch })

function renderBuilder({ profile = ADMIN_PROFILE, setLines = jest.fn(), lines = [] } = {}) {
  renderWithI18n(
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
      isAdmin
      profile={profile}
    />,
  )
  return setLines
}

const family = (id) => screen.getByTestId(`collection-family-${id}`)
const queryFamily = (id) => screen.queryByTestId(`collection-family-${id}`)
const card = (key) => screen.getByTestId(`collection-card-${key}`)
const queryCard = (key) => screen.queryByTestId(`collection-card-${key}`)

function continueToConfigure(setLines) {
  fireEvent.click(screen.getByRole('button', { name: /continue to configure/i }))
  const updater = setLines.mock.calls[setLines.mock.calls.length - 1][0]
  return typeof updater === 'function' ? updater([]) : updater
}

// ─── Root grid ───────────────────────────────────────────────────────────────

describe('BuilderPage — the grouped root grid', () => {
  it('shows one card per range instead of one per product', () => {
    renderBuilder()

    expect(family('FAM_MULTI')).toHaveTextContent('MULTI')
    expect(family('FAM_SHAPY_SHINE')).toHaveTextContent('SHAPY SHINE')
    expect(family('FAM_SHAPY_SPARKLE')).toHaveTextContent('SHAPY SPARKLE')
    expect(family('FAM_MOONLIGHT')).toHaveTextContent('MOONLIGHT')
    expect(family('FAM_SIENNA')).toHaveTextContent('SIENNA')
    expect(family('FAM_ICONICS')).toHaveTextContent('ICONICS')

    // The members themselves are not on the root grid any more.
    for (const id of ['M3', 'M4', 'M5', 'SSF', 'SSPF', 'SSRG', 'MFM', 'MNO', 'MNH', 'SI1', 'SI5', 'RIV4', 'ZAHA']) {
      expect(queryCard(id)).not.toBeInTheDocument()
    }
    expect(card('SSRD')).toBeInTheDocument()
  })

  it('leaves the stand-alone collections on the root grid', () => {
    renderBuilder()
    for (const id of ['CUTY', 'CUBIX', 'MF', 'HOLY', 'SSRD']) {
      expect(card(id)).toBeInTheDocument()
    }
  })

  it('says how many products each range holds', () => {
    renderBuilder()
    expect(family('FAM_MULTI')).toHaveTextContent('3 products')
    expect(family('FAM_SHAPY_SHINE')).toHaveTextContent('6 products')
    expect(family('FAM_SHAPY_SPARKLE')).toHaveTextContent('9 products')
    expect(family('FAM_SIENNA')).toHaveTextContent('5 products')
    expect(family('FAM_ICONICS')).toHaveTextContent('7 products')
  })

  it('prices a range across everything inside it', () => {
    renderBuilder()
    // Sienna runs from the cheapest piece (Three at 0.15) to the dearest
    // (Five at 0.50) on the 2026 list.
    expect(family('FAM_SIENNA')).toHaveTextContent('€65 – €170')
  })
})

// ─── Opening and leaving a range ─────────────────────────────────────────────

describe('BuilderPage — opening a range', () => {
  it('swaps the grid for that range only', () => {
    renderBuilder()
    fireEvent.click(family('FAM_MOONLIGHT'))

    expect(card('MFM')).toHaveTextContent('Original Moonlight')
    expect(card('MNO')).toHaveTextContent('Long Moonlight')
    expect(card('MNH')).toHaveTextContent('Multi Moonlight')

    // Nothing else is on screen — not the other ranges, not the solo cards.
    expect(queryFamily('FAM_SIENNA')).not.toBeInTheDocument()
    expect(queryCard('CUTY')).not.toBeInTheDocument()
  })

  it('names where you are and offers the way back', () => {
    renderBuilder()
    fireEvent.click(family('FAM_SIENNA'))

    const crumb = screen.getByTestId('collection-family-crumb')
    expect(crumb).toHaveTextContent('SIENNA')
    expect(crumb).toHaveTextContent('5 products')

    fireEvent.click(screen.getByTestId('collection-family-back'))
    expect(family('FAM_SIENNA')).toBeInTheDocument()
    expect(card('CUTY')).toBeInTheDocument()
  })

  it('offers no way back from the root, because there is nowhere to go', () => {
    renderBuilder()
    expect(screen.queryByTestId('collection-family-back')).not.toBeInTheDocument()
  })

  it('opening a range selects nothing on its own', () => {
    const setLines = renderBuilder()
    fireEvent.click(family('FAM_MOONLIGHT'))
    expect(screen.getByText(/select at least one collection/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue to configure/i })).toBeDisabled()
    expect(setLines).not.toHaveBeenCalled()
  })
})

// ─── Selecting from inside a range ───────────────────────────────────────────

describe('BuilderPage — selecting products inside a range', () => {
  it('produces one line per product picked, keyed by collection id', () => {
    const setLines = renderBuilder()

    fireEvent.click(family('FAM_SIENNA'))
    fireEvent.click(card('SI1'))
    fireEvent.click(card('SI4'))
    fireEvent.click(screen.getByTestId('collection-family-back'))

    const lines = continueToConfigure(setLines)
    expect(lines.map(l => l.collectionId).sort()).toEqual(['SI1', 'SI4'])
    // No family id ever reaches a line.
    expect(lines.some(l => String(l.collectionId).startsWith('FAM_'))).toBe(false)
  })

  it('mixes freely with a solo collection picked at the root', () => {
    const setLines = renderBuilder()

    fireEvent.click(card('CUTY'))
    fireEvent.click(family('FAM_MULTI'))
    fireEvent.click(card('M4'))
    fireEvent.click(screen.getByTestId('collection-family-back'))

    expect(continueToConfigure(setLines).map(l => l.collectionId).sort())
      .toEqual(['CUTY', 'M4'])
  })

  it('shows the count on the range card once you come back out', () => {
    renderBuilder()

    fireEvent.click(family('FAM_ICONICS'))
    fireEvent.click(card('RIV4'))
    fireEvent.click(card('LIN3'))
    fireEvent.click(screen.getByTestId('collection-family-back'))

    expect(family('FAM_ICONICS')).toHaveTextContent('2')
    expect(screen.getByText(/2 collections selected/i)).toBeInTheDocument()
  })

  it('keeps a selection when you leave and re-open the range', () => {
    renderBuilder()

    fireEvent.click(family('FAM_MOONLIGHT'))
    fireEvent.click(card('MNH'))
    fireEvent.click(screen.getByTestId('collection-family-back'))
    fireEvent.click(family('FAM_MOONLIGHT'))

    expect(within(card('MNH')).getByText('✓')).toBeInTheDocument()
  })

  it('deselecting inside the range clears the count on the card', () => {
    renderBuilder()

    fireEvent.click(family('FAM_MULTI'))
    fireEvent.click(card('M3'))
    fireEvent.click(card('M3'))
    fireEvent.click(screen.getByTestId('collection-family-back'))

    expect(screen.getByText(/select at least one collection/i)).toBeInTheDocument()
  })
})

// ─── Sam's specific placements ───────────────────────────────────────────────

describe('BuilderPage — where Sam wanted each product', () => {
  it('opens Shapy Sparkle onto Fancy shapes, like Shine', () => {
    renderBuilder()

    expect(queryCard('SSPF')).not.toBeInTheDocument()
    // SSRG is not a FAM_SHAPY_SPARKLE member, so like D VVS it stands on its
    // own card rather than opening into shapes.
    expect(card('SSRG')).toHaveTextContent('SHAPY SPARKLE RND G/H')
    expect(card('SSRD')).toHaveTextContent('SHAPY SPARKLE D VVS')

    fireEvent.click(family('FAM_SHAPY_SPARKLE'))
    expect(card('SSPF::Round')).toHaveTextContent('Round')
    expect(card('SSPF::Pear')).toHaveTextContent('Pear')
    expect(card('SSPF::Oval')).toHaveTextContent('Oval')
    expect(card('SSPF::Heart')).toHaveTextContent('Heart')
    expect(card('SSPF::Princess')).toHaveTextContent('Princess')
    expect(card('SSPF::Cushion')).toHaveTextContent('Cushion')
    expect(card('SSPF::Marquise')).toHaveTextContent('Marquise')
    expect(card('SSPF::Emerald')).toHaveTextContent('Emerald')
    expect(card('SSPF::Long Cushion')).toHaveTextContent('Long Cushion')
    expect(queryCard('SSRG')).not.toBeInTheDocument()
  })

  it('picking a Sparkle Fancy shape becomes its own line with that shape locked', () => {
    const setLines = renderBuilder()

    fireEvent.click(family('FAM_SHAPY_SPARKLE'))
    fireEvent.click(card('SSPF::Heart'))

    const lines = continueToConfigure(setLines)
    expect(lines).toHaveLength(1)
    expect(lines[0].collectionId).toBe('SSPF')
    expect(lines[0].presetShape).toBe('Heart')
  })

  it('opens Shapy Shine onto its shapes, like Multi opens onto 3/4/5', () => {
    renderBuilder()

    expect(queryCard('SSF')).not.toBeInTheDocument()
    fireEvent.click(family('FAM_SHAPY_SHINE'))

    expect(card('SSF::Heart')).toHaveTextContent('Heart')
    expect(card('SSF::Pear')).toHaveTextContent('Pear')
    expect(card('SSF::Marquise')).toHaveTextContent('Marquise')
    expect(card('SSF::Oval')).toHaveTextContent('Oval')
    expect(card('SSF::Emerald')).toHaveTextContent('Emerald')
    expect(card('SSF::Cushion')).toHaveTextContent('Cushion')
  })

  it('picking a Shine shape becomes its own line with that shape locked', () => {
    const setLines = renderBuilder()

    fireEvent.click(family('FAM_SHAPY_SHINE'))
    fireEvent.click(card('SSF::Pear'))

    const lines = continueToConfigure(setLines)
    expect(lines).toHaveLength(1)
    expect(lines[0].collectionId).toBe('SSF')
    expect(lines[0].presetShape).toBe('Pear')
  })

  it('puts Za-Ha under Iconics, not Sparkle', () => {
    renderBuilder()
    fireEvent.click(family('FAM_ICONICS'))
    expect(card('ZAHA')).toHaveTextContent('Za-Ha')
    expect(queryCard('SSRG')).not.toBeInTheDocument()
    expect(queryCard('SSRD')).not.toBeInTheDocument()
  })
})

// ─── Necklaces tab ───────────────────────────────────────────────────────────

describe('BuilderPage — the necklace tab', () => {
  it('groups the three Multi necklaces and leaves the rest alone', () => {
    renderBuilder()
    fireEvent.click(screen.getByText('Necklaces'))

    expect(family('FAM_MULTI_NECK')).toHaveTextContent('3 products')
    expect(card('CUTY_NECK')).toBeInTheDocument()
    expect(card('SSF_NECK')).toBeInTheDocument()
    expect(queryCard('M3_NECK')).not.toBeInTheDocument()
  })

  it('leaving the tab closes the range you had open', () => {
    renderBuilder()

    fireEvent.click(family('FAM_MOONLIGHT'))
    expect(screen.getByTestId('collection-family-back')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Necklaces'))
    // Back at the root of the necklace grid, not stranded inside a bracelet
    // range that has no necklaces in it.
    expect(screen.queryByTestId('collection-family-back')).not.toBeInTheDocument()
    expect(card('CUTY_NECK')).toBeInTheDocument()
  })

  it('a necklace picked inside the Multi folder still becomes its own line', () => {
    const setLines = renderBuilder()

    fireEvent.click(screen.getByText('Necklaces'))
    fireEvent.click(family('FAM_MULTI_NECK'))
    fireEvent.click(card('M5_NECK'))

    const lines = continueToConfigure(setLines)
    expect(lines.map(l => l.collectionId)).toEqual(['M5_NECK'])
  })
})

// ─── Access ──────────────────────────────────────────────────────────────────

describe('BuilderPage — grouping respects collection access', () => {
  it('hides Moonlight and Sienna from an agent who cannot sell them', () => {
    renderBuilder({ profile: AGENT_PROFILE })

    expect(queryFamily('FAM_MOONLIGHT')).not.toBeInTheDocument()
    expect(queryFamily('FAM_SIENNA')).not.toBeInTheDocument()
    expect(family('FAM_ICONICS')).toBeInTheDocument()
  })

  it('does not leak Za-Ha into the Iconics folder for that agent', () => {
    renderBuilder({ profile: AGENT_PROFILE })

    fireEvent.click(family('FAM_ICONICS'))
    expect(queryCard('ZAHA')).not.toBeInTheDocument()
    expect(card('RIV4')).toBeInTheDocument()
    expect(queryCard('SSRG')).not.toBeInTheDocument()
  })

  it('still lets that agent open Shapy Sparkle and pick a Fancy shape', () => {
    renderBuilder({ profile: AGENT_PROFILE })

    fireEvent.click(family('FAM_SHAPY_SPARKLE'))
    expect(card('SSPF::Round')).toBeInTheDocument()
    expect(queryCard('SSRG')).not.toBeInTheDocument()
    expect(queryCard('SSRD')).not.toBeInTheDocument()
  })
})

// ─── Price range regression ──────────────────────────────────────────────────

describe('priceRangeFor', () => {
  const MNH = COLLECTIONS.find(c => c.id === 'MNH')
  const SI2P = COLLECTIONS.find(c => c.id === 'SI2P')

  it('ignores sizes a price list does not sell', () => {
    // Multi Moonlight lists 0.70 and 1.10 but prices them null before October.
    // Walking col.carats end to end used to render the card as "€75 – €0".
    expect(priceRangeFor([MNH], '2026')).toEqual({ min: 75, max: 130 })
    expect(priceRangeFor([MNH], '2026-10')).toEqual({ min: 90, max: 320 })
  })

  it('collapses to a single price when a collection sells one size', () => {
    expect(priceRangeFor([SI2P], '2026')).toEqual({ min: 120, max: 120 })
  })

  it('spans every collection it is given', () => {
    const sienna = COLLECTIONS.filter(c => ['SI1', 'SI2P', 'SI3', 'SI4', 'SI5'].includes(c.id))
    expect(priceRangeFor(sienna, '2026')).toEqual({ min: 65, max: 170 })
  })

  it('returns null rather than a bogus €0 range when nothing is priced', () => {
    expect(priceRangeFor([], '2026')).toBeNull()
    expect(priceRangeFor(undefined, '2026')).toBeNull()
  })
})

describe('BuilderPage — the €0 card regression', () => {
  it('never renders a €0 price on a card', () => {
    renderBuilder()
    fireEvent.click(family('FAM_MOONLIGHT'))
    expect(card('MNH')).toHaveTextContent('€75 – €130')
    expect(card('MNH')).not.toHaveTextContent('€0')
  })
})
