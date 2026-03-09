import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireOrganizationAccess } from '@/lib/organizations/authz';
import { checkRateLimit } from '@/lib/rateLimit';

function toNumber(value) {
  return Number(value) || 0;
}

export async function GET(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'org-ledger' });
    if (rateLimitRes) return rateLimitRes;

    const organizationId = (await params)?.id;
    const supabase = await createClient();
    const session = await requireOrganizationAccess(supabase, organizationId);
    if (session.error) return session.error;

    const { searchParams } = new URL(request.url);
    const includeOrders = searchParams.get('include_orders') === 'true';

    const { data: members, error: memberErr } = await supabase
      .from('organization_memberships')
      .select('user_id, role, profiles:user_id(id, full_name, email)')
      .eq('organization_id', organizationId)
      .is('deleted_at', null);
    if (memberErr) throw memberErr;

    const memberIds = (members || []).map((m) => m.user_id);
    if (memberIds.length === 0) {
      return NextResponse.json({
        organization_summary: {
          total_commission_earned: 0,
          total_paid_out: 0,
          pending_balance: 0,
        },
        per_member: [],
      });
    }

    const commSelect = includeOrders
      ? 'id, agent_id, commission_amount, commission_rate, order_total, status, type, created_at, document_id, documents:document_id(client_name, client_company)'
      : 'id, agent_id, commission_amount, status';

    const [{ data: commissions, error: commErr }, { data: payments, error: payErr }] = await Promise.all([
      supabase
        .from('agent_commissions')
        .select(commSelect)
        .in('agent_id', memberIds),
      supabase
        .from('agent_payments')
        .select('id, agent_id, amount')
        .in('agent_id', memberIds),
    ]);

    if (commErr) throw commErr;
    if (payErr) throw payErr;

    const perMemberMap = new Map();
    for (const member of members || []) {
      perMemberMap.set(member.user_id, {
        user_id: member.user_id,
        role: member.role,
        profile: member.profiles || null,
        total_commission_earned: 0,
        total_paid_out: 0,
        pending_balance: 0,
        ...(includeOrders ? { orders: [] } : {}),
      });
    }

    for (const row of commissions || []) {
      const bucket = perMemberMap.get(row.agent_id);
      if (!bucket) continue;
      const amount = toNumber(row.commission_amount);
      if (row.status !== 'cancelled') {
        bucket.total_commission_earned += amount;
      }
      if (includeOrders && row.type === 'order') {
        bucket.orders.push({
          id: row.id,
          order_total: toNumber(row.order_total),
          commission_amount: amount,
          commission_rate: toNumber(row.commission_rate),
          status: row.status,
          created_at: row.created_at,
          client_name: row.documents?.client_name || null,
          client_company: row.documents?.client_company || null,
        });
      }
    }

    for (const row of payments || []) {
      const bucket = perMemberMap.get(row.agent_id);
      if (!bucket) continue;
      bucket.total_paid_out += toNumber(row.amount);
    }

    const perMember = [...perMemberMap.values()].map((m) => ({
      ...m,
      pending_balance: m.total_commission_earned - m.total_paid_out,
    }));

    const organizationSummary = perMember.reduce(
      (acc, row) => {
        acc.total_commission_earned += row.total_commission_earned;
        acc.total_paid_out += row.total_paid_out;
        acc.pending_balance += row.pending_balance;
        return acc;
      },
      { total_commission_earned: 0, total_paid_out: 0, pending_balance: 0 }
    );

    return NextResponse.json({
      organization_summary: organizationSummary,
      per_member: perMember,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to load organization ledger' }, { status: 500 });
  }
}
