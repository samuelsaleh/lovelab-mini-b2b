import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { resolveAgentIds } from '@/app/api/_lib/access';

const BUCKET = 'documents';

const MAX_RECURSION_DEPTH = 20;

async function collectFilePaths(adminSupabase, folderId, depth = 0) {
  if (depth > MAX_RECURSION_DEPTH) {
    console.warn(`[agent-folders] collectFilePaths hit depth limit (${MAX_RECURSION_DEPTH}) at folder ${folderId}`);
    return [];
  }

  const paths = [];

  const { data: files } = await adminSupabase
    .from('agent_folder_files')
    .select('file_path')
    .eq('folder_id', folderId);
  for (const f of files || []) paths.push(f.file_path);

  const { data: subfolders } = await adminSupabase
    .from('agent_folders')
    .select('id')
    .eq('parent_id', folderId);
  for (const sf of subfolders || []) {
    const childPaths = await collectFilePaths(adminSupabase, sf.id, depth + 1);
    paths.push(...childPaths);
  }

  return paths;
}

// DELETE /api/agent-folders/[id] — delete folder, all children, and their storage files
export async function DELETE(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'agent-folders-del' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: folderId } = await params;

    // Fetch folder to verify ownership
    const { data: folder } = await adminSupabase
      .from('agent_folders')
      .select('id, agent_id, parent_id')
      .eq('id', folderId)
      .single();

    if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });

    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';
    const allIds = await resolveAgentIds(adminSupabase, folder.agent_id);
    if (!isAdmin && !allIds.includes(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Root folders (parent_id = null) cannot be deleted
    if (!folder.parent_id) {
      return NextResponse.json({ error: 'Cannot delete the root folder' }, { status: 400 });
    }

    // Collect all storage file paths before deleting DB rows
    const filePaths = await collectFilePaths(adminSupabase, folderId);

    // Delete from storage
    if (filePaths.length > 0) {
      await adminSupabase.storage.from(BUCKET).remove(filePaths);
    }

    // Delete folder (cascades to subfolders and files via FK ON DELETE CASCADE)
    await adminSupabase.from('agent_folders').delete().eq('id', folderId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[agent-folders DELETE] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
