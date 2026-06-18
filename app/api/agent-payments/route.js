import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { resolveAgentIds } from '@/app/api/_lib/access';
import { settleReportPayment } from '@/lib/commissionPaidOut';

function cents(value) {
  return Math.round(Number(value) * 100);
}

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

    if (!agent_id || amount == null) {
      return NextResponse.json({ error: 'Missing agent_id or amount' }, { status: 400 });
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }
    const parsedPaymentDate = payment_date ? new Date(payment_date) : new Date();
    if (!Number.isFinite(parsedPaymentDate.getTime())) {
      return NextResponse.json({ error: 'payment_date must be a valid date' }, { status: 400 });
    }
    const paymentDateIso = parsedPaymentDate.toISOString();
    if (report_id != null && !UUID_REGEX.test(String(report_id))) {
      return NextResponse.json({ error: 'report_id must be a UUID' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    const { data: agent } = await adminSupabase
      .from('profiles')
      .select('id, is_agent, agent_deleted_at')
      .eq('id', agent_id)
      .single();
    if (!agent || agent.agent_deleted_at) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const cleanInvoice = invoice_number == null
      ? null
      : (String(invoice_number).trim().slice(0, 100) || null);

    // Phase 29: when a report is selected, the payment must settle exactly that
    // report once. Validate before mutating commissions so a failed/duplicate
    // ledger insert cannot leave report rows marked paid without a payment row.
    let settled = null;
    let report = null;
    if (report_id) {
      const { data: reportRow, error: reportErr } = await adminSupabase
        .from('commission_reports')
        .select('id, agent_id, total_due, snapshot_data')
        .eq('id', report_id)
        .maybeSingle();
      if (reportErr) {
        return NextResponse.json({ error: reportErr.message }, { status: 500 });
      }
      if (!reportRow) {
        return NextResponse.json({ error: 'Commission report not found' }, { status: 404 });
      }
      if (reportRow.agent_id !== agent_id) {
        return NextResponse.json({ error: 'Report does not belong to this agent' }, { status: 400 });
      }
      const reportTotal = Number(reportRow.total_due ?? reportRow.snapshot_data?.totals?.grandTotal);
      if (!Number.isFinite(reportTotal) || cents(parsedAmount) !== cents(reportTotal)) {
        return NextResponse.json(
          { error: 'Payment amount must match the selected report total' },
          { status: 400 },
        );
      }
      const { data: existingPayment, error: existingErr } = await adminSupabase
        .from('agent_payments')
        .select('id')
        .eq('report_id', report_id)
        .maybeSingle();
      if (existingErr) {
        return NextResponse.json({ error: existingErr.message }, { status: 500 });
      }
      if (existingPayment) {
        return NextResponse.json({ error: 'This commission report already has a recorded payment' }, { status: 409 });
      }
      report = reportRow;
    }

    const { data: payment, error } = await adminSupabase
      .from('agent_payments')
      .insert({
        agent_id,
        amount: parsedAmount,
        notes: notes?.trim() || null,
        payment_date: paymentDateIso,
        report_id: report_id || null,
        invoice_number: cleanInvoice,
        created_by: user.id
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505' && report_id) {
        return NextResponse.json({ error: 'This commission report already has a recorded payment' }, { status: 409 });
      }
      throw error;
    }

    if (report) {
      try {
        settled = await settleReportPayment(adminSupabase, {
          report,
          invoiceNumber: cleanInvoice,
          paidAt: paymentDateIso,
        });
        if (!settled.marked) {
          await adminSupabase.from('agent_payments').delete().eq('id', payment.id);
          return NextResponse.json(
            { error: 'This commission report has no unsettled commissions to pay' },
            { status: 409 },
          );
        }
      } catch (settleErr) {
        await adminSupabase.from('agent_payments').delete().eq('id', payment.id);
        throw settleErr;
      }
    }
    return NextResponse.json({ payment, settled });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
