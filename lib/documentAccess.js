/**
 * Fair-invite document visibility.
 *
 * event_access opens a FOLDER. It does not, by itself, open every order in
 * that folder. Commercial assistants still see the whole fair (they type
 * everyone else's orders). Agents see only orders they created or that an
 * admin credited to them (documents.agent_id).
 */

function toIdSet(selfIds) {
  if (selfIds instanceof Set) return selfIds;
  return new Set((selfIds || []).filter(Boolean));
}

/** True when the document was typed by this user or credited to them. */
export function documentIsOwnOrCredited(doc, selfIds = []) {
  if (!doc) return false;
  const ids = toIdSet(selfIds);
  if (ids.size === 0) return false;
  if (ids.has(doc.created_by)) return true;
  if (doc.agent_id && ids.has(doc.agent_id)) return true;
  return false;
}

/**
 * After folder-level permission is already known, may this user see THIS row?
 * Admins and assistants: yes. Agents: only own or credited.
 */
export function canViewDocumentInSharedEvent(doc, {
  isAdmin = false,
  isAssistant = false,
  selfIds = [],
} = {}) {
  if (isAdmin) return true;
  if (isAssistant) return true;
  return documentIsOwnOrCredited(doc, selfIds);
}

/**
 * PostgREST OR for an invited agent's document list.
 * Folder click uses selfIds only (not teammates). All-Documents uses
 * teamCreatorIds for created_by plus selfIds for agent_id.
 */
export function buildAgentDocumentOrFilter({
  selfIds = [],
  teamCreatorIds = null,
  includeAgentId = true,
} = {}) {
  const creators = [...new Set((teamCreatorIds || selfIds || []).filter(Boolean))];
  const selves = [...new Set((selfIds || []).filter(Boolean))];
  const parts = [];
  if (creators.length) parts.push(`created_by.in.(${creators.join(',')})`);
  if (includeAgentId && selves.length) parts.push(`agent_id.in.(${selves.join(',')})`);
  return parts.join(',') || null;
}

/** PostgREST OR for a commercial assistant: own rows + every row in granted fairs. */
export function buildAssistantDocumentOrFilter({
  selfIds = [],
  accessibleEventIds = [],
} = {}) {
  const selves = [...new Set((selfIds || []).filter(Boolean))];
  const events = [...new Set((accessibleEventIds || []).filter(Boolean))];
  const parts = [];
  if (selves.length) parts.push(`created_by.in.(${selves.join(',')})`);
  if (events.length) parts.push(`event_id.in.(${events.join(',')})`);
  return parts.join(',') || null;
}
