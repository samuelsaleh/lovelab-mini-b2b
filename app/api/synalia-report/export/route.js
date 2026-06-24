/**
 * GET /api/synalia-report/export?agent_id=&year=&quarter=
 * Download SYNALIA Excel only (no Drive/email).
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { generateSynaliaReportForAgent } from '@/lib/synaliaReportService';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'synalia-export' });
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

    const url = new URL(request.url);
    const agentId = url.searchParams.get('agent_id');
    const y = Number(url.searchParams.get('year'));
    const q = Number(url.searchParams.get('quarter'));

    if (!agentId || !UUID_REGEX.test(agentId)) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
    }
    if (!Number.isFinite(y) || q < 1 || q > 4) {
      return NextResponse.json({ error: 'Invalid year or quarter' }, { status: 400 });
    }

    const result = await generateSynaliaReportForAgent(adminSupabase, {
      agentId,
      year: y,
      quarter: q,
      uploadToDrive: false,
      sendEmail: false,
    });

    return new NextResponse(result.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${result.filename.replace(/"/g, '')}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[synalia-report/export]', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
