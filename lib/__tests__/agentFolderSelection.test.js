import { findAgentFolderEvent } from '../agentFolderSelection'

const EVENTS = [
  { id: 'fair-inova', name: 'INOVA FRANKFURT', type: 'fair', organization_id: null },
  { id: 'corinne-folder', name: 'CORINNE SECRET CODE PARIS', type: 'agent', organization_id: 'org-corinne' },
  { id: 'team-a', name: 'Agent A', type: 'agent', organization_id: 'org-team' },
  { id: 'team-b', name: 'Agent B', type: 'agent', organization_id: 'org-team' },
]

describe('findAgentFolderEvent', () => {
  test('selects the exact agent folder instead of an unrelated fair', () => {
    expect(findAgentFolderEvent(EVENTS, {
      id: 'corinne',
      full_name: 'CORINNE SECRET CODE PARIS',
      organization_id: 'org-corinne',
    })).toEqual(EVENTS[1])
  })

  test('uses a single legacy organization folder after an agent rename', () => {
    expect(findAgentFolderEvent(EVENTS, {
      id: 'corinne',
      full_name: 'Corinne Renamed',
      organization_id: 'org-corinne',
    })).toEqual(EVENTS[1])
  })

  test('does not guess between multiple folders in a shared organization', () => {
    expect(findAgentFolderEvent(EVENTS, {
      id: 'unknown-team-member',
      full_name: 'Unknown Team Member',
      organization_id: 'org-team',
    })).toBeNull()
  })
})
