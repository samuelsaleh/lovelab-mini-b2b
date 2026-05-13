/**
 * @jest-environment node
 *
 * Unit coverage for the recipient-parsing helpers in lib/email.js. These
 * helpers are now the single source of truth for "who receives admin /
 * order emails" so every transactional route shares the same parsing rules.
 */

describe('lib/email.js — getAdminNotificationRecipients', () => {
  let getAdminNotificationRecipients
  let getSenderEmail

  beforeEach(() => {
    jest.resetModules()
    delete process.env.ADMIN_NOTIFICATION_EMAIL
    delete process.env.SENDER_EMAIL
    ;({ getAdminNotificationRecipients, getSenderEmail } = require('../email'))
  })

  it('defaults to albertosaleh@gmail.com when env is unset', () => {
    const out = getAdminNotificationRecipients()
    expect(out.to).toBe('albertosaleh@gmail.com')
    expect(out.cc).toEqual([])
    expect(out.all).toEqual(['albertosaleh@gmail.com'])
  })

  it('defaults when env value is empty/whitespace', () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = '   '
    const out = getAdminNotificationRecipients()
    expect(out.to).toBe('albertosaleh@gmail.com')
    expect(out.cc).toEqual([])
  })

  it('parses single recipient — no cc', () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = 'solo@example.com'
    const out = getAdminNotificationRecipients()
    expect(out.to).toBe('solo@example.com')
    expect(out.cc).toEqual([])
  })

  it('parses primary + cc list', () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = 'a@x.com, b@x.com, c@x.com'
    const out = getAdminNotificationRecipients()
    expect(out.to).toBe('a@x.com')
    expect(out.cc).toEqual(['b@x.com', 'c@x.com'])
    expect(out.all).toEqual(['a@x.com', 'b@x.com', 'c@x.com'])
  })

  it('lowercases, trims, and dedupes case-insensitively', () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = '  Alberto@Gmail.com , ALBERTO@gmail.com , Sam@Gmail.com '
    const out = getAdminNotificationRecipients()
    expect(out.to).toBe('alberto@gmail.com')
    expect(out.cc).toEqual(['sam@gmail.com'])
  })

  it('drops empty fragments from comma soup', () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = 'a@x.com,,,b@x.com,'
    const out = getAdminNotificationRecipients()
    expect(out.all).toEqual(['a@x.com', 'b@x.com'])
  })
})

describe('lib/email.js — getSenderEmail default', () => {
  it('falls back to dionne@love-lab.com when SENDER_EMAIL is unset', () => {
    // Production sender is Dionne's office address — client replies funnel
    // into the team mailbox, not Alberto's personal inbox. Pin the default
    // so a future refactor can't silently revert to alberto@.
    jest.resetModules()
    delete process.env.SENDER_EMAIL
    const { getSenderEmail } = require('../email')
    expect(getSenderEmail()).toBe('dionne@love-lab.com')
  })

  it('honors SENDER_EMAIL override', () => {
    jest.resetModules()
    process.env.SENDER_EMAIL = 'custom@love-lab.com'
    const { getSenderEmail } = require('../email')
    expect(getSenderEmail()).toBe('custom@love-lab.com')
  })
})
