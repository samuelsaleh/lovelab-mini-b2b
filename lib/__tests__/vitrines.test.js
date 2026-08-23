/**
 * Unit tests for lib/vitrines.js
 *
 * Locks in the behaviour AnalyticsDashboard relied on before the logic was
 * extracted, plus the provenance data the audit script needs.
 */

const {
  parseVitrineFromRemarks,
  resolveVitrineDetail,
  resolveVitrineQty,
  MAX_VITRINE_QTY,
} = require('../vitrines')

const doc = (formState, extra = {}) => ({ metadata: { formState }, ...extra })

describe('parseVitrineFromRemarks', () => {
  it('returns null for empty input', () => {
    expect(parseVitrineFromRemarks('')).toBeNull()
    expect(parseVitrineFromRemarks(null)).toBeNull()
    expect(parseVitrineFromRemarks(undefined)).toBeNull()
  })

  it('reads a quantity before the word', () => {
    expect(parseVitrineFromRemarks('2 vitrines offertes')).toBe(2)
    expect(parseVitrineFromRemarks('1 vitrine')).toBe(1)
    expect(parseVitrineFromRemarks('3vitrines')).toBe(3)
  })

  it('reads a quantity after the word, with or without a multiplier sign', () => {
    expect(parseVitrineFromRemarks('vitrine x3')).toBe(3)
    expect(parseVitrineFromRemarks('vitrines × 4')).toBe(4)
    expect(parseVitrineFromRemarks('vitrine 5')).toBe(5)
  })

  it('assumes one when the word appears with no number', () => {
    expect(parseVitrineFromRemarks('merci pour la vitrine')).toBe(1)
    expect(parseVitrineFromRemarks('VITRINE')).toBe(1)
  })

  it('ignores remarks that never mention a vitrine', () => {
    expect(parseVitrineFromRemarks('livraison 2 semaines')).toBeNull()
  })
})

describe('resolveVitrineDetail', () => {
  it('returns nothing when there is no saved form', () => {
    expect(resolveVitrineDetail({})).toMatchObject({ qty: null, source: null })
    expect(resolveVitrineDetail(null)).toMatchObject({ qty: null, source: null })
    expect(resolveVitrineDetail({ metadata: {} })).toMatchObject({ qty: null, source: null })
  })

  it('prefers the toggle over the remarks when both are present', () => {
    const d = doc({ hasVitrine: true, vitrineQty: 2, remarks: '9 vitrines' })
    expect(resolveVitrineDetail(d)).toMatchObject({ qty: 2, source: 'toggle', clamped: false })
  })

  it('defaults the toggle to one when no quantity was typed', () => {
    expect(resolveVitrineDetail(doc({ hasVitrine: true }))).toMatchObject({ qty: 1, source: 'toggle' })
    expect(resolveVitrineDetail(doc({ hasVitrine: true, vitrineQty: 0 }))).toMatchObject({ qty: 1 })
  })

  it('coerces a string quantity to a number so totals cannot concatenate', () => {
    const detail = resolveVitrineDetail(doc({ hasVitrine: true, vitrineQty: '3' }))
    expect(detail.qty).toBe(3)
    expect(typeof detail.qty).toBe('number')
  })

  it('falls back to the remarks when the toggle is off', () => {
    const d = doc({ hasVitrine: false, remarks: 'vitrine x2' })
    expect(resolveVitrineDetail(d)).toMatchObject({ qty: 2, source: 'remarks' })
  })

  it('ignores a zero or negative quantity', () => {
    expect(resolveVitrineDetail(doc({ hasVitrine: false, remarks: '0 vitrines' }))).toMatchObject({ qty: null })
    expect(resolveVitrineDetail(doc({ hasVitrine: true, vitrineQty: -4 }))).toMatchObject({ qty: null })
  })

  it('clamps an implausible quantity to one and reports it', () => {
    const d = doc({ hasVitrine: false, remarks: 'ref 1250 vitrine' })
    const detail = resolveVitrineDetail(d)
    expect(detail).toMatchObject({ qty: 1, raw: 1250, clamped: true, source: 'remarks' })
  })

  it('accepts the highest plausible quantity without clamping', () => {
    const d = doc({ hasVitrine: true, vitrineQty: MAX_VITRINE_QTY })
    expect(resolveVitrineDetail(d)).toMatchObject({ qty: MAX_VITRINE_QTY, clamped: false })
  })
})

describe('resolveVitrineQty', () => {
  it('returns just the quantity', () => {
    expect(resolveVitrineQty(doc({ hasVitrine: true, vitrineQty: 4 }))).toBe(4)
    expect(resolveVitrineQty(doc({}))).toBeNull()
  })

  it('warns once when a quantity had to be clamped', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    resolveVitrineQty(doc({ hasVitrine: true, vitrineQty: 900 }, { client_company: 'Bijoux SA' }))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('Bijoux SA')
    warn.mockRestore()
  })

  it('stays silent for a normal order', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    resolveVitrineQty(doc({ hasVitrine: true, vitrineQty: 2 }))
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
