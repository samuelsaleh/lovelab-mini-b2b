export function isAdmin(profile) {
  return profile?.role === 'admin';
}

export function normalizeSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildRootFolder(organization) {
  if (!organization?.id) {
    throw new Error('buildRootFolder requires an organization with an id');
  }
  const slug = normalizeSegment(organization.name) || organization.id;
  return `organizations/${organization.id}-${slug}`;
}
