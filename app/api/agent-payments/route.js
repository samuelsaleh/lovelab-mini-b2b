import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, is_agent').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent_id');

    const targetId = isAdmin ? (agentId || null) : user.id;

    if (!targetId) {
       // Admin fetching all payments (optional, currently we only fetch per-agent)
       const { data } = await supabase.from('agent_payments').select('*').order('payment_date', { ascending: false });
       return NextResponse.json({ payments: data });
    }

    const { data, error } = await supabase
      .from('agent_payments')
      .select('*')
      .eq('agent_id', targetId)
      .order('payment_date', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ payments: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
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
