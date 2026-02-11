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

    // Generate signed URL (5 minute expiry)
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, 60 * 5);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
