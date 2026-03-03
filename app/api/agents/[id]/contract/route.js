import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const BUCKET = 'documents';
const PDF_MIME_TYPES = new Set(['application/pdf', 'application/x-pdf', 'binary/octet-stream']);

function isPdfLike(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  return name.endsWith('.pdf') || PDF_MIME_TYPES.has(type);
}

async function getAdminUser(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };
  const adminSupabase = createAdminClient();
  const { data: profile } = await adminSupabase.from('profiles').select('role').eq('id', user.id).single();
  return { user, profile };
}

// POST /api/agents/[id]/contract — upload PDF contract (admin or the agent themselves)
export async function POST(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 10, prefix: 'contract-post' });
    if (rateLimitRes) return rateLimitRes;

    const { user, profile } = await getAdminUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    const { id: agentId } = await params;
    if (!agentId) return NextResponse.json({ error: 'Missing agent ID' }, { status: 400 });

    const isAdmin = profile?.role === 'admin';
    const isSelf = user.id === agentId;
    if (!isAdmin && !isSelf) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!isPdfLike(file)) {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = `contracts/${agentId}/${fileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const adminSupabase = createAdminClient();

    const { error: uploadError } = await adminSupabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType: 'application/pdf', upsert: true });

    if (uploadError) {
      console.error('[Contract POST] Upload error:', uploadError.message);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    const { error: updateError } = await adminSupabase
      .from('profiles')
      .update({ agent_contract_url: filePath })
      .eq('id', agentId);

    if (updateError) {
      console.error('[Contract POST] DB update error:', updateError.message);
      return NextResponse.json({ error: 'File uploaded but failed to save path' }, { status: 500 });
    }

    return NextResponse.json({ success: true, path: filePath, name: file.name });
  } catch (err) {
    console.error('[Contract POST] Error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/agents/[id]/contract — get signed URL (admin or the agent themselves)
export async function GET(request, { params }) {
  try {
    const { user, profile } = await getAdminUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: agentId } = await params;
    if (!agentId) return NextResponse.json({ error: 'Missing agent ID' }, { status: 400 });

    const isAdmin = profile?.role === 'admin';
    const isSelf = user.id === agentId;
    if (!isAdmin && !isSelf) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const adminSupabase = createAdminClient();
    const { data: agentProfile } = await adminSupabase
      .from('profiles')
      .select('agent_contract_url')
      .eq('id', agentId)
      .single();

    if (!agentProfile?.agent_contract_url) {
      return NextResponse.json({ url: null });
    }

    const { data: signedData, error } = await adminSupabase.storage
      .from(BUCKET)
      .createSignedUrl(agentProfile.agent_contract_url, 3600);

    if (error) {
      return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
    }

    const fileName = agentProfile.agent_contract_url.split('/').pop();
    return NextResponse.json({ url: signedData.signedUrl, name: fileName });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/agents/[id]/contract — remove contract (admin or the agent themselves)
export async function DELETE(request, { params }) {
  try {
    const { user, profile } = await getAdminUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    const { id: agentId } = await params;
    if (!agentId) return NextResponse.json({ error: 'Missing agent ID' }, { status: 400 });

    const isAdmin = profile?.role === 'admin';
    const isSelf = user.id === agentId;
    if (!isAdmin && !isSelf) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const adminSupabase = createAdminClient();
    const { data: agentProfile } = await adminSupabase
      .from('profiles')
      .select('agent_contract_url')
      .eq('id', agentId)
      .single();

    if (agentProfile?.agent_contract_url) {
      await adminSupabase.storage.from(BUCKET).remove([agentProfile.agent_contract_url]);
    }

    await adminSupabase.from('profiles').update({ agent_contract_url: null }).eq('id', agentId);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
