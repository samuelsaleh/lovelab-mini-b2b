import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { getUserContext, isUserOwnerOrSameEmail, requireEventPermission } from '@/app/api/_lib/access';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST - Restore a soft-deleted document (clears deleted_at)
export async function POST(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'docs-restore' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }

    // Verify document exists and is in trash
    const { data: doc, error: fetchError } = await adminSupabase
      .from('documents')
      .select('id, deleted_at, created_by, event_id')
      .eq('id', id)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (!doc.deleted_at) {
      return NextResponse.json({ error: 'Document is not in trash' }, { status: 400 });
    }
    const isOwner = await isUserOwnerOrSameEmail(adminSupabase, doc.created_by, user);
    const eventAccess = doc.event_id
      ? await requireEventPermission(adminSupabase, doc.event_id, user.id, 'edit', isAdmin)
      : { allowed: false };
    const canRestore = isAdmin || isOwner || eventAccess.allowed;
    if (!canRestore) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Restore: clear deleted_at
    const { error: updateError } = await adminSupabase
      .from('documents')
      .update({ deleted_at: null })
      .eq('id', id);

    if (updateError) {
      console.error('[Documents RESTORE] Error:', updateError.message);
      return NextResponse.json({ error: 'Failed to restore document' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
