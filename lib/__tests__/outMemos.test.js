import {
  fmtAmount,
  isEveryoneMemoFilter,
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

describe('Party is everyone', () => {
  it('treats Party as the unfiltered everyone view', () => {
    expect(isEveryoneMemoFilter('Party')).toBe(true)
    expect(isEveryoneMemoFilter('Agent')).toBe(false)
    expect(memoTypesToFetch('Party')).toEqual(['Agent', 'Party', 'Internal'])
    expect(memoTypesToFetch('Agent')).toEqual(['Agent'])
  })

  it('merges the three lists and de-duplicates by memo number', () => {
    const merged = mergeMemoLists([
      [{ memo_no: 'A1', party: 'Acme' }],
      [{ memo_no: 'P1', party: 'Beta' }, { memo_no: 'A1', party: 'Acme-dup' }],
      [{ memo_no: 'I1', party: 'Gamma' }],
    ])
    expect(merged.map((m) => m.memo_no)).toEqual(['A1', 'P1', 'I1'])
  })

  it('keeps a party on screen after a drag when viewing Party', () => {
    expect(staysInCurrentFilter('Party', 'Agent')).toBe(true)
    expect(staysInCurrentFilter('Party', 'Internal')).toBe(true)
    expect(staysInCurrentFilter('Agent', 'Internal')).toBe(false)
    expect(staysInCurrentFilter('Agent', 'Agent')).toBe(true)
  })
})
