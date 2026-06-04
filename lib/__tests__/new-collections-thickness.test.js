import { COLLECTIONS, getThicknessOptions } from '@/lib/catalog'

// New silk collections (Sienna + Iconix silk) only ship in Thin — no Thick.
const THIN_ONLY_IDS = ['SI1', 'SI2P', 'SI3', 'SI4', 'SI5', 'ZAHA', 'LUVA', 'LUMA', 'RIV4', 'RIV8']

describe('new silk collections are Thin-only', () => {
  it.each(THIN_ONLY_IDS)('%s exposes only Thin thickness', (id) => {
    const col = COLLECTIONS.find((c) => c.id === id)
    expect(col).toBeTruthy()
    expect(getThicknessOptions(col)).toEqual(['Thin'])
  })

  it('existing silk collections keep both Thin and Thick', () => {
    const existing = COLLECTIONS.filter(
      (c) => (c.cord === 'silk' || c.cord === 'silkBraided') && !THIN_ONLY_IDS.includes(c.id),
    )
    expect(existing.length).toBeGreaterThan(0)
    for (const col of existing) {
      expect(getThicknessOptions(col)).toEqual(['Thin', 'Thick'])
    }
  })

  it('nylon collections fall back to the default (and never crash)', () => {
    const nylon = COLLECTIONS.filter((c) => c.cord === 'nylon')
    for (const col of nylon) {
      expect(getThicknessOptions(col)).toEqual(['Thin', 'Thick'])
    }
  })
})

describe('Riviera Four/Eight carry both carat tiers with Excel prices', () => {
  // 8x0,10 = 0.80 / 8x0,05 = 0.40  ·  4x0,10 = 0.40 / 4x0,05 = 0.20
  const expected = {
    RIV4: { carats: ['0.20', '0.40'], b2b: [75, 95], b2c: [225, 285] },
    RIV8: { carats: ['0.40', '0.80'], b2b: [95, 130], b2c: [285, 390] },
  }
  it.each(Object.keys(expected))('%s has both tiers priced correctly', (id) => {
    const col = COLLECTIONS.find((c) => c.id === id)
    expect(col).toBeTruthy()
    expect(col.carats).toEqual(expected[id].carats)
    for (const year of ['2025', '2026']) {
      expect(col.prices[year].igi).toEqual(expected[id].b2b)
      expect(col.retail[year].igi).toEqual(expected[id].b2c)
    }
  })
})
