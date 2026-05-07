/**
 * POST /api/commission-reports/generate
 *
 * Generate one or more monthly commission reports. Called by:
 *   - The "Generate Report" button on the agent detail page (admin auth).
 *   - The n8n cron on the 1st of each month (CRON_SECRET auth via the
 *     `x-vercel-cron-secret` header — same pattern as /api/cron/health-check
 *     so n8n re-uses the existing secret).
 *
 * Body (all fields optional):
 *   {
 *     agent_id?: string,        // generate for just this agent (UI button)
 *                               // omit → loop over every active agent (cron)
 *     month?:   string,         // YYYY-MM. Defaults to previous calendar month.
 *     send_email?: boolean,     // default true
 *     upload_to_drive?: boolean,// default true
 *     skip_if_empty?: boolean,  // default true (no .xlsx for empty months)
 *     recipient?: string,       // override dionne@love-lab.com (testing)
 *   }
 *
 * Auth (one of):
 *   - Logged-in admin   → for the UI button
 *   - x-vercel-cron-secret header matching env CRON_SECRET → for n8n
 *
 * Responses:
 *   200 — { mode: 'single', result }            when agent_id was given
 *   200 — { mode: 'batch', summary, results }   when no agent_id
 *   400 — invalid body / month format
 *   401 — no auth
 *   500 — runtime error
 */

import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  generateAgentReport,
  generateAllAgents,
  previousMonthPeriod,
} from '@/lib/commissionReportService';
import { recordHealthEvent } from '@/lib/healthEvent';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_REGEX = /^(\d{4})-(\d{2})$/;

// Long-running: an unblocked Resend round-trip + Drive upload + xlsx
// generation can run ~30s for many agents. Vercel's default is 10s; bump
// if/when this is deployed there.
export const maxDuration = 300; // 5 minutes — Next.js / Vercel hint

function periodForMonth(yyyymm) {
  const m = MONTH_REGEX.exec(yyyymm || '');
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12) return null;
  const start = new Date(Date.UTC(y, mm - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mm, 0, 23, 59, 59, 999));
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    key: `${y}-${String(mm).padStart(2, '0')}`,
    label: start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
  };
}

function isCronCall(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const headerSecret = request.headers.get('x-vercel-cron-secret');
  return headerSecret && headerSecret === cronSecret;
}

export async function POST(request) {
  try {
    // ── Auth: admin OR cron ────────────────────────────────────────────
    const cron = isCronCall(request);
    let userId = null;
    let triggerSource = 'cron';

    if (!cron) {
      const rateLimitRes = checkRateLimit(request, {
        maxRequests: 10,
        prefix: 'commission-reports-generate',
      });
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
      userId = user.id;
      triggerSource = 'manual';
    }

    // ── Body ───────────────────────────────────────────────────────────
    let body = {};
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (body.agent_id != null && !UUID_REGEX.test(String(body.agent_id))) {
      return NextResponse.json({ error: 'agent_id must be a UUID' }, { status: 400 });
    }

    let period;
    if (body.month != null) {
      period = periodForMonth(String(body.month));
      if (!period) {
        return NextResponse.json(
          { error: 'month must be YYYY-MM' },
          { status: 400 },
        );
      }
    } else {
      period = previousMonthPeriod();
    }

    const options = {
      sendEmail: body.send_email !== false,
      uploadToDrive: body.upload_to_drive !== false,
      skipIfEmpty: body.skip_if_empty !== false,
      recipient: body.recipient || undefined,
      triggeredBy: userId,
      triggerSource,
    };

    const adminSupabase = createAdminClient();

    // ── Single-agent mode (UI button) ─────────────────────────────────
    if (body.agent_id) {
      const result = await generateAgentReport({
        supabase: adminSupabase,
        agentId: String(body.agent_id),
        period,
        options,
      });
      return NextResponse.json({ mode: 'single', period, result });
    }

    // ── Batch mode (cron) ─────────────────────────────────────────────
    const { summary, results } = await generateAllAgents({
      supabase: adminSupabase,
      period,
      options,
    });

    // If anything failed, log a single warn event so admin sees it.
    if (summary.failed > 0) {
      await recordHealthEvent({
        source: 'commission_reports_batch',
        severity: 'warn',
        message: `Monthly commission report batch had ${summary.failed} failure(s)`,
        context: {
          period_key: period.key,
          summary,
          failures: results.filter((r) => !r.ok).map((r) => ({ agent_id: r.agent_id, agent_name: r.agent_name, error: r.error })),
        },
      });
    }

    return NextResponse.json({ mode: 'batch', period, summary, results });
  } catch (err) {
    console.error('[commission-reports/generate] Exception:', err);
    await recordHealthEvent({
      source: 'commission_reports_generate_route',
      severity: 'critical',
      message: err?.message || 'commission-reports/generate route threw',
      context: { stack: err?.stack ? String(err.stack).slice(0, 1500) : null },
    });
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
