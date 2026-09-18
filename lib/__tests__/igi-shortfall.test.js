/**
 * What went missing on a movement (Sam, 18 Sept 2026).
 */
import { shortOnIssue, shortOnReturn } from '../igi/shortfall'

const LINES = [
  { qty_requested: 100, qty_issued: 60, qty_received: 58 },   // 40 fewer than asked, 2 missing on return
  { qty_requested: 40, qty_issued: 40, qty_received: 40 },    // fine
  { qty_requested: 10, qty_issued: 12, qty_received: 12 },    // more than asked: not a shortfall
]

describe('shortOnIssue', () => {
  it('sums what was asked but not made, and never counts extra against it', () => {
    expect(shortOnIssue(LINES)).toBe(40)
  })
  it('is zero before IGI have recorded anything', () => {
    expect(shortOnIssue([{ qty_requested: 100, qty_issued: null }])).toBe(0)
    expect(shortOnIssue([])).toBe(0)
    expect(shortOnIssue(undefined)).toBe(0)
  })
})

describe('shortOnReturn', () => {
  it('sums what IGI made that did not come back', () => {
    expect(shortOnReturn(LINES)).toBe(2)
  })
  it('is zero until the return is confirmed', () => {
    expect(shortOnReturn([{ qty_requested: 100, qty_issued: 60, qty_received: null }])).toBe(0)
  })
})
