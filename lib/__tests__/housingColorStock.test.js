/**
 * Housing colours — normalisation of the stored values and pieces sold per
 * colour (Sam, 23 Sep 2026).
 */
import {
  normalizeHousingColor,
  buildHousingSold,
  HOUSING_COLOR_BUCKETS,
  NOT_SPECIFIED,
} from '@/lib/housingColorStock'

describe('normalizeHousingColor', () => {
  test.each([
    ['White', 'White'], ['Yellow', 'Yellow'], ['Pink', 'Pink'],
    ['White Gold', 'White'], ['Yellow Gold', 'Yellow'], ['Pink gold', 'Pink'],
    ['Bezel White', 'White'], ['Prong Yellow', 'Yellow'], ['Prongs white', 'White'], ['Bezel Rose', 'Pink'],
    ['WW', 'White'], ['WWW', 'White'], ['YY', 'Yellow'], ['YYY', 'Yellow'], ['PP', 'Pink'], ['PPP', 'Pink'],
    ['WY', 'Yellow + White'], ['WP', 'White + Pink'], ['YP', 'Yellow + Pink'],
    ['YWP', 'Yellow + White + Pink'], ['WYP', 'Yellow + White + Pink'],
    ['Yellow + Yellow', 'Yellow'], ['Bezel Yellow + Yellow', 'Yellow'], ['White + White Bezel', 'White'],
    ['Yellow Matte', 'Yellow Matte'], ['White Matte', 'White Matte'], ['Pink Matte', 'Pink Matte'],
    ['Gray Matte', 'Gray Matte'], ['Grey Matte', 'Gray Matte'], ['Black Matte', 'Black Matte'],
    ['', NOT_SPECIFIED], [null, NOT_SPECIFIED], ['Bezel', NOT_SPECIFIED], ['Prong', NOT_SPECIFIED], ['Braided', NOT_SPECIFIED], ['emma2', NOT_SPECIFIED],
  ])('%p → %s', (raw, expected) => {
    expect(normalizeHousingColor(raw)).toBe(expected)
  })
})

function doc({ channel = 'b2b', status = 'sent', rows = [], deleted = false }) {
  return { order_channel: channel, status, deleted_at: deleted ? '2026-01-01' : null, metadata: { formState: { rows } } }
}
const row = (bpColor, quantity) => ({ bpColor, quantity: String(quantity), collection: 'CUTY' })

describe('buildHousingSold', () => {
  test('qty-weighted per colour, every fixed bucket present, drafts and internal excluded', () => {
    const out = buildHousingSold([
      doc({ rows: [row('White', 3), row('Bezel White', 2), row('YWP', 1)] }),
      doc({ channel: 'b2c', rows: [row('Yellow Gold', 4)] }),
      doc({ status: 'draft', rows: [row('White', 100)] }),
      doc({ channel: 'internal', rows: [row('White', 100)] }),
    ])
    const byName = Object.fromEntries(out.map((r) => [r.name, r.qty]))
    expect(byName.White).toBe(5)
    expect(byName.Yellow).toBe(4)
    expect(byName['Yellow + White + Pink']).toBe(1)
    expect(byName.Pink).toBe(0)
    for (const b of HOUSING_COLOR_BUCKETS) expect(byName[b.name]).toBeDefined()
    expect(out.map((r) => r.name).slice(0, HOUSING_COLOR_BUCKETS.length)).toEqual(HOUSING_COLOR_BUCKETS.map((b) => b.name))
    expect(byName[NOT_SPECIFIED]).toBeUndefined()
  })

  test('junk colours land in Not specified, shown last', () => {
    const out = buildHousingSold([doc({ rows: [row('', 2), row('Braided', 1)] })])
    expect(out[out.length - 1]).toMatchObject({ name: NOT_SPECIFIED, qty: 3 })
  })
})
