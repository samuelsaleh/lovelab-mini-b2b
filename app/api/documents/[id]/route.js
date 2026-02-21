import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

// UUID format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PUT - Update a document (replace when re-editing)
export async function PUT(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'docs-update' });
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

    const body = await request.json();

    // First, get the old document to delete old file
    const { data: oldDoc, error: fetchError } = await supabase
      .from('documents')
      .select('file_path, created_by')
      .eq('id', id)
      .single();

    if (fetchError || !oldDoc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Delete old file from storage if we have a new one
    if (oldDoc.file_path && body.file_path && oldDoc.file_path !== body.file_path) {
      await supabase.storage.from('documents').remove([oldDoc.file_path]);
      // Also try owner-scoped path
      const filename = oldDoc.file_path.split('/').pop();
      const ownerScopedPath = `${oldDoc.created_by}/${filename}`;
      if (ownerScopedPath !== oldDoc.file_path) {
        await supabase.storage.from('documents').remove([ownerScopedPath]);
      }
    }

    // Update the document record
    const { data: doc, error: updateError } = await supabase
      .from('documents')
      .update({
        event_id: body.event_id || null,
        client_name: body.client_name,
        client_company: body.client_company,
        document_type: body.document_type,
        file_path: body.file_path,
        file_name: body.file_name,
        file_size: body.file_size,
        total_amount: body.total_amount,
        metadata: body.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[Documents PUT] Error:', updateError.message);
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 });
    }

    return NextResponse.json({ document: doc });
  } catch (error) {
    console.error('[Documents PUT] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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

    // First, get the document
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('file_path, created_by')
      .eq('id', id)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Delete from storage (try both the stored path and owner-scoped path)
    if (doc.file_path) {
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([doc.file_path]);
      
      if (storageError) {
        // Try owner-scoped path as fallback
        const filename = doc.file_path.split('/').pop();
        const ownerScopedPath = `${doc.created_by}/${filename}`;
        if (ownerScopedPath !== doc.file_path) {
          await supabase.storage.from('documents').remove([ownerScopedPath]);
        }
      }
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[Documents DELETE] Error:', deleteError.message);
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
