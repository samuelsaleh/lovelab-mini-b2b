function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function uniqueDocumentsById(documents = []) {
  return [...new Map(documents.map((document) => [document.id, document])).values()];
}

export function scopeOrganizationFolderDocuments({
  documents = [],
  organizationId = null,
  currentFolder = null,
  rootAgent = {},
} = {}) {
  const unique = uniqueDocumentsById(documents);
  if (!organizationId) return unique;
  if (currentFolder?.name === 'Sub-agents') return [];

  const targetId = currentFolder?.agent_id || rootAgent.id || null;
  const targetEmail = normalizeEmail(currentFolder?.agent_email || rootAgent.email);
  if (!targetId && !targetEmail) return [];

  return unique.filter((document) => {
    if (targetId && document.created_by === targetId) return true;
    return Boolean(targetEmail && normalizeEmail(document.creator?.email) === targetEmail);
  });
}
