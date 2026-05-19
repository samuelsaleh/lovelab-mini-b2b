/**
 * DELETE /api/commission-reports/[id]
 *
 * Hard-deletes a single commission report row + its Supabase Storage file.
 * The Google Drive copy is intentionally left in place — it's mom's archive
 * and she can delete it herself if she wants.
 *
 * Access:
 *   - Admins only. Agents cannot delete their own reports (read-only portal).
 */

import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, {
      maxRequests: 30,
      prefix: 'commission-reports-delete',
    });
    if (rateLimitRes) return rateLimitRes;

    // Admin auth only
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    // Load the report so we know the storage path before deleting the row
    const { data: report, error: fetchErr } = await adminSupabase
      .from('commission_reports')
      .select('id, storage_path')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Delete from Supabase Storage (best-effort — never block the DB delete)
    if (report.storage_path) {
      const { error: storageErr } = await adminSupabase
        .storage
        .from('commission-reports')
        .remove([report.storage_path]);
      if (storageErr) {
        console.warn('[commission-reports DELETE] Storage remove failed (non-blocking):', storageErr.message);
      }
    }

    // Delete the DB row
    const { error: delErr } = await adminSupabase
      .from('commission_reports')
      .delete()
      .eq('id', id);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: true, id });
  } catch (err) {
    console.error('[commission-reports DELETE] exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
