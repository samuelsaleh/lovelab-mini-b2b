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
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const perPage = Math.min(500, Math.max(1, parseInt(searchParams.get('per_page') || '200', 10)));
    const offset = (page - 1) * perPage;

    // Agents can only see their own; admins can filter by agent_id
    const targetAgentId = isAdmin ? (agentIdFilter || null) : user.id;

    const adminSupabase = createAdminClient();

    // Resolve all profile IDs sharing the same email (handles re-invited agents)
    const allAgentIds = targetAgentId
      ? await resolveAgentIds(adminSupabase, targetAgentId)
      : null;

    const applyFilters = (q) => {
      if (allAgentIds) {
        q = allAgentIds.length === 1
          ? q.eq('agent_id', allAgentIds[0])
          : q.in('agent_id', allAgentIds);
      }
      if (statusFilter) q = q.eq('status', statusFilter);
      return q;
    };

    // Paginated detail query. `client_label` is added by the Phase 27 migration;
    // tolerate it being absent so the agents page keeps working even if this
    // code is deployed before the migration has run on a given environment.
    const DETAIL_COLS_BASE = 'id, agent_id, document_id, type, order_total, commission_rate, commission_amount, status, paid_at, notes, created_at, customer_paid_at';
    const buildDetailQuery = (cols) => applyFilters(
      adminSupabase
        .from('agent_commissions')
        .select(cols, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + perPage - 1)
    );

    // Light aggregate query for summary (all records, no limit)
    let summaryQuery = applyFilters(
      adminSupabase
        .from('agent_commissions')
        .select('commission_amount, status, type, customer_paid_at')
    );

    let [detailRes, { data: allForSummary }] = await Promise.all([
      buildDetailQuery(`${DETAIL_COLS_BASE}, client_label, invoice_number`),
      summaryQuery,
    ]);

    // Forward-deploy safety net: optional columns (client_label = Phase 27,
    // invoice_number = Phase 28) may not be migrated yet on a given environment.
    // Retry progressively so a missing column degrades gracefully instead of
    // 500-ing the entire commissions view.
    if (detailRes.error && /invoice_number/.test(detailRes.error.message || '')) {
      console.warn('[Commissions GET] invoice_number column missing — run Phase 28 migration. Falling back.');
      detailRes = await buildDetailQuery(`${DETAIL_COLS_BASE}, client_label`);
    }
    if (detailRes.error && /client_label/.test(detailRes.error.message || '')) {
      console.warn('[Commissions GET] client_label column missing — run Phase 27 migration. Falling back.');
      detailRes = await buildDetailQuery(DETAIL_COLS_BASE);
    }

    const { data: commissions, error, count: totalCount } = detailRes;

    if (error) {
      console.error('[Commissions GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to load commissions' }, { status: 500 });
    }

    // Fetch document details for order-type commissions (current page only)
    const docIds = (commissions || [])
      .filter(c => c.document_id)
      .map(c => c.document_id);

    let docsMap = {};
    if (docIds.length > 0) {
      const { data: docs } = await adminSupabase
        .from('documents')
        .select('id, client_name, client_company, document_type, created_at, event_id, total_amount, order_channel, metadata')
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

    // Compute summary stats.
    //
    // Phase 19b adds a four-bucket split so the agent detail page can show:
    //   AWAITING CUSTOMER → status='pending' AND customer_paid_at IS NULL
    //   READY TO PAY      → status='pending' AND customer_paid_at NOT NULL
    //   PAID OUT          → status='paid'
    //   REVENUE / EARNED  → unchanged (kept for back-compat)
    const summary = {
      total_earned: 0,
      from_orders: 0,
      from_bonuses: 0,
      from_new_client_bonus: 0,
      pending_amount: 0,
      paid_amount: 0,
      order_count: 0,
      bonus_count: 0,
      new_client_bonus_count: 0,
      // Phase 19b — four-bucket split.
      ready_to_pay: 0,
      awaiting_customer: 0,
      ready_to_pay_count: 0,
      awaiting_customer_count: 0,
      total_paid_out,
      true_pending_balance: 0,
    };

    for (const c of allForSummary || []) {
      // Phase 18 fix: cancelled rows are kept for the audit trail (the agent
      // can still see "this order was cancelled because it was deleted") but
      // they must NOT contribute to any totals. Same root cause as the
      // Marc Schlund 1 order / 470€ bug in the admin Top Agents widget.
      if (c.status === 'cancelled') continue;
      const amt = Number(c.commission_amount) || 0;
      summary.total_earned += amt;
      if (c.type === 'order') {
        summary.from_orders += amt;
        summary.order_count++;
      } else if (c.type === 'bonus') {
        summary.from_bonuses += amt;
        summary.bonus_count++;
      } else if (c.type === 'new_client_bonus') {
        summary.from_new_client_bonus += amt;
        summary.new_client_bonus_count++;
      }
      if (c.status === 'pending' || c.status === 'approved') {
        summary.pending_amount += amt;
        if (c.customer_paid_at) {
          summary.ready_to_pay += amt;
          summary.ready_to_pay_count++;
        } else {
          summary.awaiting_customer += amt;
          summary.awaiting_customer_count++;
        }
      } else if (c.status === 'paid') {
        summary.paid_amount += amt;
      }
    }

    summary.true_pending_balance = summary.total_earned - summary.total_paid_out;

    // Round all monetary values to 2 decimal places. Counts stay integers.
    for (const key of Object.keys(summary)) {
      if (typeof summary[key] !== 'number') continue;
      if (key.endsWith('_count') || key === 'order_count' || key === 'bonus_count') continue;
      summary[key] = Math.round(summary[key] * 100) / 100;
    }

    const response = {
      commissions: commissionsWithDocs,
      summary,
      total_count: totalCount ?? (allForSummary?.length ?? 0),
      page,
      per_page: perPage,
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

// POST - Create a manual commission (admin only).
//
// Two shapes, distinguished by `type`:
//
//   type='bonus' (default — legacy AddBonusModal)
//     { agent_id, amount, notes?, status? }
//     Flat cash bonus. order_total/commission_rate = 0, commission = amount.
//
//   type='order' (Phase 27 — AddQuickOrderModal "quick order")
//     { agent_id, type:'order', client_label, amount, amount_mode?,
//       commission_rate?, created_at?, customer_paid? }
//     Manual order with no document. `client_label` is the customer name.
//     `amount_mode`:
//       - 'order_total' (default): `amount` is the sale value; commission is
//         amount * rate / 100 (rate defaults to the agent's commission_rate).
//       - 'direct': `amount` is paid to the agent as-is (rate = 0, the agent
//         earns the full amount; order_total mirrors amount so Net == Commission).
//     `created_at` backdates the row (e.g. an order from 6 months ago).
//     `customer_paid` (default true) stamps customer_paid_at = now() so the
//     entry is immediately "ready to pay" and swept into the next report.
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
    const {
      agent_id,
      amount,
      notes,
      status = 'pending',
      type = 'bonus',
      client_label,
      amount_mode = 'order_total',
      commission_rate,
      created_at,
      customer_paid = true,
    } = body;

    if (!agent_id) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
    }

    if (!['order', 'bonus'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }

    if (type === 'bonus' && !['pending', 'approved', 'paid'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (type === 'order') {
      if (!client_label || !String(client_label).trim()) {
        return NextResponse.json({ error: 'client_label is required for a quick order' }, { status: 400 });
      }
      if (!['order_total', 'direct'].includes(amount_mode)) {
        return NextResponse.json({ error: 'Invalid amount_mode' }, { status: 400 });
      }
    }

    const adminSupabase = createAdminClient();

    // Verify agent exists and is not soft-deleted
    const { data: agent } = await adminSupabase
      .from('profiles')
      .select('id, is_agent, agent_deleted_at, commission_rate')
      .eq('id', agent_id)
      .single();

    if (!agent || agent.agent_deleted_at) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

    let insertPayload;

    if (type === 'order') {
      // Resolve the rate: explicit value wins, else fall back to the agent's
      // configured commission_rate. Clamped to [0, 100].
      const rawRate = commission_rate != null && commission_rate !== ''
        ? Number(commission_rate)
        : Number(agent.commission_rate) || 0;
      const rate = Number.isFinite(rawRate) ? Math.min(100, Math.max(0, rawRate)) : 0;

      let orderTotal;
      let effectiveRate;
      let commissionAmount;
      if (amount_mode === 'direct') {
        // The typed amount is paid to the agent as-is.
        orderTotal = round2(numericAmount);
        effectiveRate = 0;
        commissionAmount = round2(numericAmount);
      } else {
        // The typed amount is the sale value; commission = amount * rate%.
        orderTotal = round2(numericAmount);
        effectiveRate = rate;
        commissionAmount = round2(numericAmount * rate / 100);
      }

      // Backdate when a valid date is supplied; otherwise default to now().
      let createdAtIso = new Date().toISOString();
      if (created_at) {
        const d = new Date(created_at);
        if (!isNaN(d.getTime())) createdAtIso = d.toISOString();
      }

      insertPayload = {
        agent_id,
        document_id: null,
        type: 'order',
        client_label: String(client_label).trim(),
        order_total: orderTotal,
        commission_rate: effectiveRate,
        commission_amount: commissionAmount,
        status: 'pending',
        paid_at: null,
        customer_paid_at: customer_paid ? new Date().toISOString() : null,
        notes: notes?.trim() || null,
        created_at: createdAtIso,
      };
    } else {
      insertPayload = {
        agent_id,
        document_id: null,
        type: 'bonus',
        order_total: 0,
        commission_rate: 0,
        commission_amount: round2(numericAmount),
        status,
        paid_at: status === 'paid' ? new Date().toISOString() : null,
        notes: notes?.trim() || null,
      };
    }

    const { data: commission, error } = await adminSupabase
      .from('agent_commissions')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('[Commissions POST] Error:', error.message);
      return NextResponse.json(
        { error: type === 'order' ? 'Failed to create quick order' : 'Failed to create bonus' },
        { status: 500 },
      );
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
