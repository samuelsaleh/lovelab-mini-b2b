import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireOrganizationAccess } from '@/lib/organizations/authz';

function toNumber(value) {
  return Number(value) || 0;
}

export async function GET(_request, { params }) {
  try {
    const organizationId = params?.id;
    const supabase = await createClient();
    const session = await requireOrganizationAccess(supabase, organizationId);
    if (session.error) return session.error;

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

    const [{ data: commissions, error: commErr }, { data: payments, error: payErr }] = await Promise.all([
      supabase
        .from('agent_commissions')
        .select('id, agent_id, commission_amount, status')
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
      });
    }

    for (const row of commissions || []) {
      const bucket = perMemberMap.get(row.agent_id);
      if (!bucket) continue;
      const amount = toNumber(row.commission_amount);
      if (row.status !== 'cancelled') {
        bucket.total_commission_earned += amount;
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
