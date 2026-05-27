/**
 * @jest-environment node
 *
 * Pins the branding rule: every user-visible string in the shared template
 * helpers says "LoveLab", never "LoveLab B2B". Regression net for the audit's
 * P1#7 — older templates still referenced the legacy "LoveLab B2B" name even
 * after the new auth templates moved to bare "LoveLab".
 */

const {
  welcomeAgentEmail,
  welcomeAgentWithPasswordEmail,
  upgradeAgentEmail,
  restoreAgentEmail,
  approvedSignupEmail,
  orgInvitationEmail,
} = require('../email-templates')

const SITE_URL = 'https://app.lovelab.com'

describe('lib/email-templates.js — LoveLab branding', () => {
  it('welcomeAgentEmail subject + body avoid "LoveLab B2B"', () => {
    const { subject, html } = welcomeAgentEmail('Marc', `${SITE_URL}/login`, SITE_URL)
    expect(subject).not.toMatch(/LoveLab B2B/)
    expect(html).not.toMatch(/LoveLab B2B/)
    expect(subject).toMatch(/LoveLab/)
  })

  it('welcomeAgentWithPasswordEmail subject + body avoid "LoveLab B2B" and include the credentials', () => {
    const { subject, html } = welcomeAgentWithPasswordEmail('Michaela', 'm@test.com', 'Michaela4821!', `${SITE_URL}/login`, SITE_URL)
    expect(subject).not.toMatch(/LoveLab B2B/)
    expect(html).not.toMatch(/LoveLab B2B/)
    expect(subject).toMatch(/LoveLab/)
    expect(html).toContain('m@test.com')
    expect(html).toContain('Michaela4821!')
  })

  it('upgradeAgentEmail subject + body avoid "LoveLab B2B"', () => {
    const { subject, html } = upgradeAgentEmail('Marc', SITE_URL)
    expect(subject).not.toMatch(/LoveLab B2B/)
    expect(html).not.toMatch(/LoveLab B2B/)
  })

  it('restoreAgentEmail subject + body avoid "LoveLab B2B"', () => {
    const { subject, html } = restoreAgentEmail('Marc', `${SITE_URL}/login`, SITE_URL)
    expect(subject).not.toMatch(/LoveLab B2B/)
    expect(html).not.toMatch(/LoveLab B2B/)
  })

  it('approvedSignupEmail subject + body avoid "LoveLab B2B"', () => {
    const { subject, html } = approvedSignupEmail('Marc', `${SITE_URL}/login`, SITE_URL)
    expect(subject).not.toMatch(/LoveLab B2B/)
    expect(html).not.toMatch(/LoveLab B2B/)
  })

  it('orgInvitationEmail subject + body avoid "LoveLab B2B"', () => {
    const { subject, html } = orgInvitationEmail('Acme Corp', SITE_URL)
    expect(subject).not.toMatch(/LoveLab B2B/)
    expect(html).not.toMatch(/LoveLab B2B/)
  })

  it('shared layout footer says "LoveLab", not "LoveLab B2B"', () => {
    // Every template uses layout(), so reading any one of them gives us the footer.
    const { html } = welcomeAgentEmail('Marc', `${SITE_URL}/login`, SITE_URL)
    expect(html).toMatch(/LoveLab\s*&middot;\s*This email was sent automatically/)
    expect(html).not.toMatch(/LoveLab B2B/)
  })
})
