/**
 * @jest-environment node
 *
 * Regression pin for the hardcoded admin CC bug. Both /api/resources/send-email
 * and /api/documents/send-email previously hardcoded albertosaleh@gmail.com
 * directly in the CC list, so changing Alberto's email anywhere in env had no
 * effect. The fix routes both files through getAdminNotificationRecipients —
 * this test makes sure nobody re-introduces the hardcode.
 */

const fs = require('node:fs')
const path = require('node:path')

function readSource(rel) {
  return fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8')
}

describe('send-email routes — hardcoded admin CC regression', () => {
  it('resources/send-email/route.js does NOT hardcode albertosaleh@gmail.com', () => {
    const src = readSource('resources/send-email/route.js')
    expect(src).not.toMatch(/albertosaleh@gmail\.com/i)
  })

  it('resources/send-email/route.js imports getAdminNotificationRecipients', () => {
    const src = readSource('resources/send-email/route.js')
    expect(src).toMatch(/getAdminNotificationRecipients/)
  })

  it('documents/send-email/route.js does NOT hardcode albertosaleh@gmail.com', () => {
    const src = readSource('documents/send-email/route.js')
    expect(src).not.toMatch(/albertosaleh@gmail\.com/i)
  })

  it('documents/send-email/route.js imports getAdminNotificationRecipients', () => {
    const src = readSource('documents/send-email/route.js')
    expect(src).toMatch(/getAdminNotificationRecipients/)
  })

  it('documents/send-email/route.js still keeps the office inboxes hardcoded as team CCs', () => {
    // Office mailboxes (dionne@, elie@) are intentional — every order email
    // must funnel through them. The fix only swapped Alberto's *personal*
    // Gmail to env-driven, not the team inboxes.
    const src = readSource('documents/send-email/route.js')
    expect(src).toMatch(/dionne@love-lab\.com/)
    expect(src).toMatch(/elie@love-lab\.com/)
  })

  it('backup/route.js parses the env via the shared helper (not raw string)', () => {
    const src = readSource('backup/route.js')
    expect(src).toMatch(/getAdminNotificationRecipients/)
    // Make sure the bug pattern is gone: passing the raw env string straight
    // into the recipient array (e.g. `to: [process.env.ADMIN_NOTIFICATION_EMAIL …]`).
    expect(src).not.toMatch(/to:\s*\[\s*process\.env\.ADMIN_NOTIFICATION_EMAIL/)
  })
})
