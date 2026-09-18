import { isUserAllowed } from '../auth/isUserAllowed'

describe('who may sign in', () => {
  it('lets the internal team in by their email', () => {
    expect(isUserAllowed({ isInAllowedEmails: true, agentProfile: null })).toBe(true)
  })

  it('lets an active agent in', () => {
    expect(isUserAllowed({
      isInAllowedEmails: false,
      agentProfile: { is_agent: true, agent_status: 'active', agent_deleted_at: null },
    })).toBe(true)
  })

  it('lets IGI in without being on the internal email list', () => {
    // They are another company. The gate only says they may sign in; where they
    // may go once inside is decided in lib/supabase/middleware.js.
    expect(isUserAllowed({
      isInAllowedEmails: false,
      agentProfile: { is_igi: true, is_agent: false, agent_status: null, agent_deleted_at: null },
    })).toBe(true)
  })

  it('does not let IGI in on a flag that is merely truthy', () => {
    expect(isUserAllowed({
      isInAllowedEmails: false,
      agentProfile: { is_igi: 'no', is_agent: false, agent_status: null },
    })).toBe(false)
  })

  it('still refuses everybody else', () => {
    expect(isUserAllowed({ isInAllowedEmails: false, agentProfile: null })).toBe(false)
    expect(isUserAllowed({
      isInAllowedEmails: false,
      agentProfile: { is_agent: true, agent_status: 'inactive', agent_deleted_at: null },
    })).toBe(false)
    expect(isUserAllowed({
      isInAllowedEmails: false,
      agentProfile: { is_agent: true, agent_status: 'active', agent_deleted_at: '2026-01-01' },
    })).toBe(false)
  })
})

describe('IGI named in IGI_EMAILS (10 Sept 2026)', () => {
  const { getIgiEmails, isIgiEmail } = require('../auth/igiEmails')

  it('may sign in before any profile exists — the first login creates it', () => {
    expect(isUserAllowed({ isInAllowedEmails: false, agentProfile: null, isIgiEmail: true })).toBe(true)
  })

  it('reads the list case-insensitively and ignores spaces', () => {
    const env = { IGI_EMAILS: ' Michael@IGI.org, hardik@igi.org ,' }
    expect(getIgiEmails(env)).toEqual(['michael@igi.org', 'hardik@igi.org'])
    expect(isIgiEmail('MICHAEL@igi.org', env)).toBe(true)
    expect(isIgiEmail('sam@love-lab.com', env)).toBe(false)
    expect(isIgiEmail(null, env)).toBe(false)
    expect(getIgiEmails({})).toEqual([])
  })
})
