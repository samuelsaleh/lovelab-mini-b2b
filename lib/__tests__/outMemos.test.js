import {
  fmtAmount,
  memoTypesToFetch,
  mergeMemoLists,
  staysInCurrentFilter,
} from '../outMemos'

describe('fmtAmount', () => {
  it('puts a euro in front, a comma every thousand, and a point for cents', () => {
    expect(fmtAmount(194122)).toBe('€194,122.00')
    expect(fmtAmount(194122.5)).toBe('€194,122.50')
    expect(fmtAmount(194422)).toBe('€194,422.00')
    expect(fmtAmount('100')).toBe('€100.00')
  })

  it('does not use Indian lakhs or a European decimal comma', () => {
    expect(fmtAmount(194122)).not.toBe('1,94,122.00')
    expect(fmtAmount(194122)).not.toMatch(/194\.122/)
    expect(fmtAmount(194122)).not.toMatch(/194,122,00/)
  })

  it('returns an em dash for missing values', () => {
    expect(fmtAmount(null)).toBe('—')
    expect(fmtAmount(undefined)).toBe('—')
    expect(fmtAmount('')).toBe('—')
  })
})

describe('memo type filters', () => {
  it('loads only the selected memo_type for Agent, Party, and Internal', () => {
    expect(memoTypesToFetch('Party')).toEqual(['Party'])
    expect(memoTypesToFetch('Agent')).toEqual(['Agent'])
    expect(memoTypesToFetch('Internal')).toEqual(['Internal'])
  })

  it('merges lists and de-duplicates by memo number', () => {
    const merged = mergeMemoLists([
      [{ memo_no: 'A1', party: 'Acme' }],
      [{ memo_no: 'P1', party: 'Beta' }, { memo_no: 'A1', party: 'Acme-dup' }],
      [{ memo_no: 'I1', party: 'Gamma' }],
    ])
    expect(merged.map((m) => m.memo_no)).toEqual(['A1', 'P1', 'I1'])
  })

  it('removes a party from the list when dragged to another type', () => {
    expect(staysInCurrentFilter('Party', 'Agent')).toBe(false)
    expect(staysInCurrentFilter('Party', 'Internal')).toBe(false)
    expect(staysInCurrentFilter('Agent', 'Internal')).toBe(false)
    expect(staysInCurrentFilter('Agent', 'Agent')).toBe(true)
    expect(staysInCurrentFilter('Party', 'Party')).toBe(true)
  })
})
