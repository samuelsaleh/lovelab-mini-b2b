/**
 * Resolve the document folder that represents a selling agent.
 *
 * Prefer an exact named folder. A single organization folder is a safe
 * fallback for legacy solo-agent organizations whose folder predates a rename.
 * Never guess inside a multi-member organization.
 */
export function findAgentFolderEvent(events, agent) {
  if (!agent || !Array.isArray(events)) return null

  const agentEvents = events.filter((event) => event?.type === 'agent')
  const nameKey = (agent.full_name || '').trim().toLowerCase()
  if (nameKey) {
    const exact = agentEvents.find(
      (event) => (event.name || '').trim().toLowerCase() === nameKey,
    )
    if (exact) return exact
  }

  if (!agent.organization_id) return null
  const organizationEvents = agentEvents.filter(
    (event) => event.organization_id === agent.organization_id,
  )
  return organizationEvents.length === 1 ? organizationEvents[0] : null
}
