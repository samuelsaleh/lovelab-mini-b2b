const {
  aliasCordColorName,
  clientNameFromDoc,
  resolveClientName,
} = require('../analyticsAliases')

describe('resolveClientName — DE / Stage / FR\'s Friends', () => {
  it('merges the three spellings onto Friends', () => {
    expect(resolveClientName('DE')).toEqual({ key: 'friends', name: 'Friends' })
    expect(resolveClientName('Stage')).toEqual({ key: 'friends', name: 'Friends' })
    expect(resolveClientName("FR's Friends")).toEqual({ key: 'friends', name: 'Friends' })
    expect(resolveClientName('FR Friends')).toEqual({ key: 'friends', name: 'Friends' })
    expect(resolveClientName('Friends')).toEqual({ key: 'friends', name: 'Friends' })
  })

  it('reads the company off a document and leaves other clients alone', () => {
    expect(clientNameFromDoc({ client_company: 'stage', client_name: 'Marie' }))
      .toEqual({ key: 'friends', name: 'Friends' })
    expect(resolveClientName('Little Factory').name).toBe('Little Factory')
  })
})

describe('aliasCordColorName — DE / FR names', () => {
  it('maps German and French names onto catalog English', () => {
    expect(aliasCordColorName('Rot')).toBe('Red')
    expect(aliasCordColorName('Rouge')).toBe('Red')
    expect(aliasCordColorName('Schwarz')).toBe('Black')
    expect(aliasCordColorName('Noir')).toBe('Black')
    expect(aliasCordColorName('stage')).toBe('Sage')
    expect(aliasCordColorName('Gris argenté')).toBe('Silver Grey')
  })

  it('passes catalog English through', () => {
    expect(aliasCordColorName('Baby pink')).toBe('Baby pink')
    expect(aliasCordColorName('Navy Blue')).toBe('Navy Blue')
  })
})
