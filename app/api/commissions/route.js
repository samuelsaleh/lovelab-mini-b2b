import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { resolveAgentIds } from '@/app/api/_lib/access';

// GET - List commissions. Agents see their own; admins see all.
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'commissions' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_agent, commission_rate, agent_conditions, agent_status')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';
    const isAgent = profile?.is_agent === true;

    if (!isAdmin && !isAgent) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const agentIdFilter = searchParams.get('agent_id');
    const statusFilter = searchParams.get('status');

    // Agents can only see their own; admins can filter by agent_id
    const targetAgentId = isAdmin ? (agentIdFilter || null) : user.id;

    const adminSupabase = createAdminClient();

    // Resolve all profile IDs sharing the same email (handles re-invited agents)
    const allAgentIds = targetAgentId
      ? await resolveAgentIds(adminSupabase, targetAgentId)
      : null;

    let query = adminSupabase
      .from('agent_commissions')
      .select('id, agent_id, document_id, type, order_total, commission_rate, commission_amount, status, paid_at, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (allAgentIds) {
      query = allAgentIds.length === 1
        ? query.eq('agent_id', allAgentIds[0])
        : query.in('agent_id', allAgentIds);
    }

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: commissions, error } = await query;

    if (error) {
      console.error('[Commissions GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to load commissions' }, { status: 500 });
    }

    // Fetch document details for order-type commissions
    const docIds = (commissions || [])
      .filter(c => c.document_id)
      .map(c => c.document_id);

    let docsMap = {};
    if (docIds.length > 0) {
      const { data: docs } = await adminSupabase
        .from('documents')
        .select('id, client_name, client_company, document_type, created_at, event_id')
        .in('id', docIds);

      for (const d of docs || []) {
        docsMap[d.id] = d;
      }
    }

    const commissionsWithDocs = (commissions || []).map(c => ({
      ...c,
      document: c.document_id ? docsMap[c.document_id] || null : null,
    }));

    // Fetch agent payments to calculate true pending balance
    let paymentsQuery = adminSupabase.from('agent_payments').select('amount');
    if (allAgentIds) {
      paymentsQuery = allAgentIds.length === 1
        ? paymentsQuery.eq('agent_id', allAgentIds[0])
        : paymentsQuery.in('agent_id', allAgentIds);
    }
    const { data: paymentsData } = await paymentsQuery;
    const total_paid_out = (paymentsData || []).reduce((sum, p) => sum + Number(p.amount), 0);

    // Compute summary stats
    const summary = {
      total_earned: 0,
      from_orders: 0,
      from_bonuses: 0,
      pending_amount: 0,
      paid_amount: 0,
      order_count: 0,
      bonus_count: 0,
      total_paid_out,
      true_pending_balance: 0,
    };

    for (const c of commissions || []) {
      const amt = Number(c.commission_amount) || 0;
      summary.total_earned += amt;
      if (c.type === 'order') {
        summary.from_orders += amt;
        summary.order_count++;
      } else if (c.type === 'bonus') {
        summary.from_bonuses += amt;
        summary.bonus_count++;
      }
      if (c.status === 'pending' || c.status === 'approved') {
        summary.pending_amount += amt; // legacy pending
      } else if (c.status === 'paid') {
        summary.paid_amount += amt; // legacy paid
      }
    }

    summary.true_pending_balance = summary.total_earned - summary.total_paid_out;

    // Round summary values
    for (const key of Object.keys(summary)) {
      if (typeof summary[key] === 'number' && key.includes('amount') || key.includes('earned') || key.includes('orders') || key.includes('bonuses')) {
        summary[key] = Math.round(summary[key] * 100) / 100;
      }
    }

    const response = {
      commissions: commissionsWithDocs,
      summary,
    };

    // For agents, include their profile info
    if (isAgent && !isAdmin) {
      response.agent_profile = {
        commission_rate: profile.commission_rate,
        agent_conditions: profile.agent_conditions,
        agent_status: profile.agent_status,
      };
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('[Commissions GET] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a manual bonus (admin only)
export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'commissions-post' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { agent_id, amount, notes, status = 'pending' } = body;

    if (!agent_id) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
    }

    const bonusAmount = Number(amount);
    if (isNaN(bonusAmount) || bonusAmount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }

    if (!['pending', 'approved', 'paid'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // Verify agent exists and is not soft-deleted
    const { data: agent } = await adminSupabase
      .from('profiles')
      .select('id, is_agent, agent_deleted_at')
      .eq('id', agent_id)
      .single();

    if (!agent || agent.agent_deleted_at) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const { data: commission, error } = await adminSupabase
      .from('agent_commissions')
      .insert({
        agent_id,
        document_id: null,
        type: 'bonus',
        order_total: 0,
        commission_rate: 0,
        commission_amount: Math.round(bonusAmount * 100) / 100,
        status,
        paid_at: status === 'paid' ? new Date().toISOString() : null,
        notes: notes?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[Commissions POST] Error:', error.message);
      return NextResponse.json({ error: 'Failed to create bonus' }, { status: 500 });
    }

    return NextResponse.json({ commission });
  } catch (err) {
    console.error('[Commissions POST] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update commission status (admin only). Supports bulk updates.
export async function PUT(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'commissions-put' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { ids, status, notes } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    if (ids.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 commissions per update' }, { status: 400 });
    }

    const validStatuses = ['pending', 'approved', 'paid', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    const updates = { status };
    if (status === 'paid') {
      updates.paid_at = new Date().toISOString();
    }
    if (notes !== undefined) {
      updates.notes = notes?.trim() || null;
    }

    const { data: updated, error } = await adminSupabase
      .from('agent_commissions')
      .update(updates)
      .in('id', ids)
      .select();

    if (error) {
      console.error('[Commissions PUT] Error:', error.message);
      return NextResponse.json({ error: 'Failed to update commissions' }, { status: 500 });
    }

    return NextResponse.json({ updated, count: updated?.length || 0 });
  } catch (err) {
    console.error('[Commissions PUT] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
