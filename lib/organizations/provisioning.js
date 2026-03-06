import { createAdminClient } from '@/lib/supabase/server';
import {
  buildRootFolder,
  DEFAULT_SUBFOLDERS,
  normalizeSegment,
} from '@/lib/organizations/utils';

const DEFAULT_BUCKET = process.env.AGENT_DOCUMENTS_BUCKET || 'agent-documents';

async function ensureFolderMarker(adminSupabase, bucket, folderPath) {
  const markerPath = `${folderPath}/.keep`;
  const content = new TextEncoder().encode('');

  // Upsert keeps this idempotent in retries/concurrent calls.
  const { error } = await adminSupabase.storage
    .from(bucket)
    .upload(markerPath, content, { contentType: 'text/plain', upsert: true });

  if (error && !/already exists/i.test(error.message || '')) {
    console.error('[org-provisioning] Failed to create folder marker: %s', markerPath, error.message);
    throw error;
  }
}

export async function ensureOrganizationFolders(organization, options = {}) {
  if (!organization?.id) {
    console.error('[org-provisioning] ensureOrganizationFolders called without organization id');
    throw new Error('Missing organization id');
  }

  const bucket = options.bucket || DEFAULT_BUCKET;
  const adminSupabase = createAdminClient();
  const rootPath = buildRootFolder(organization);

  await ensureFolderMarker(adminSupabase, bucket, rootPath);

  for (const sub of DEFAULT_SUBFOLDERS) {
    const subPath = `${rootPath}/${normalizeSegment(sub)}`;
    await ensureFolderMarker(adminSupabase, bucket, subPath);
  }

  return {
    bucket,
    rootPath,
    subfolders: DEFAULT_SUBFOLDERS.map((sub) => `${rootPath}/${normalizeSegment(sub)}`),
  };
}

export { DEFAULT_SUBFOLDERS, normalizeSegment, buildRootFolder };
