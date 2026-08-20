/**
 * Pure "which agent folder does this person own" matching, extracted so repair
 * scripts make the same choice as the live save path in ensure-agent-folder.js.
 *
 * Why this exists: before per-member folders were provisioned, an order saved by
 * a team member auto-filed into the FIRST agent folder of their organization —
 * in practice the owner's folder. Every member's orders piled up under one name,
 * so an admin could not tell who had sold what. Matching by name (not by
 * "first in the org") is what keeps that from happening again.
 *
 * Relative imports only, so node:test and jest can load this without Next
 * path aliases.
 */

export function nameKey(value) {
  return String(value || '').trim().toLowerCase();
}

/** The folder name the live save path would use for this profile. */
export function agentFolderName(profile) {
  return String(profile?.full_name || '').trim() || String(profile?.email || '').trim();
}

/**
 * The agent-type event that belongs to this person.
 *
 * Mirrors ensureAgentFolderEvent's read order:
 *   1. same-organization folder whose name matches the person
 *   2. name match anywhere (only when the person has no organization)
 *   3. a folder they created, preferring a name match
 *
 * @param {object} params
 * @param {object} params.profile - { full_name, email }
 * @param {Iterable<string>} [params.orgIds] - organizations the person belongs to
 * @param {Array} [params.agentEvents] - all events with type='agent'
 * @param {Iterable<string>} [params.userIds] - profile ids sharing this person's email
 * @returns {object|null} the matching event row, or null
 */
export function matchAgentFolderEvent({
  profile,
  orgIds = [],
  agentEvents = [],
  userIds = [],
} = {}) {
  const wantName = nameKey(agentFolderName(profile));
  const orgIdSet = new Set([...orgIds].filter(Boolean));
  const userIdSet = new Set([...userIds].filter(Boolean));
  if (profile?.id) userIdSet.add(profile.id);

  if (wantName && orgIdSet.size > 0) {
    const inOrg = agentEvents.find(
      (event) => event?.organization_id
        && orgIdSet.has(event.organization_id)
        && nameKey(event.name) === wantName,
    );
    if (inOrg) return inOrg;
  } else if (wantName) {
    const anywhere = agentEvents.find((event) => nameKey(event?.name) === wantName);
    if (anywhere) return anywhere;
  }

  const own = agentEvents.filter((event) => userIdSet.has(event?.created_by));
  const ownByName = own.find((event) => nameKey(event.name) === wantName);
  return ownByName || own[0] || null;
}

/**
 * Should this already-filed document move to a different agent folder?
 *
 * Deliberately conservative — only moves a document that sits in an agent
 * folder of its own creator's organization. Fair folders, other orgs' folders,
 * unfiled documents, drafts and admin-created rows are all left alone.
 *
 * @param {object} params
 * @param {object} params.document - { id, event_id, status, created_by }
 * @param {object|null} params.profile - the creator's profile row
 * @param {Iterable<string>} [params.orgIds] - the creator's organizations
 * @param {Array} [params.agentEvents] - all events with type='agent'
 * @param {Iterable<string>} [params.userIds] - profile ids sharing the creator's email
 * @returns {{ action: 'move'|'skip', targetEvent?: object, reason: string }}
 */
export function resolveMisfiledAgentOrder({
  document,
  profile,
  orgIds = [],
  agentEvents = [],
  userIds = [],
} = {}) {
  if (!document?.event_id) return { action: 'skip', reason: 'not filed in any folder' };
  if (document.status === 'draft') return { action: 'skip', reason: 'draft' };
  if (!profile) return { action: 'skip', reason: 'creator profile missing' };
  if (profile.role === 'admin') return { action: 'skip', reason: 'created by an admin' };

  const currentEvent = agentEvents.find((event) => event?.id === document.event_id);
  if (!currentEvent) return { action: 'skip', reason: 'not in an agent folder' };

  const orgIdSet = new Set([...orgIds].filter(Boolean));
  if (!currentEvent.organization_id || !orgIdSet.has(currentEvent.organization_id)) {
    return { action: 'skip', reason: "agent folder outside the creator's organization" };
  }

  const target = matchAgentFolderEvent({ profile, orgIds: orgIdSet, agentEvents, userIds });
  if (!target) return { action: 'skip', reason: 'no personal folder exists yet' };
  if (target.id === document.event_id) return { action: 'skip', reason: 'already in the right folder' };

  return { action: 'move', targetEvent: target, reason: `filed under "${currentEvent.name}"` };
}
