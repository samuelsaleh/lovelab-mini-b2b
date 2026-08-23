/**
 * Color / country / slice breakdowns — the numbers the analytics dashboard
 * and the AI tools share. A regression here would show one figure on screen
 * and another in chat.
 */

const { CORD_COLORS } = require('../catalog')
const {
  buildColorBreakdown,
  buildClientBreakdown,
  buildCountryBreakdown,
  buildProductBreakdown,
  resolveMaterialGroup,
  sliceAnalytics,
  matchingLines,
  runAnalyticsTool,
  isAnalyticsDoc,
  sortColorList,
} = require('../analyticsBreakdowns')

const CUTY = { collection: 'CUTY', colorCord: 'Black', quantity: '2', total: '68' }
const CUTY_RED = { collection: 'CUTY', colorCord: 'RED', quantity: '3', total: '102' }
const SSPF_SILK = { collection: 'SHAPY SPARKLE FANCY', colorCord: 'Baby pink', quantity: '1', total: '200', material: 'Silk (Thin)' }
const SSF_SHINE = { collection: 'SHAPY SHINE FANCY', colorCord: 'Turq Blue', quantity: '4', total: '264' }
const SSRG_BRAIDED = {
  collection: 'SHAPY SPARKLE RND G/H',
  colorCord: 'Navy Blue',
  quantity: '2',
  total: '400',
  material: 'Braided Nylon',
}
const ORPHAN_COLOR = { collection: 'CUTY', colorCord: 'Neon Lime', quantity: '1', total: '34' }

function doc(overrides = {}, rows = [CUTY]) {
  return {
    id: overrides.id || 'd1',
    status: overrides.status || 'sent',
    deleted_at: overrides.deleted_at || null,
    order_channel: overrides.order_channel || 'b2b',
    document_type: 'order',
    total_amount: overrides.total_amount ?? 1000,
    event_id: overrides.event_id || null,
    events: overrides.events || null,
    metadata: {
      formState: {
        country: overrides.country ?? 'Germany',
        eventName: overrides.eventName,
        rows,
      },
    },
    ...overrides,
    metadata: {
      formState: {
        country: overrides.country ?? 'Germany',
        eventName: overrides.eventName,
        rows: overrides.rows || rows,
      },
    },
  }
}

describe('resolveMaterialGroup', () => {
  it('maps shine and braided onto nylon, silk onto silk', () => {
    expect(resolveMaterialGroup({}, { cord: 'shine' })).toBe('nylon')
    expect(resolveMaterialGroup({}, { cord: 'holy' })).toBe('nylon')
    expect(resolveMaterialGroup({ material: 'Braided Nylon' }, { cord: 'silk' })).toBe('nylon')
    expect(resolveMaterialGroup({ material: 'Silk (Thin)' }, { cord: 'silk' })).toBe('silk')
    expect(resolveMaterialGroup({}, { cord: 'silk' })).toBe('silk')
    expect(resolveMaterialGroup({}, { cord: 'nylon' })).toBe('nylon')
  })
})

describe('isAnalyticsDoc', () => {
  it('drops drafts and excluded channels', () => {
    expect(isAnalyticsDoc(doc())).toBe(true)
    expect(isAnalyticsDoc(doc({ status: 'draft' }))).toBe(false)
    expect(isAnalyticsDoc(doc({ order_channel: 'consignment' }))).toBe(false)
    expect(isAnalyticsDoc(doc({ order_channel: 'internal' }))).toBe(false)
    expect(isAnalyticsDoc(doc({ deleted_at: '2026-01-01' }))).toBe(false)
  })
})

describe('buildColorBreakdown', () => {
  it('seeds the full nylon and silk palettes so unsold colors sit at 0', () => {
    const { nylon, silk } = buildColorBreakdown([doc({}, [CUTY])])
    expect(nylon.map((c) => c.name)).toEqual(expect.arrayContaining(CORD_COLORS.nylon.map((c) => c.n)))
    expect(silk.map((c) => c.name)).toEqual(expect.arrayContaining(CORD_COLORS.silk.map((c) => c.n)))
    expect(nylon).toHaveLength(CORD_COLORS.nylon.length)
    expect(silk.filter((c) => c.qty === 0).length).toBe(CORD_COLORS.silk.length)
    const black = nylon.find((c) => c.name === 'Black')
    expect(black).toMatchObject({ qty: 2, revenue: 68, catalog: true })
    const ivory = nylon.find((c) => c.name === 'Ivory')
    expect(ivory.qty).toBe(0)
  })

  it('splits nylon vs silk and puts shine / braided under nylon', () => {
    const { nylon, silk } = buildColorBreakdown([
      doc({ id: 'a' }, [CUTY, SSF_SHINE]),
      doc({ id: 'b' }, [SSPF_SILK, SSRG_BRAIDED]),
    ])
    expect(nylon.find((c) => c.name === 'Black').qty).toBe(2)
    expect(nylon.find((c) => c.name === 'Navy Blue').qty).toBe(2)
    expect(nylon.find((c) => c.name === 'Turq Blue')).toMatchObject({ qty: 4, revenue: 264 })
    expect(silk.find((c) => c.name === 'Baby pink').qty).toBe(1)
    expect(silk.find((c) => c.name === 'Black').qty).toBe(0)
  })

  it('merges RED and Red onto the same nylon row', () => {
    const { nylon } = buildColorBreakdown([doc({}, [CUTY_RED, { ...CUTY, colorCord: 'Red', quantity: '1', total: '34' }])])
    const red = nylon.find((c) => c.name === 'Red')
    expect(red.qty).toBe(4)
    expect(nylon.filter((c) => c.name.toLowerCase() === 'red')).toHaveLength(1)
  })

  it('puts a sold name that matches no palette and no material into Other', () => {
    const { other, nylon } = buildColorBreakdown([
      doc({}, [{ collection: 'UNKNOWN THING', colorCord: 'Neon Lime', quantity: '1', total: '10' }]),
    ])
    expect(other).toEqual([])
    expect(nylon.find((c) => c.name === 'Neon Lime')).toBeUndefined()
  })

  it('keeps an unmatched nylon color on the nylon list (not Other)', () => {
    const { nylon, other } = buildColorBreakdown([doc({}, [ORPHAN_COLOR])])
    expect(nylon.find((c) => c.name === 'Neon Lime')).toMatchObject({ qty: 1, catalog: false })
    expect(other).toEqual([])
  })

  it('ignores excluded channels and drafts', () => {
    const { nylon } = buildColorBreakdown([
      doc({ order_channel: 'consignment' }, [CUTY_RED]),
      doc({ status: 'draft' }, [CUTY_RED]),
      doc({ id: 'ok' }, [CUTY]),
    ])
    expect(nylon.find((c) => c.name === 'Red').qty).toBe(0)
    expect(nylon.find((c) => c.name === 'Black').qty).toBe(2)
  })

  it('lists sold colors before zeros', () => {
    const { nylon } = buildColorBreakdown([doc({}, [CUTY])])
    expect(nylon[0].name).toBe('Black')
    expect(nylon[0].qty).toBeGreaterThan(0)
    expect(nylon[nylon.length - 1].qty).toBe(0)
  })

  it('merges German and French colour names onto the catalog row', () => {
    const { nylon } = buildColorBreakdown([
      doc({ id: 'de' }, [{ collection: 'CUTY', colorCord: 'Schwarz', quantity: '2', total: '68' }]),
      doc({ id: 'fr' }, [{ collection: 'CUTY', colorCord: 'Noir', quantity: '1', total: '34' }]),
      doc({ id: 'rot' }, [{ collection: 'CUTY', colorCord: 'Rot', quantity: '3', total: '102' }]),
    ])
    expect(nylon.find((c) => c.name === 'Black')).toMatchObject({ qty: 3, revenue: 102 })
    expect(nylon.find((c) => c.name === 'Red')).toMatchObject({ qty: 3, revenue: 102 })
    expect(nylon.filter((c) => /schwarz|noir|rot/i.test(c.name))).toEqual([])
  })

  it('sorts by revenue, colour name, or last-sold date', () => {
    const early = doc({ id: 'early', created_at: '2026-01-01T00:00:00Z' }, [CUTY])
    const lateRed = doc(
      { id: 'late', created_at: '2026-06-01T00:00:00Z' },
      [{ collection: 'CUTY', colorCord: 'Red', quantity: '1', total: '400' }],
    )
    const { nylon } = buildColorBreakdown([early, lateRed])
    expect(sortColorList(nylon, 'qty')[0].name).toBe('Black')
    expect(sortColorList(nylon, 'revenue')[0].name).toBe('Red')
    expect(sortColorList(nylon, 'name')[0].name).toBe('Black')
    expect(sortColorList(nylon, 'chrono')[0]).toMatchObject({ name: 'Red', lastSoldAt: '2026-06-01T00:00:00Z' })
  })
})

describe('buildClientBreakdown', () => {
  it('merges Stage, DE and FR\'s Friends into one Friends row', () => {
    const clients = buildClientBreakdown([
      { ...doc({ id: 'a', total_amount: 100 }), client_company: 'DE' },
      { ...doc({ id: 'b', total_amount: 80 }), client_company: 'Stage' },
      { ...doc({ id: 'c', total_amount: 20 }), client_company: "FR's Friends" },
      { ...doc({ id: 'd', total_amount: 50 }), client_company: 'Little Factory' },
    ])
    const friends = clients.find((c) => c.name === 'Friends')
    expect(friends).toMatchObject({ orders: 3, revenue: 200 })
    expect(clients.find((c) => c.name === 'Little Factory').revenue).toBe(50)
    expect(clients.filter((c) => /stage|de|friends/i.test(c.name))).toHaveLength(1)
  })
})

describe('buildCountryBreakdown', () => {
  it('lists every sold country with no cap, and keeps Unknown', () => {
    const countries = buildCountryBreakdown([
      doc({ id: '1', country: 'Germany', total_amount: 100 }),
      doc({ id: '2', country: 'Allemagne', total_amount: 50 }),
      doc({ id: '3', country: 'France', total_amount: 20 }),
      doc({ id: '4', country: '', total_amount: 10 }),
      doc({ id: '5', country: 'Italy', total_amount: 5 }),
      doc({ id: '6', country: 'Spain', total_amount: 4 }),
      doc({ id: '7', country: 'Austria', total_amount: 3 }),
      doc({ id: '8', country: 'Netherlands', total_amount: 2 }),
      doc({ id: '9', country: 'Belgium', total_amount: 1 }),
    ])
    expect(countries.map((c) => c.name)).toEqual([
      'Germany', 'France', 'Unknown', 'Italy', 'Spain', 'Austria', 'Netherlands', 'Belgium',
    ])
    expect(countries[0]).toMatchObject({ name: 'Germany', count: 2, revenue: 150 })
    expect(countries).toHaveLength(8)
  })

  it('treats DE and FR as Germany and France', () => {
    const countries = buildCountryBreakdown([
      doc({ id: '1', country: 'DE', total_amount: 40 }),
      doc({ id: '2', country: 'FR', total_amount: 10 }),
    ])
    expect(countries.map((c) => c.name).sort()).toEqual(['France', 'Germany'])
  })
})

describe('buildProductBreakdown', () => {
  it('rolls rows up by catalogue label', () => {
    const products = buildProductBreakdown([doc({}, [CUTY, { ...CUTY, quantity: '1', total: '34' }])])
    expect(products[0]).toMatchObject({ name: 'CUTY', qty: 3, revenue: 102 })
  })
})

describe('matchingLines / sliceAnalytics', () => {
  const germanySilk = doc({ id: 'de-silk', country: 'Germany', event_id: 'fair-1', events: { name: 'INHORGENTA' } }, [SSPF_SILK, CUTY])
  const germanyNylon = doc({ id: 'de-ny', country: 'Germany' }, [CUTY])
  const franceSilk = doc({ id: 'fr-silk', country: 'France' }, [SSPF_SILK])

  it('slice country+silk only counts matching lines', () => {
    const sliced = sliceAnalytics([germanySilk, germanyNylon, franceSilk], { country: 'Germany', material: 'silk' })
    expect(sliced.orders).toBe(1)
    expect(sliced.pieces).toBe(1)
    expect(sliced.revenue).toBe(200)
    expect(sliced.colors.silk.find((c) => c.name === 'Baby pink').qty).toBe(1)
    expect(sliced.colors.nylon.find((c) => c.name === 'Black').qty).toBe(0)
    expect(sliced.products.find((p) => p.name === 'CUTY')).toBeUndefined()
  })

  it('slice by fair name', () => {
    const sliced = sliceAnalytics([germanySilk, germanyNylon], { fair: 'INHORGENTA' })
    expect(sliced.orders).toBe(1)
    expect(sliced.pieces).toBe(3)
  })

  it('matchingLines is empty when nothing fits', () => {
    expect(matchingLines([germanyNylon], { country: 'Italy' })).toEqual([])
  })
})

describe('runAnalyticsTool', () => {
  const set = [
    doc({ id: 'de', country: 'Germany', total_amount: 500 }, [CUTY, SSPF_SILK]),
    doc({ id: 'fr', country: 'France', total_amount: 200 }, [SSPF_SILK]),
  ]

  it('colors respects material', () => {
    const nylonOnly = runAnalyticsTool('colors', { material: 'nylon' }, set)
    expect(nylonOnly.nylon.find((c) => c.name === 'Black').qty).toBe(2)
    expect(nylonOnly.silk).toBeUndefined()
  })

  it('countries returns every country', () => {
    const countries = runAnalyticsTool('countries', {}, set)
    expect(countries.map((c) => c.name).sort()).toEqual(['France', 'Germany'])
  })

  it('compare materials side by side', () => {
    const cmp = runAnalyticsTool('compare', { by: 'material', a: 'nylon', b: 'silk' }, set)
    expect(cmp.left.pieces).toBe(2)
    expect(cmp.right.pieces).toBe(2)
    expect(cmp.left.revenue).toBe(68)
    expect(cmp.right.revenue).toBe(400)
  })

  it('unknown tool names error instead of throwing', () => {
    expect(runAnalyticsTool('nope', {}, set)).toEqual({ error: 'Unknown tool: nope' })
  })

  it('clients tool returns the merged Friends group', () => {
    const clients = runAnalyticsTool('clients', {}, [
      { ...set[0], client_company: 'Stage' },
      { ...set[1], client_company: "FR's Friends" },
    ])
    expect(clients).toEqual([{ name: 'Friends', orders: 2, revenue: 700 }])
  })
})
