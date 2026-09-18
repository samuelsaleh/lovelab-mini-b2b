/**
 * Which certificate models may be deleted (Sam, 18 Sept 2026).
 */
import { whyNotDeletableModel, canDeleteModel } from '../igi/models'

describe('whyNotDeletableModel', () => {
  it('lets a model still waiting for its serial go — nothing hangs on it', () => {
    expect(whyNotDeletableModel({ name: 'Sam Test 1', state: 'awaiting_serial', serial: null })).toBeNull()
    expect(canDeleteModel({ state: 'awaiting_serial' })).toBe(true)
  })

  it('never lets a numbered model go, and says why with its serial', () => {
    const reason = whyNotDeletableModel({ name: 'Cuty-Cubix', serial: 'LGAJ6530', state: 'in_use' })
    expect(reason).toMatch(/^LGAJ6530 is in use\./)
    expect(reason).toMatch(/printed certificates/)
    expect(canDeleteModel({ serial: 'LGAJ6530', state: 'in_use' })).toBe(false)
  })

  it('keeps a reserved serial too — it is IGI’s number', () => {
    expect(whyNotDeletableModel({ name: '—', serial: 'LGAJ6588', state: 'reserved' })).toMatch(/is a reserved serial/)
  })

  it('has an answer for a model that is not there', () => {
    expect(whyNotDeletableModel(null)).toBe('That model does not exist.')
  })
})
