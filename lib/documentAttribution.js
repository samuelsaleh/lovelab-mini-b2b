/**
 * One rule for "who does this document belong to" across the Documents UI.
 *
 * `GET /api/documents` already embeds `creator:profiles!created_by` (who typed
 * the order) and `agent:profiles!agent_id` (the selling agent). For an order an
 * agent saves themselves those two are the same person. They differ when an
 * admin or an assistant types an order on someone's behalf, and then both names
 * matter: the agent owns the sale, the creator explains where the row came from.
 */

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function displayName(party) {
  const name = String(party?.full_name || '').trim();
  if (name) return name;
  const email = String(party?.email || '').trim();
  return email || '';
}

function isSameParty(a, b) {
  const emailA = normalize(a?.email);
  const emailB = normalize(b?.email);
  if (emailA && emailB) return emailA === emailB;
  const nameA = normalize(a?.full_name);
  const nameB = normalize(b?.full_name);
  return Boolean(nameA) && nameA === nameB;
}

/**
 * @param {object} doc - a document row as returned by GET /api/documents
 * @returns {{ label: string|null, agentName: string, creatorName: string, viaCreator: boolean }}
 */
export function resolveDocumentAttribution(doc = {}) {
  const creatorName = displayName(doc?.creator);
  const agentName = displayName(doc?.agent);

  if (agentName && creatorName && !isSameParty(doc.creator, doc.agent)) {
    return {
      label: `${agentName} (via ${creatorName})`,
      agentName,
      creatorName,
      viaCreator: true,
    };
  }

  return {
    label: agentName || creatorName || null,
    agentName,
    creatorName,
    viaCreator: false,
  };
}

/**
 * Every name/email a user could reasonably type to find this document's people.
 * Kept separate from the display label so searching for the creator still works
 * when the row only shows the selling agent.
 */
export function documentAttributionSearchText(doc = {}) {
  return [
    doc?.creator?.full_name,
    doc?.creator?.email,
    doc?.agent?.full_name,
    doc?.agent?.email,
    doc?.consignment_agent?.full_name,
    doc?.consignment_agent?.email,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
