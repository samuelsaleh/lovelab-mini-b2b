/**
 * GET /api/commission-reports/[id]/download
 *
 * Stream the .xlsx file for a given commission report. Pulls from the
 * Supabase Storage `commission-reports` bucket (the primary archive),
 * NOT Google Drive — Drive is just mom's convenience copy.
 *
 * Returns the bytes with the right Content-Type + a filename header.
 *
 * Access: admin only.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, {
      maxRequests: 60,
      prefix: 'commission-reports-download',
    });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });

    const adminSupabase = createAdminClient();
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
    }

    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    const { data: report, error: rErr } = await adminSupabase
      .from('commission_reports')
      .select('id, storage_path, period_key, agent_id, period_label, agent:profiles(full_name, email)')
      .eq('id', id)
      .maybeSingle();

    if (rErr) {
      return new Response(JSON.stringify({ error: rErr.message }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
    if (!report || !report.storage_path) {
      return new Response(JSON.stringify({ error: 'Report not found or missing file' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }

    const { data: blob, error: dlErr } = await adminSupabase
      .storage
      .from('commission-reports')
      .download(report.storage_path);

    if (dlErr || !blob) {
      return new Response(
        JSON.stringify({ error: dlErr?.message || 'File missing in storage' }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const agentName = report.agent?.full_name || report.agent?.email || 'agent';
    const safeName = String(agentName)
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    const filename = `${safeName} - ${report.period_label || report.period_key}.xlsx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-length': String(buffer.byteLength),
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, max-age=60',
      },
    });
  } catch (err) {
    console.error('[commission-reports download] exception:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Internal server error' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
}
