/**
 * Unit tests for lib/analyticsAudit.js
 *
 * Each check is exercised twice: on a clean dataset (must report ok) and on a
 * dataset carrying the exact defect it exists to catch (must report it, with
 * the right numbers). A check that cannot go green is as useless as one that
 * cannot go red.
 */

const {
  analyticsBaseDocs,
  checkHeadlineReconciliation,
  checkChannelSplit,
  checkFairAttribution,
  checkAgentCoverage,
  checkCollectionCoverage,
  checkAttributeBuckets,
  checkVitrines,
  checkFormStateCoverage,
  checkCountryCoverage,
  checkFolderSize,
  checkDuplicates,
  checkLineTotalsVsGrandTotal,
  runAnalyticsAudit,
  FOLDER_FETCH_LIMIT,
} = require('../analyticsAudit')

// ─── Fixtures ──────────────────────────────────────────────────────────────
let seq = 0
function order(overrides = {}) {
  seq += 1
  return {
    id: `doc-${seq}`,
    document_type: 'order',
    order_channel: 'b2b',
    status: 'sent',
    total_amount: 1000,
    client_company: `Company ${seq}`,
    client_name: `Buyer ${seq}`,
    event_id: 'fair-1',
    agent_id: 'agent-1',
    created_at: `2026-03-${String((seq % 28) + 1).padStart(2, '0')}T09:00:00.000Z`,
    deleted_at: null,
    metadata: {
      formState: {
        country: 'France',
        rows: [{ collection: 'MULTI THREE', quantity: '2', total: '1000', carat: '0.30', shape: 'Round', size: '42', colorCord: 'Black' }],
      },
    },
    ...overrides,
  }
}

const EVENTS = [
  { id: 'fair-1', name: 'Nordstil', type: 'fair' },
  { id: 'fair-2', name: 'Inhorgenta', type: 'fair' },
  { id: 'agent-folder-1', name: 'Bastian Mayer', type: 'agent' },
  { id: 'partner-1', name: 'Showroom Milano', type: 'partner' },
]

const clean = () => [order(), order(), order({ event_id: 'fair-2' })]

// ─── analyticsBaseDocs ─────────────────────────────────────────────────────
describe('analyticsBaseDocs', () => {
  it('keeps ordinary sent documents', () => {
    expect(analyticsBaseDocs(clean())).toHaveLength(3)
  })

  it('drops drafts, trashed rows and non-revenue channels', () => {
    const docs = [
      order(),
      order({ status: 'draft', total_amount: 999999 }),
      order({ deleted_at: '2026-04-01T00:00:00.000Z', total_amount: 888888 }),
      order({ order_channel: 'internal', total_amount: 777777 }),
      order({ order_channel: 'consignment', total_amount: 666666 }),
      order({ order_channel: 'delete_from_stock', total_amount: 555555 }),
      order({ order_channel: 'sample', total_amount: 444444 }),
    ]
    const base = analyticsBaseDocs(docs)
    expect(base).toHaveLength(1)
    expect(base[0].total_amount).toBe(1000)
  })

  it('deduplicates by id so a doubled row cannot inflate a total', () => {
    const dup = order()
    expect(analyticsBaseDocs([dup, { ...dup }])).toHaveLength(1)
  })

  it('survives null entries and an empty list', () => {
    expect(analyticsBaseDocs([null, undefined])).toHaveLength(0)
    expect(analyticsBaseDocs([])).toHaveLength(0)
    expect(analyticsBaseDocs()).toHaveLength(0)
  })
})

// ─── 1. Headline reconciliation ────────────────────────────────────────────
describe('checkHeadlineReconciliation', () => {
  it('passes when there are no quotes', () => {
    const result = checkHeadlineReconciliation(analyticsBaseDocs(clean()))
    expect(result.status).toBe('ok')
    expect(result.data).toMatchObject({ panelTotal: 3000, kpiRevenue: 3000, delta: 0, quotes: 0 })
  })

  it('reports the exact gap a quote opens between the two headlines', () => {
    const base = analyticsBaseDocs([...clean(), order({ document_type: 'quote', total_amount: 250.5 })])
    const result = checkHeadlineReconciliation(base)
    expect(result.status).toBe('warn')
    expect(result.data).toMatchObject({ panelTotal: 3250.5, kpiRevenue: 3000, delta: 250.5, quotes: 1, quoteValue: 250.5 })
  })

  it('treats a missing total_amount as zero', () => {
    const base = analyticsBaseDocs([order({ total_amount: null })])
    expect(checkHeadlineReconciliation(base).data.kpiRevenue).toBe(0)
  })
})

// ─── 2. Channel split ──────────────────────────────────────────────────────
describe('checkChannelSplit', () => {
  it('confirms B2B + B2C equals All', () => {
    const base = analyticsBaseDocs([order(), order({ order_channel: 'b2c', total_amount: 95 })])
    const result = checkChannelSplit(base)
    expect(result.status).toBe('ok')
    expect(result.data).toMatchObject({ all: 1095, b2b: 1000, b2c: 95, delta: 0 })
  })

  it('counts a null channel on the B2B side rather than losing it', () => {
    const base = analyticsBaseDocs([order({ order_channel: null })])
    const result = checkChannelSplit(base)
    expect(result.status).toBe('ok')
    expect(result.data).toMatchObject({ all: 1000, b2b: 1000, b2c: 0 })
  })
})

// ─── 3. Fair attribution ───────────────────────────────────────────────────
describe('checkFairAttribution', () => {
  it('passes when every order sits in a real fair', () => {
    const result = checkFairAttribution(analyticsBaseDocs(clean()), EVENTS)
    expect(result.status).toBe('ok')
    expect(result.data).toMatchObject({ fairRevenue: 3000, offFair: 0 })
  })

  it('separates agent folders, partners and No Event from real fairs', () => {
    const base = analyticsBaseDocs([
      order({ total_amount: 1000 }),
      order({ event_id: 'agent-folder-1', total_amount: 400 }),
      order({ event_id: 'partner-1', total_amount: 300 }),
      order({ event_id: null, total_amount: 200 }),
    ])
    const result = checkFairAttribution(base, EVENTS)
    expect(result.status).toBe('warn')
    expect(result.data.fairRevenue).toBe(1000)
    expect(result.data.offFair).toBe(900)
    expect(result.data.byType).toMatchObject({ fair: 1000, agent: 400, partner: 300, none: 200 })
    expect(result.details.join('\n')).toContain('Bastian Mayer')
  })

  it('labels a folder that no longer exists instead of crashing', () => {
    const base = analyticsBaseDocs([order({ event_id: 'deleted-event' })])
    const result = checkFairAttribution(base, EVENTS)
    expect(result.data.byType).toMatchObject({ unknown: 1000 })
    expect(result.details.join('\n')).toContain('Unknown folder')
  })

  it('ignores quotes, matching the chart', () => {
    const base = analyticsBaseDocs([order(), order({ document_type: 'quote', event_id: null, total_amount: 5000 })])
    expect(checkFairAttribution(base, EVENTS).data).toMatchObject({ total: 1000, offFair: 0 })
  })
})

// ─── 4. Agent coverage ─────────────────────────────────────────────────────
describe('checkAgentCoverage', () => {
  it('passes when every order names a selling agent', () => {
    expect(checkAgentCoverage(analyticsBaseDocs(clean())).status).toBe('ok')
  })

  it('quantifies the revenue the chart drops', () => {
    const base = analyticsBaseDocs([order({ total_amount: 1000 }), order({ agent_id: null, total_amount: 700 })])
    const result = checkAgentCoverage(base)
    expect(result.status).toBe('warn')
    expect(result.data).toMatchObject({ withAgent: 1, withoutAgent: 1, chartedRevenue: 1000, hiddenRevenue: 700 })
  })

  it('treats an absent column as no agent', () => {
    const base = analyticsBaseDocs([order({ agent_id: undefined })])
    expect(checkAgentCoverage(base).data.withoutAgent).toBe(1)
  })
})

// ─── 5. Collection coverage ────────────────────────────────────────────────
describe('checkCollectionCoverage', () => {
  it('passes when every line matches the catalogue exactly', () => {
    const result = checkCollectionCoverage(analyticsBaseDocs(clean()))
    expect(result.status).toBe('ok')
    expect(result.data).toMatchObject({ exact: 3, substringOnly: 0, unknownRows: 0 })
  })

  it('flags a substring-only line as a Quick Stats blind spot', () => {
    const base = analyticsBaseDocs([order({
      metadata: { formState: { rows: [{ collection: 'MULTI THREE 0.30ct', quantity: '2' }] } },
    })])
    const result = checkCollectionCoverage(base)
    expect(result.status).toBe('info')
    expect(result.data).toMatchObject({ exact: 0, substringOnly: 1, unknownRows: 0 })
    expect(result.details.join('\n')).toContain('DROPPED from Quick Stats')
  })

  it('lists a retired collection name with its lost quantity', () => {
    const base = analyticsBaseDocs([order({
      metadata: { formState: { rows: [{ collection: 'SHAPY SHINE LEGACY', quantity: '7' }] } },
    })])
    const result = checkCollectionCoverage(base)
    expect(result.status).toBe('warn')
    expect(result.data.unknown).toEqual([{ name: 'SHAPY SHINE LEGACY', rows: 1, qty: 7 }])
  })

  it('skips blank collection cells without counting them as unknown', () => {
    const base = analyticsBaseDocs([order({
      metadata: { formState: { rows: [{ collection: '', quantity: '1' }, { collection: '  ', quantity: '1' }] } },
    })])
    const result = checkCollectionCoverage(base)
    expect(result.data).toMatchObject({ rows: 2, named: 0, unknownRows: 0 })
  })

  it('handles documents with no saved form at all', () => {
    const base = analyticsBaseDocs([order({ metadata: null })])
    expect(checkCollectionCoverage(base).data).toMatchObject({ rows: 0, named: 0 })
  })
})

// ─── 6. Attribute buckets ──────────────────────────────────────────────────
describe('checkAttributeBuckets', () => {
  it('passes when values are spelled consistently', () => {
    expect(checkAttributeBuckets(analyticsBaseDocs(clean())).status).toBe('ok')
  })

  it('catches the same carat written two ways', () => {
    const base = analyticsBaseDocs([
      order({ metadata: { formState: { rows: [{ collection: 'MULTI THREE', carat: '1.00', quantity: '1' }] } } }),
      order({ metadata: { formState: { rows: [{ collection: 'MULTI THREE', carat: '1.0', quantity: '1' }] } } }),
      order({ metadata: { formState: { rows: [{ collection: 'MULTI THREE', carat: '1ct', quantity: '1' }] } } }),
    ])
    const result = checkAttributeBuckets(base)
    expect(result.status).toBe('warn')
    const carat = result.data.splits.find((s) => s.panel === 'Carat Breakdown')
    expect(carat.variants.sort()).toEqual(['1.0', '1.00', '1ct'])
  })

  it('catches cord colours differing only by case or spacing', () => {
    const base = analyticsBaseDocs([
      order({ metadata: { formState: { rows: [{ collection: 'MULTI THREE', colorCord: 'Black', quantity: '1' }] } } }),
      order({ metadata: { formState: { rows: [{ collection: 'MULTI THREE', colorCord: 'black', quantity: '1' }] } } }),
    ])
    const result = checkAttributeBuckets(base)
    const cord = result.data.splits.find((s) => s.panel === 'Cord Colors')
    expect(cord.variants.sort()).toEqual(['Black', 'black'])
  })

  it('ignores rows whose collection Quick Stats would have dropped anyway', () => {
    const base = analyticsBaseDocs([
      order({ metadata: { formState: { rows: [{ collection: 'UNKNOWN THING', carat: '1.00', quantity: '1' }] } } }),
      order({ metadata: { formState: { rows: [{ collection: 'UNKNOWN THING', carat: '1.0', quantity: '1' }] } } }),
    ])
    expect(checkAttributeBuckets(base).status).toBe('ok')
  })
})

// ─── 7. Vitrines ───────────────────────────────────────────────────────────
describe('checkVitrines', () => {
  it('passes when every vitrine comes from the toggle', () => {
    const base = analyticsBaseDocs([
      order({ metadata: { formState: { hasVitrine: true, vitrineQty: 2, rows: [] } } }),
      order({ metadata: { formState: { hasVitrine: true, vitrineQty: 1, rows: [] } } }),
    ])
    const result = checkVitrines(base)
    expect(result.status).toBe('ok')
    expect(result.data).toMatchObject({ totalQty: 3, fromToggle: 2, fromRemarks: 0 })
  })

  it('separates remarks-derived vitrines from toggled ones', () => {
    const base = analyticsBaseDocs([
      order({ metadata: { formState: { hasVitrine: true, vitrineQty: 2, rows: [] } } }),
      order({ metadata: { formState: { remarks: '3 vitrines', rows: [] } } }),
    ])
    const result = checkVitrines(base)
    expect(result.status).toBe('warn')
    expect(result.data).toMatchObject({ totalQty: 5, fromToggle: 1, fromRemarks: 1 })
  })

  it('reports a clamped quantity with the client name', () => {
    const base = analyticsBaseDocs([order({
      client_company: 'Bijoux SA',
      metadata: { formState: { remarks: 'ref 1250 vitrine', rows: [] } },
    })])
    const result = checkVitrines(base)
    expect(result.status).toBe('warn')
    expect(result.data.totalQty).toBe(1)
    expect(result.data.clamped).toEqual([{ who: 'Bijoux SA', raw: 1250, source: 'remarks' }])
  })

  it('reports zero when nobody bought a vitrine', () => {
    const result = checkVitrines(analyticsBaseDocs(clean()))
    expect(result.data).toMatchObject({ totalQty: 0, docs: 0 })
    expect(result.status).toBe('ok')
  })
})

// ─── 8. Form-state coverage ────────────────────────────────────────────────
describe('checkFormStateCoverage', () => {
  it('passes when every document carries its form', () => {
    expect(checkFormStateCoverage(analyticsBaseDocs(clean())).status).toBe('ok')
  })

  it('reports revenue that cannot reach the breakdown panels', () => {
    const base = analyticsBaseDocs([order(), order({ metadata: null, total_amount: 2500 })])
    const result = checkFormStateCoverage(base)
    expect(result.status).toBe('warn')
    expect(result.data).toMatchObject({ missingFormState: 1, missingRevenue: 2500 })
  })

  it('counts a form with no product lines separately', () => {
    const base = analyticsBaseDocs([order({ metadata: { formState: { country: 'France', rows: [] } } })])
    const result = checkFormStateCoverage(base)
    expect(result.data).toMatchObject({ missingFormState: 0, formStateWithoutRows: 1 })
  })
})

// ─── 9. Country coverage ───────────────────────────────────────────────────
describe('checkCountryCoverage', () => {
  it('passes when every document resolves to a country', () => {
    expect(checkCountryCoverage(analyticsBaseDocs(clean())).status).toBe('ok')
  })

  it('reports documents that land in Unknown', () => {
    const base = analyticsBaseDocs([order(), order({ metadata: { formState: { country: '', rows: [] } }, total_amount: 400 })])
    const result = checkCountryCoverage(base)
    expect(result.status).toBe('warn')
    expect(result.data).toMatchObject({ unknownDocs: 1, unknownRevenue: 400 })
  })

  it('collapses aliases so one country is not double counted', () => {
    const base = analyticsBaseDocs([
      order({ metadata: { formState: { country: 'Allemagne', rows: [] } } }),
      order({ metadata: { formState: { country: 'Germany', rows: [] } } }),
    ])
    const result = checkCountryCoverage(base)
    const germany = result.data.rows.filter((r) => r.name === 'Germany')
    expect(germany).toHaveLength(1)
    expect(germany[0].docs).toBe(2)
  })
})

// ─── 10. Folder size ───────────────────────────────────────────────────────
describe('checkFolderSize', () => {
  it('passes for small folders', () => {
    const result = checkFolderSize(analyticsBaseDocs(clean()), EVENTS)
    expect(result.status).toBe('ok')
    expect(result.data.largest).toMatchObject({ name: 'Nordstil', docs: 2 })
  })

  it('warns as a folder approaches the un-paginated fetch cap', () => {
    const docs = Array.from({ length: 160 }, () => order())
    const result = checkFolderSize(analyticsBaseDocs(docs), EVENTS)
    expect(result.status).toBe('warn')
    expect(result.details.join('\n')).toContain('does not paginate')
  })

  it('fails once a folder is truncated', () => {
    const docs = Array.from({ length: FOLDER_FETCH_LIMIT + 5 }, () => order())
    const result = checkFolderSize(analyticsBaseDocs(docs), EVENTS)
    expect(result.status).toBe('fail')
    expect(result.data.over[0]).toMatchObject({ name: 'Nordstil', docs: FOLDER_FETCH_LIMIT + 5 })
  })

  it('ignores unfiled documents, which use the complete paginated list', () => {
    const docs = Array.from({ length: 400 }, () => order({ event_id: null }))
    const result = checkFolderSize(analyticsBaseDocs(docs), EVENTS)
    expect(result.status).toBe('ok')
    expect(result.data.largest).toBeNull()
  })

  it('honours a custom limit', () => {
    const docs = Array.from({ length: 12 }, () => order())
    expect(checkFolderSize(analyticsBaseDocs(docs), EVENTS, 10).status).toBe('fail')
  })
})

// ─── 11. Duplicates ────────────────────────────────────────────────────────
describe('checkDuplicates', () => {
  it('passes on distinct documents', () => {
    const docs = clean()
    expect(checkDuplicates(docs, analyticsBaseDocs(docs)).status).toBe('ok')
  })

  it('fails when the same id arrives twice', () => {
    const dup = order()
    const docs = [dup, { ...dup }]
    const result = checkDuplicates(docs, analyticsBaseDocs(docs))
    expect(result.status).toBe('fail')
    expect(result.data.duplicateIds).toEqual([dup.id])
  })

  it('notes identical client, day and amount as worth a look', () => {
    const docs = [
      order({ client_company: 'Bijoux SA', created_at: '2026-03-04T09:00:00.000Z', total_amount: 500 }),
      order({ client_company: 'Bijoux SA', created_at: '2026-03-04T17:00:00.000Z', total_amount: 500 }),
    ]
    const result = checkDuplicates(docs, analyticsBaseDocs(docs))
    expect(result.status).toBe('info')
    expect(result.data.suspects[0]).toMatchObject({ count: 2, amount: 500, day: '2026-03-04' })
  })

  it('does not flag two same-day orders of different amounts', () => {
    const docs = [
      order({ client_company: 'Bijoux SA', created_at: '2026-03-04T09:00:00.000Z', total_amount: 500 }),
      order({ client_company: 'Bijoux SA', created_at: '2026-03-04T17:00:00.000Z', total_amount: 600 }),
    ]
    expect(checkDuplicates(docs, analyticsBaseDocs(docs)).status).toBe('ok')
  })
})

// ─── 12. Line totals vs grand total ────────────────────────────────────────
describe('checkLineTotalsVsGrandTotal', () => {
  it('quantifies the expected gap without calling it an error', () => {
    const base = analyticsBaseDocs([order({
      total_amount: 1200,
      metadata: { formState: { rows: [{ collection: 'MULTI THREE', quantity: '1', total: '1000' }] } },
    })])
    const result = checkLineTotalsVsGrandTotal(base)
    expect(result.status).toBe('info')
    expect(result.data).toMatchObject({ revenue: 1200, lineTotal: 1000, gap: 200, comparableOrders: 1 })
  })

  it('skips orders with no lines rather than counting them as a gap', () => {
    const base = analyticsBaseDocs([order({ total_amount: 500, metadata: { formState: { rows: [] } } })])
    expect(checkLineTotalsVsGrandTotal(base).data).toMatchObject({ comparableOrders: 0, lineTotal: 0 })
  })
})

// ─── Orchestration ─────────────────────────────────────────────────────────
describe('runAnalyticsAudit', () => {
  it('returns every check with a summary on a clean dataset', () => {
    const result = runAnalyticsAudit({ documents: clean(), events: EVENTS })
    expect(result.checks).toHaveLength(12)
    expect(result.summary.fail).toBe(0)
    expect(result.summary.warn).toBe(0)
    expect(result.totals).toMatchObject({ rawDocuments: 3, countedDocuments: 3, revenue: 3000 })
  })

  it('every check exposes the same shape', () => {
    const { checks } = runAnalyticsAudit({ documents: clean(), events: EVENTS })
    for (const c of checks) {
      expect(typeof c.id).toBe('string')
      expect(typeof c.title).toBe('string')
      expect(['ok', 'info', 'warn', 'fail']).toContain(c.status)
      expect(typeof c.headline).toBe('string')
      expect(Array.isArray(c.details)).toBe(true)
      expect(c.data).toBeDefined()
    }
  })

  it('surfaces failures in the summary', () => {
    const documents = Array.from({ length: FOLDER_FETCH_LIMIT + 1 }, () => order())
    const result = runAnalyticsAudit({ documents, events: EVENTS })
    expect(result.summary.fail).toBeGreaterThan(0)
  })

  it('does not throw on an empty database', () => {
    const result = runAnalyticsAudit({ documents: [], events: [] })
    expect(result.totals).toMatchObject({ rawDocuments: 0, countedDocuments: 0, revenue: 0 })
    expect(result.summary.fail).toBe(0)
  })

  it('does not throw on no arguments at all', () => {
    expect(() => runAnalyticsAudit()).not.toThrow()
  })

  it('ignores every excluded document exactly as the dashboard does', () => {
    const documents = [
      ...clean(),
      order({ status: 'draft', total_amount: 428945 }),
      order({ order_channel: 'consignment', total_amount: 5000 }),
      order({ deleted_at: '2026-04-01T00:00:00.000Z', total_amount: 3000 }),
    ]
    const result = runAnalyticsAudit({ documents, events: EVENTS })
    expect(result.totals).toMatchObject({ rawDocuments: 6, countedDocuments: 3, revenue: 3000 })
  })
})
