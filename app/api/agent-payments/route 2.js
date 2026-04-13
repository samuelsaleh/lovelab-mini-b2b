import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { resolveAgentIds } from '@/app/api/_lib/access';

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
    const { agent_id, amount, notes, payment_date } = body;

    if (!agent_id || !amount) {
      return NextResponse.json({ error: 'Missing agent_id or amount' }, { status: 400 });
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

    const { data: payment, error } = await adminSupabase
      .from('agent_payments')
      .insert({
        agent_id,
        amount: Number(amount),
        notes: notes?.trim() || null,
        payment_date: payment_date || new Date().toISOString(),
        created_by: user.id
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ payment });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
