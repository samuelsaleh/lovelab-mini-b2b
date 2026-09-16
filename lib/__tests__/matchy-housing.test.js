/**
 * Matchy Fancy housing — bezel AND prong use the six two-metal codes.
 *
 * The Lovelab ERP resolves the SKU from the housing code sent in the
 * consignment payload (row.bpColor). A bare metal name ("White", "Yellow",
 * "Pink") is not a Matchy housing there and yields no SKU, so the catalog
 * must never offer one (Sam, Sep 2026).
 */

import { HOUSING } from '../catalog'
import { findPackshot } from '../packshot-lookup'

const MATCHY_CODES = ['WW', 'YY', 'PP', 'WY', 'WP', 'YP']
const BARE_METALS = ['White', 'Yellow', 'Pink']

describe('Matchy Fancy housing codes', () => {
  it('offers the six two-metal codes for bezel', () => {
    expect(HOUSING.matchy.bezel.map(h => h.label)).toEqual(MATCHY_CODES)
    expect(HOUSING.matchyBezel.map(h => h.label)).toEqual(MATCHY_CODES)
  })

  it('offers the same six codes for prong (no bare White / Yellow / Pink)', () => {
    expect(HOUSING.matchy.prong.map(h => h.label)).toEqual(MATCHY_CODES)
    expect(HOUSING.matchyProng.map(h => h.label)).toEqual(MATCHY_CODES)
    for (const metal of BARE_METALS) {
      expect(HOUSING.matchy.prong.map(h => h.label)).not.toContain(metal)
      expect(HOUSING.matchyProng.map(h => h.label)).not.toContain(metal)
    }
  })

  it('keeps a stable id per code', () => {
    expect(HOUSING.matchy.prong.map(h => h.id)).toEqual([
      'white-white', 'yellow-yellow', 'pink-pink', 'white-yellow', 'white-pink', 'yellow-pink',
    ])
  })
})

describe('Matchy Fancy packshots with two-metal codes', () => {
  it('resolves WW / YY / PP to the single-metal packshot, with or without the setting prefix', () => {
    for (const [code, metal] of [['WW', 'WG'], ['YY', 'YG'], ['PP', 'RG']]) {
      const direct = findPackshot('MF', { shape: 'Emerald', housing: metal, subgroup: 'Bezel' })
      expect(direct).toBeTruthy()
      expect(findPackshot('MF', { shape: 'Emerald', housing: code, subgroup: 'Bezel' })).toEqual(direct)
      expect(findPackshot('MF', { shape: 'Emerald', housing: `Bezel ${code}`, subgroup: 'Bezel' })).toEqual(direct)
      expect(findPackshot('MF', { shape: 'Emerald', housing: `Prong ${code}`, subgroup: 'Bezel' })).toEqual(direct)
    }
  })

  it('still returns a Matchy image for the mixed codes', () => {
    for (const code of ['WY', 'WP', 'YP']) {
      const url = findPackshot('MF', { shape: 'Emerald', housing: `Prong ${code}` })
      expect(url).toMatch(/Matchy/)
    }
  })
})
