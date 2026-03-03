import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

const BUCKET = 'documents';

async function getFileWithAccess(adminSupabase, fileId, userId) {
  const { data: file } = await adminSupabase
    .from('agent_folder_files')
    .select('id, name, file_path, file_size, folder_id, created_at')
    .eq('id', fileId)
    .single();

  if (!file) return { file: null, allowed: false };

  const { data: folder } = await adminSupabase
    .from('agent_folders')
    .select('agent_id')
    .eq('id', file.folder_id)
    .single();

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  const isAdmin = profile?.role === 'admin';
  const allowed = isAdmin || (folder?.agent_id === userId);
  return { file, allowed };
}

// GET /api/agent-folder-files/[id] — get a signed download URL
export async function GET(request, { params }) {
  try {
    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: fileId } = await params;
    const { file, allowed } = await getFileWithAccess(adminSupabase, fileId, user.id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: signedData, error } = await adminSupabase.storage
      .from(BUCKET)
      .createSignedUrl(file.file_path, 3600);

    if (error) return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });

    return NextResponse.json({ url: signedData.signedUrl, name: file.name });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/agent-folder-files/[id]
export async function DELETE(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'agent-files-del' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: fileId } = await params;
    const { file, allowed } = await getFileWithAccess(adminSupabase, fileId, user.id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Remove from storage
    await adminSupabase.storage.from(BUCKET).remove([file.file_path]).catch(() => {});

    // Remove DB record
    await adminSupabase.from('agent_folder_files').delete().eq('id', fileId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[agent-folder-files DELETE] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
