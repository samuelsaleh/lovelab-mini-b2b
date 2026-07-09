import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { resolveAgentIds } from '@/app/api/_lib/access';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reportPaymentErrorResponse(error) {
  const message = error?.message || 'Failed to record report payment';
  const code = String(error?.code || '');

  if (/commission report not found/i.test(message) || code === 'P0002') {
    return NextResponse.json({ error: 'Commission report not found' }, { status: 404 });
  }
  if (/does not belong/i.test(message)) {
    return NextResponse.json({ error: 'Report does not belong to this agent' }, { status: 400 });
  }
  if (
    code === '23505' ||
    /already has a recorded payment|duplicate|agent_payments_report_id_unique/i.test(message)
  ) {
    return NextResponse.json(
      { error: 'Commission report already has a recorded payment' },
      { status: 409 },
    );
  }

  return NextResponse.json({ error: message }, { status: 500 });
}

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
      .select('id, is_agent, agent_deleted_at')
      .eq('id', agent_id)
      .single();
    if (!agent || agent.agent_deleted_at) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const cleanInvoice = invoice_number == null
      ? null
      : (String(invoice_number).trim().slice(0, 100) || null);

    if (report_id) {
      const { data, error } = await adminSupabase.rpc('record_agent_report_payment', {
        p_agent_id: agent_id,
        p_amount: Number(amount),
        p_notes: notes?.trim() || null,
        p_payment_date: payment_date || new Date().toISOString(),
        p_report_id: report_id,
        p_invoice_number: cleanInvoice,
        p_created_by: user.id,
      });
      if (error) return reportPaymentErrorResponse(error);
      return NextResponse.json(data);
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
    return NextResponse.json({ payment, settled: null });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
