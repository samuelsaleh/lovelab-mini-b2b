import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

// UUID v4 format validation
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET - Generate a signed URL for document preview/download
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'preview' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const docId = searchParams.get('id');

    // Support both ?id= (new) and ?path= (legacy) lookups
    let doc;
    if (docId) {
      // ID-based lookup (preferred)
      if (!UUID_RE.test(docId)) {
        return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('documents')
        .select('id, file_path')
        .eq('id', docId)
        .eq('created_by', user.id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      doc = data;
    } else {
      // Legacy path-based lookup (backwards compatibility)
      const rawPath = searchParams.get('path');
      if (!rawPath) {
        return NextResponse.json({ error: 'Missing document ID or file path' }, { status: 400 });
      }

      const filePath = String(rawPath)
        .replace(/\.\./g, '')
        .replace(/^\/+/, '')
        .replace(/[^a-zA-Z0-9\-_./]/g, '_');

      if (!filePath || filePath.length < 3) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('documents')
        .select('id, file_path')
        .eq('file_path', filePath)
        .eq('created_by', user.id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      doc = data;
    }

    // Try generating signed URL with the stored file_path
    const storedPath = doc.file_path;
    let signedUrl = null;

    const { data: urlData, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(storedPath, 60 * 5);

    if (!urlError && urlData?.signedUrl) {
      signedUrl = urlData.signedUrl;
    } else {
      // Fallback: the file might be at user-scoped path (user-id/filename)
      // This handles documents saved between the security fix and the path fix
      const filename = storedPath.split('/').pop();
      const userScopedPath = `${user.id}/${filename}`;

      if (userScopedPath !== storedPath) {
        const { data: fallbackData, error: fallbackError } = await supabase.storage
          .from('documents')
          .createSignedUrl(userScopedPath, 60 * 5);

        if (!fallbackError && fallbackData?.signedUrl) {
          signedUrl = fallbackData.signedUrl;

          // Fix the stored path in the DB so future lookups work directly
          await supabase
            .from('documents')
            .update({ file_path: userScopedPath })
            .eq('id', doc.id)
            .eq('created_by', user.id);
        }
      }
    }

    if (!signedUrl) {
      console.error('[Preview] Failed to generate signed URL for doc:', doc.id);
      return NextResponse.json({ error: 'Failed to generate preview URL' }, { status: 500 });
    }

    return NextResponse.json({ signedUrl });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
