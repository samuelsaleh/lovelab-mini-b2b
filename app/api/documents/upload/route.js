import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['application/pdf'];

// PDF magic bytes: %PDF
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];

export async function POST(request) {
  try {
    // Rate limiting (was missing -- critical fix)
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'docs-upload' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const filePath = formData.get('filePath');

    if (!file || !filePath) {
      return NextResponse.json({ error: 'Missing file or filePath' }, { status: 400 });
    }

    // Validate file type (client-supplied MIME)
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 10 MB limit' }, { status: 400 });
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate actual file content (check PDF magic bytes)
    if (buffer.length < 4 || !PDF_MAGIC.every((b, i) => buffer[i] === b)) {
      return NextResponse.json({ error: 'File content is not a valid PDF' }, { status: 400 });
    }

    // Sanitize filePath but scope it to the user's directory
    const sanitizedName = String(filePath)
      .replace(/\.\./g, '')           // Remove path traversal
      .replace(/^\/+/, '')            // Remove leading slashes
      .replace(/[^a-zA-Z0-9\-_./]/g, '_') // Only safe characters
      .split('/').pop();              // Take only the filename portion

    if (!sanitizedName || sanitizedName.length < 3) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    // Scope upload path to user ID (prevents cross-user file access)
    const safePath = `${user.id}/${sanitizedName}`;

    const { data, error } = await supabase.storage
      .from('documents')
      .upload(safePath, buffer, {
        contentType: 'application/pdf',
        upsert: false, // Don't allow overwriting existing files
      });

    if (error) {
      console.error('[Upload] Error:', error.message);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    return NextResponse.json({ data, filePath: safePath });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
