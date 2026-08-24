import {
  HIDDEN_REVENUE_LABEL,
  hidesRevenue,
  isVisitorEmail,
  normalizeEmail,
} from '../visitorAccess'

describe('visitorAccess', () => {
  test('normalizes email case and whitespace', () => {
    expect(normalizeEmail('  SSALEH@TraxB2B.com  ')).toBe('ssaleh@traxb2b.com')
  })

  test('recognizes the sales visitor mailbox', () => {
    expect(isVisitorEmail('ssaleh@traxb2b.com')).toBe(true)
    expect(isVisitorEmail('SSALEH@TRAXB2B.COM')).toBe(true)
    expect(isVisitorEmail('  ssaleh@traxb2b.com  ')).toBe(true)
  })

  test('does not hide revenue for real LoveLab accounts', () => {
    expect(isVisitorEmail('sam@lovelab.be')).toBe(false)
    expect(isVisitorEmail('admin@lovelab.test')).toBe(false)
    expect(isVisitorEmail('')).toBe(false)
    expect(hidesRevenue(null)).toBe(false)
    expect(hidesRevenue({ email: 'ruby@lovelab.be', role: 'admin' })).toBe(false)
  })

  test('hides revenue from a profile or a raw email', () => {
    expect(hidesRevenue('ssaleh@traxb2b.com')).toBe(true)
    expect(hidesRevenue({ email: 'ssaleh@traxb2b.com', role: 'admin' })).toBe(true)
    expect(HIDDEN_REVENUE_LABEL).toBe('—')
  })
})
