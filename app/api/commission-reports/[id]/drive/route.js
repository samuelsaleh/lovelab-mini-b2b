/**
 * POST /api/commission-reports/[id]/drive
 *
 * Save (or re-save) an existing report's .xlsx to Google Drive.
 *
 * Why: the Drive copy is best-effort when a report is generated, and on the
 * production server it failed for months (no Drive credentials after the
 * move off Vercel). Once the keys are back, Dionne can push the reports she
 * already sent to Drive from the report list instead of sending them again.
 *
 * The bytes come from the Supabase Storage archive (the same file the
 * Download button serves). The Drive folder is the one the generator uses:
 * `<commission reports root>/<Organization or agent name>/`.
 *
 * Returns: { drive: { ok, fileId, webViewLink, error? }, report }
 *
 * Access: admin only.
 */

import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { uploadCommissionReportToDrive } from '@/lib/commissionReportDrive';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'commission-reports-drive' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

    const { data: report, error: loadErr } = await adminSupabase
      .from('commission_reports')
      .select('id, storage_path, period_key, period_label, agent_id, agent:profiles(full_name, email, drive_folder_id), organization:snapshot_data->organization')
      .eq('id', id)
      .maybeSingle();
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    if (!report.storage_path) {
      return NextResponse.json({ error: 'This report has no archived file to upload.' }, { status: 409 });
    }

    const { data: blob, error: dlErr } = await adminSupabase
      .storage
      .from('commission-reports')
      .download(report.storage_path);
    if (dlErr || !blob) {
      return NextResponse.json({ error: dlErr?.message || 'File missing in storage' }, { status: 404 });
    }
    const buffer = Buffer.from(await blob.arrayBuffer());

    // Organization reports (Phase 31) live in the organization's folder; a
    // per-agent report in the agent's own (cached when known).
    const isOrg = !!report.organization?.name;
    const driveRes = await uploadCommissionReportToDrive({
      buffer,
      agentName: isOrg ? report.organization.name : (report.agent?.full_name || report.agent?.email || 'Agent'),
      periodKey: report.period_key || report.period_label,
      cachedFolderId: isOrg ? null : (report.agent?.drive_folder_id || null),
    });

    if (!driveRes.ok) {
      return NextResponse.json(
        { error: driveRes.error || `Google Drive upload failed (${driveRes.reason || 'unknown'})`, drive: driveRes },
        { status: 502 },
      );
    }

    const { data: updated, error: updErr } = await adminSupabase
      .from('commission_reports')
      .update({ drive_file_id: driveRes.fileId || null, drive_view_link: driveRes.webViewLink || null })
      .eq('id', id)
      .select('id, drive_file_id, drive_view_link')
      .maybeSingle();
    if (updErr) return NextResponse.json({ error: updErr.message, drive: driveRes }, { status: 500 });

    return NextResponse.json({ drive: driveRes, report: updated });
  } catch (err) {
    console.error('[commission-reports drive] exception:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
