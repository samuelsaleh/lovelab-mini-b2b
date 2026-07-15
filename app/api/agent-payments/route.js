import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { resolveAgentIds } from '@/app/api/_lib/access';
import { settleReportPayment } from '@/lib/commissionPaidOut';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'agent-payments' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await adminSupabase.from('profiles').select('role, is_agent').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent_id');

    const targetId = isAdmin ? (agentId || null) : user.id;

    if (!targetId) {
       const { data } = await adminSupabase.from('agent_payments').select('*').order('payment_date', { ascending: false });
       return NextResponse.json({ payments: data });
    }

    const allIds = await resolveAgentIds(adminSupabase, targetId);

    let query = adminSupabase
      .from('agent_payments')
      .select('*')
      .order('payment_date', { ascending: false });

    query = allIds.length === 1
      ? query.eq('agent_id', allIds[0])
      : query.in('agent_id', allIds);

    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json({ payments: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'agent-payments-post' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { agent_id, amount, notes, payment_date, report_id, invoice_number } = body;

    if (!agent_id || !amount) {
      return NextResponse.json({ error: 'Missing agent_id or amount' }, { status: 400 });
    }
    if (report_id != null && !UUID_REGEX.test(String(report_id))) {
      return NextResponse.json({ error: 'report_id must be a UUID' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    const { data: agent } = await adminSupabase
      .from('profiles')
      .select('id, is_agent, agent_deleted_at, organization_id')
      .eq('id', agent_id)
      .single();
    if (!agent || agent.agent_deleted_at) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (agent.organization_id) {
      const { data: activeMembers, error: memberError } = await adminSupabase
        .from('organization_memberships')
        .select('user_id, role')
        .eq('organization_id', agent.organization_id)
        .is('deleted_at', null);
      if (memberError) throw memberError;
      if ((activeMembers || []).length > 1) {
        const owner = activeMembers.find((member) => member.role === 'owner');
        if (!owner || agent_id !== owner.user_id) {
          return NextResponse.json(
            { error: 'Multi-member organizations must be paid once through the organization settlement.' },
            { status: 409 },
          );
        }
      }
    }

    const cleanInvoice = invoice_number == null
      ? null
      : (String(invoice_number).trim().slice(0, 100) || null);

    // Phase 29: when a report is selected, settle it — flip its still-pending
    // commissions to paid and stamp the matched invoice on each — before we
    // record the payout row that links back to that report.
    let settled = null;
    if (report_id) {
      const { data: report, error: reportErr } = await adminSupabase
        .from('commission_reports')
        .select('id, agent_id, snapshot_data')
        .eq('id', report_id)
        .maybeSingle();
      if (reportErr) {
        return NextResponse.json({ error: reportErr.message }, { status: 500 });
      }
      if (!report) {
        return NextResponse.json({ error: 'Commission report not found' }, { status: 404 });
      }
      if (report.agent_id !== agent_id) {
        return NextResponse.json({ error: 'Report does not belong to this agent' }, { status: 400 });
      }
      settled = await settleReportPayment(adminSupabase, {
        report,
        invoiceNumber: cleanInvoice,
      });
    }

    const { data: payment, error } = await adminSupabase
      .from('agent_payments')
      .insert({
        agent_id,
        amount: Number(amount),
        notes: notes?.trim() || null,
        payment_date: payment_date || new Date().toISOString(),
        report_id: report_id || null,
        invoice_number: cleanInvoice,
        created_by: user.id
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ payment, settled });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
