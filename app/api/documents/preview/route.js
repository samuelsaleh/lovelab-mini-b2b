import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - Generate a signed URL for document preview
export async function GET(request) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json({ error: 'Missing file path' }, { status: 400 });
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
