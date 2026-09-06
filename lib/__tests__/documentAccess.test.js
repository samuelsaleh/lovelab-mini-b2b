import {
  documentIsOwnOrCredited,
  canViewDocumentInSharedEvent,
  buildAgentDocumentOrFilter,
  buildAssistantDocumentOrFilter,
} from '../documentAccess'

const BASTIAN = 'bastian-id'
const ALBERTO = 'alberto-id'
const OTHER = 'silke-id'

describe('documentIsOwnOrCredited', () => {
  test('true when the agent created the order', () => {
    expect(documentIsOwnOrCredited({ created_by: BASTIAN, agent_id: BASTIAN }, [BASTIAN])).toBe(true)
  })

  test('true when an admin typed the order but credited the agent', () => {
    expect(documentIsOwnOrCredited({ created_by: ALBERTO, agent_id: BASTIAN }, [BASTIAN])).toBe(true)
  })

  test('false for an admin-taken order with no agent credit', () => {
    expect(documentIsOwnOrCredited({ created_by: ALBERTO, agent_id: null }, [BASTIAN])).toBe(false)
  })

  test('false for another agent\'s order', () => {
    expect(documentIsOwnOrCredited({ created_by: OTHER, agent_id: OTHER }, [BASTIAN])).toBe(false)
  })

  test('accepts a Set of self ids (re-invited emails)', () => {
    expect(documentIsOwnOrCredited({ created_by: 'legacy-id' }, new Set(['legacy-id', BASTIAN]))).toBe(true)
  })

  test('false for empty self ids', () => {
    expect(documentIsOwnOrCredited({ created_by: BASTIAN }, [])).toBe(false)
  })
})

describe('canViewDocumentInSharedEvent', () => {
  const adminDoc = { created_by: ALBERTO, agent_id: null }

  test('admin sees every order', () => {
    expect(canViewDocumentInSharedEvent(adminDoc, { isAdmin: true, selfIds: [BASTIAN] })).toBe(true)
  })

  test('assistant sees every order in the granted fair', () => {
    expect(canViewDocumentInSharedEvent(adminDoc, { isAssistant: true, selfIds: ['asst-1'] })).toBe(true)
  })

  test('agent does not see an admin-taken order', () => {
    expect(canViewDocumentInSharedEvent(adminDoc, { selfIds: [BASTIAN] })).toBe(false)
  })

  test('agent sees an order credited to them', () => {
    expect(canViewDocumentInSharedEvent(
      { created_by: ALBERTO, agent_id: BASTIAN },
      { selfIds: [BASTIAN] },
    )).toBe(true)
  })
})

describe('buildAgentDocumentOrFilter', () => {
  test('folder click uses only the agent\'s ids, not teammates', () => {
    expect(buildAgentDocumentOrFilter({
      selfIds: [BASTIAN],
      teamCreatorIds: [BASTIAN],
      includeAgentId: true,
    })).toBe(`created_by.in.(${BASTIAN}),agent_id.in.(${BASTIAN})`)
  })

  test('All Documents can expand created_by to teammates while agent_id stays self', () => {
    expect(buildAgentDocumentOrFilter({
      selfIds: [BASTIAN],
      teamCreatorIds: [BASTIAN, OTHER],
      includeAgentId: true,
    })).toBe(`created_by.in.(${BASTIAN},${OTHER}),agent_id.in.(${BASTIAN})`)
  })

  test('omits agent_id when the column is missing', () => {
    expect(buildAgentDocumentOrFilter({
      selfIds: [BASTIAN],
      includeAgentId: false,
    })).toBe(`created_by.in.(${BASTIAN})`)
  })

  test('never includes event_id — that is the leak we closed', () => {
    const filter = buildAgentDocumentOrFilter({ selfIds: [BASTIAN], includeAgentId: true })
    expect(filter).not.toMatch(/event_id/)
  })
})

describe('buildAssistantDocumentOrFilter', () => {
  test('unlocks every order in granted fairs', () => {
    expect(buildAssistantDocumentOrFilter({
      selfIds: ['asst-1'],
      accessibleEventIds: ['inova'],
    })).toBe('created_by.in.(asst-1),event_id.in.(inova)')
  })
})
