import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

// GET - Generate a signed URL for document preview
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
    const rawPath = searchParams.get('path');

    if (!rawPath) {
      return NextResponse.json({ error: 'Missing file path' }, { status: 400 });
    }

    // Sanitize file path to prevent path traversal
    const filePath = String(rawPath)
      .replace(/\.\./g, '')           // Remove path traversal
      .replace(/^\/+/, '')            // Remove leading slashes
      .replace(/[^a-zA-Z0-9\-_./]/g, '_'); // Allow only safe chars

    if (!filePath || filePath.length < 3) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    // Verify the file path belongs to a document owned by this user
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id')
      .eq('file_path', filePath)
      .eq('created_by', user.id) // Ownership check
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Generate signed URL (5 minute expiry)
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, 60 * 5);

    if (error) {
      console.error('[Preview] Error:', error.message);
      return NextResponse.json({ error: 'Failed to generate preview URL' }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
