/**
 * @jest-environment node
 *
 * Regression pins for the order-email recipient configuration:
 *
 * 1. The historical "hardcoded admin CC" bug: both /api/resources/send-email
 *    and /api/documents/send-email previously hardcoded albertosaleh@gmail.com
 *    in the CC list, so changing Alberto's email anywhere in env had no
 *    effect. The fix routes both files through getAdminNotificationRecipients.
 *
 * 2. The May 2026 BCC switch (this file's reason for existing today):
 *    client order emails went out with the office inboxes + admin Gmail
 *    addresses visible in CC and a forced reply_to header, exposing internal
 *    addresses to clients and forcing replies away from the From mailbox.
 *    Fix: BCC instead of CC, no reply_to (replies fall back to the From
 *    address — dionne@love-lab.com).
 *
 * Both bugs share the same files, so they share one regression file.
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

  it('documents/send-email/route.js still keeps the office inboxes hardcoded as team BCCs', () => {
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

describe('documents/send-email/route.js — BCC + no reply_to', () => {
  // Source-string assertions. Pairs with send-email-recipients.test.js which
  // exercises the actual payload at runtime.
  let src
  beforeAll(() => {
    src = readSource('documents/send-email/route.js')
  })

  it('builds the order recipient list as BCC, not CC', () => {
    expect(src).toMatch(/buildOrderBccRecipients/)
    // No leftover CC builder from the pre-fix code path.
    expect(src).not.toMatch(/buildOrderCcRecipients/)
  })

  it('uses bcc: in the Resend payload (not cc:)', () => {
    expect(src).toMatch(/bcc:\s*bccEmails/)
    // The cc: key on the payload object would re-introduce the bug. Match
    // the property literal precisely so `// cc: ...` style comments don't
    // false-positive.
    expect(src).not.toMatch(/^\s*cc:\s/m)
  })

  it('sets no reply_to header — replies fall back to From', () => {
    // Match the property literal precisely (start-of-line) so the explanatory
    // "// No reply_to: ..." comments in the route don't false-positive — same
    // approach as the cc: assertion above.
    expect(src).not.toMatch(/^\s*reply_to:/m)
    expect(src).not.toMatch(/REPLY_TO_RECIPIENTS/)
  })

  it('keeps the office BCC constant exported by name (regression-pin)', () => {
    expect(src).toMatch(/OFFICE_BCC_RECIPIENTS\s*=\s*\[\s*'dionne@love-lab\.com'\s*,\s*'elie@love-lab\.com'\s*\]/)
  })
})
