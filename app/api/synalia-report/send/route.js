/**
 * POST /api/synalia-report/send
 * Generate SYNALIA quarterly Excel, upload to Drive, email Dionne.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { generateSynaliaReportForAgent } from '@/lib/synaliaReportService';
import { getQuarterBounds } from '@/lib/synaliaQuarter';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'synalia-send' });
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

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { agent_id: agentId, year, quarter } = body || {};
    if (!agentId || !UUID_REGEX.test(agentId)) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
    }
    const y = Number(year);
    const q = Number(quarter);
    if (!Number.isFinite(y) || q < 1 || q > 4) {
      return NextResponse.json({ error: 'Invalid year or quarter' }, { status: 400 });
    }

    const result = await generateSynaliaReportForAgent(adminSupabase, {
      agentId,
      year: y,
      quarter: q,
      uploadToDrive: true,
      sendEmail: true,
    });

    const period = getQuarterBounds(y, q);

    return NextResponse.json({
      ok: true,
      filename: result.filename,
      period: { key: period.key, label: period.label, labelLong: period.labelLong },
      totals: {
        orderCount: result.data.orderCount,
        clientCount: result.data.clientCount,
        grandTotal: result.data.grandTotal,
      },
      drive: {
        ok: result.drive.ok,
        webViewLink: result.drive.webViewLink || null,
        error: result.drive.error || result.drive.reason || null,
      },
      email: {
        sent: result.email.sent,
        recipient: result.email.recipient || null,
        error: result.email.error || result.email.reason || null,
      },
    });
  } catch (err) {
    console.error('[synalia-report/send]', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
