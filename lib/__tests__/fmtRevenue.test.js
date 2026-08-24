import { fmt, fmtRevenue, fmtStat, isHideRevenue, setHideRevenue } from '../utils'
import { HIDDEN_REVENUE_LABEL } from '../visitorAccess'

describe('fmtRevenue', () => {
  afterEach(() => {
    setHideRevenue(false)
  })

  test('matches fmt for real admin accounts', () => {
    expect(isHideRevenue()).toBe(false)
    expect(fmtRevenue(1500)).toBe(fmt(1500))
    expect(fmtRevenue(1469.55)).toBe(fmt(1469.55))
  })

  test('replaces business euros with a dash when the visitor flag is on', () => {
    setHideRevenue(true)
    expect(isHideRevenue()).toBe(true)
    expect(fmtRevenue(1500)).toBe(HIDDEN_REVENUE_LABEL)
    expect(fmtRevenue(0)).toBe(HIDDEN_REVENUE_LABEL)
    expect(fmt(1500)).toMatch(/€/)
  })

  test('turns back on after the flag is cleared', () => {
    setHideRevenue(true)
    expect(fmtRevenue(99)).toBe(HIDDEN_REVENUE_LABEL)
    setHideRevenue(false)
    expect(fmtRevenue(99)).toBe(fmt(99))
  })

  test('fmtStat hides order counts and pieces for the visitor', () => {
    expect(fmtStat(12)).toBe(12)
    setHideRevenue(true)
    expect(fmtStat(12)).toBe(HIDDEN_REVENUE_LABEL)
    expect(fmtStat(0)).toBe(HIDDEN_REVENUE_LABEL)
  })
})
