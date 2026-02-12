import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

// UUID format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DELETE - Delete a document by ID
export async function DELETE(request, { params }) {
  try {
    // Rate limiting (was missing -- critical fix)
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'docs-delete' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }

    // First, get the document with ownership check
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('file_path, created_by')
      .eq('id', id)
      .eq('created_by', user.id) // Ownership check
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Delete from storage
    if (doc.file_path) {
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([doc.file_path]);
      
      if (storageError) {
        console.error('[Documents DELETE] Storage error:', storageError.message);
        // Continue anyway - file might already be deleted
      }
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)
      .eq('created_by', user.id); // Ownership check

    if (deleteError) {
      console.error('[Documents DELETE] Error:', deleteError.message);
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
