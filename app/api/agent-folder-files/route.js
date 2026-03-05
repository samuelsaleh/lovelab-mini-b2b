import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { resolveAgentIds } from '@/app/api/_lib/access';

const BUCKET = 'documents';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'text/plain', 'text/csv',
]);

const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png|gif|webp|svg|docx?|xlsx?|pptx?|txt|csv)$/i;

// GET /api/agent-folder-files?folder_id= — list files in a folder
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'agent-files-get' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folder_id');
    if (!folderId) return NextResponse.json({ error: 'folder_id is required' }, { status: 400 });

    // Verify access via folder ownership
    const { data: folder } = await adminSupabase
      .from('agent_folders')
      .select('agent_id')
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

    const { data: files, error } = await adminSupabase
      .from('agent_folder_files')
      .select('id, name, file_path, file_size, created_at')
      .eq('folder_id', folderId)
      .order('name', { ascending: true });

    if (error) return NextResponse.json({ error: 'Failed to load files' }, { status: 500 });

    return NextResponse.json({ files: files || [] });
  } catch (err) {
    console.error('[agent-folder-files GET] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/agent-folder-files — upload a file into a folder
export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'agent-files-post' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file');
    const folderId = formData.get('folder_id');

    if (!file || typeof file === 'string') return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!folderId) return NextResponse.json({ error: 'folder_id is required' }, { status: 400 });

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });
    }

    const mimeOk = ALLOWED_MIME_TYPES.has(file.type);
    const extOk = ALLOWED_EXTENSIONS.test(file.name);
    if (!mimeOk && !extOk) {
      return NextResponse.json({
        error: 'File type not allowed. Accepted: PDF, images, Office docs, text, CSV.',
      }, { status: 400 });
    }

    // Verify folder exists and check access
    const { data: folder } = await adminSupabase
      .from('agent_folders')
      .select('agent_id')
      .eq('id', folderId)
      .single();

    if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });

    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';
    const postAllIds = await resolveAgentIds(adminSupabase, folder.agent_id);
    if (!isAdmin && !postAllIds.includes(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._\-() ]/g, '_').slice(0, 200);
    const filePath = `agent-files/${folder.agent_id}/${folderId}/${Date.now()}-${sanitizedName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await adminSupabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType: file.type || 'application/octet-stream', upsert: false });

    if (uploadError) {
      console.error('[agent-folder-files POST] Upload error:', uploadError.message);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    const { data: fileRecord, error: dbError } = await adminSupabase
      .from('agent_folder_files')
      .insert({ folder_id: folderId, name: sanitizedName, file_path: filePath, file_size: file.size, uploaded_by: user.id })
      .select()
      .single();

    if (dbError) {
      // Try to clean up storage on DB failure
      await adminSupabase.storage.from(BUCKET).remove([filePath]).catch(() => {});
      return NextResponse.json({ error: 'File uploaded but failed to save record' }, { status: 500 });
    }

    return NextResponse.json({ file: fileRecord });
  } catch (err) {
    console.error('[agent-folder-files POST] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
