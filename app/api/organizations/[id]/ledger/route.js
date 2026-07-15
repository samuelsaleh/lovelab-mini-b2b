import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { requireOrganizationAccess } from '@/lib/organizations/authz';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  commissionSettlementStage,
  summarizeOrganizationSettlement,
} from '@/lib/organizations/settlement';

function toNumber(value) {
  return Number(value) || 0;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export async function GET(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'org-ledger' });
    if (rateLimitRes) return rateLimitRes;

    const organizationId = (await params)?.id;
    const supabase = await createClient();
    const session = await requireOrganizationAccess(supabase, organizationId);
    if (session.error) return session.error;

    // Use admin client for all data queries to bypass self-referential RLS on organization_memberships
    const adminSupabase = createAdminClient();

    const { searchParams } = new URL(request.url);
    const includeOrders = searchParams.get('include_orders') === 'true';

    const { data: members, error: memberErr } = await adminSupabase
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
          awaiting_customer: 0,
          ready_to_pay: 0,
          reported: 0,
          settled_amount: 0,
          unallocated_payment: 0,
        },
        per_member: [],
      });
    }

    const commSelectBase =
      'id, agent_id, commission_amount, status, type, customer_paid_at, report_id, invoice_number, created_at, document_id';
    const commSelect = includeOrders
      ? `${commSelectBase}, commission_rate, order_total, documents:document_id(client_name, client_company)`
      : commSelectBase;

    const [{ data: commissions, error: commErr }, { data: payments, error: payErr }] = await Promise.all([
      adminSupabase
        .from('agent_commissions')
        .select(commSelect)
        .in('agent_id', memberIds),
      adminSupabase
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
        awaiting_customer: 0,
        ready_to_pay: 0,
        reported: 0,
        settled_amount: 0,
        awaiting_count: 0,
        ready_count: 0,
        reported_count: 0,
        paid_count: 0,
        invoice_numbers: [],
        last_invoice_number: null,
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
      const stage = commissionSettlementStage(row);
      if (stage === 'settled') {
        bucket.settled_amount += amount;
        bucket.paid_count += 1;
      } else if (stage === 'reported') {
        bucket.reported += amount;
        bucket.reported_count += 1;
      } else if (stage === 'ready') {
        bucket.ready_to_pay += amount;
        bucket.ready_count += 1;
      } else if (stage === 'awaiting') {
        bucket.awaiting_customer += amount;
        bucket.awaiting_count += 1;
      }
      if (row.invoice_number) {
        if (!bucket.invoice_numbers.includes(row.invoice_number)) {
          bucket.invoice_numbers.push(row.invoice_number);
        }
        if (!bucket.last_invoice_number) bucket.last_invoice_number = row.invoice_number;
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
          invoice_number: row.invoice_number || null,
          report_id: row.report_id || null,
          customer_paid_at: row.customer_paid_at || null,
        });
      }
    }

    let paymentTotal = 0;
    for (const row of payments || []) {
      paymentTotal += toNumber(row.amount);
      const bucket = perMemberMap.get(row.agent_id);
      if (!bucket) continue;
      bucket.total_paid_out += toNumber(row.amount);
    }

    const perMember = [...perMemberMap.values()].map((m) => {
      // Organization payments are stored once on the owner. Per-person
      // settlement allocation therefore comes from the commission rows that
      // the linked report marked paid, not from agent_payments.
      const pending = m.total_commission_earned - m.settled_amount;
      return {
        ...m,
        total_commission_earned: round2(m.total_commission_earned),
        total_paid_out: round2(m.total_paid_out),
        pending_balance: round2(pending),
        awaiting_customer: round2(m.awaiting_customer),
        ready_to_pay: round2(m.ready_to_pay),
        reported: round2(m.reported),
        settled_amount: round2(m.settled_amount),
      };
    });

    const organizationSummary = summarizeOrganizationSettlement(perMember, paymentTotal);

    return NextResponse.json({
      organization_summary: organizationSummary,
      per_member: perMember,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to load organization ledger' }, { status: 500 });
  }
}
