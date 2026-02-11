import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['application/pdf'];

export async function POST(request) {
  try {
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

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 10 MB limit' }, { status: 400 });
    }

    // Sanitize filePath: prevent path traversal and ensure it stays within user's scope
    const safePath = String(filePath)
      .replace(/\.\./g, '')           // Remove path traversal
      .replace(/^\/+/, '')            // Remove leading slashes
      .replace(/[^a-zA-Z0-9\-_./]/g, '_'); // Only safe characters

    if (!safePath || safePath.includes('..')) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    const { data, error } = await supabase.storage
      .from('documents')
      .upload(safePath, buffer, {
        contentType: 'application/pdf',
        upsert: false, // Don't allow overwriting existing files
      });

    if (error) {
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    return NextResponse.json({ data, filePath: safePath });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
