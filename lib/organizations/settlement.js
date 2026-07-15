export function commissionSettlementStage(commission) {
  if (!commission || commission.status === 'cancelled') return 'cancelled';
  if (commission.status === 'paid') return 'settled';
  if (commission.customer_paid_at && commission.report_id) return 'reported';
  if (commission.customer_paid_at) return 'ready';
  return 'awaiting';
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function summarizeOrganizationSettlement(perMember = [], paymentTotal = 0) {
  const summary = perMember.reduce(
    (acc, member) => {
      acc.total_commission_earned += Number(member.total_commission_earned) || 0;
      acc.awaiting_customer += Number(member.awaiting_customer) || 0;
      acc.ready_to_pay += Number(member.ready_to_pay) || 0;
      acc.reported += Number(member.reported) || 0;
      acc.settled_amount += Number(member.settled_amount) || 0;
      return acc;
    },
    {
      total_commission_earned: 0,
      total_paid_out: round2(paymentTotal),
      pending_balance: 0,
      awaiting_customer: 0,
      ready_to_pay: 0,
      reported: 0,
      settled_amount: 0,
      unallocated_payment: 0,
    }
  );

  for (const key of ['total_commission_earned', 'awaiting_customer', 'ready_to_pay', 'reported', 'settled_amount']) {
    summary[key] = round2(summary[key]);
  }
  summary.pending_balance = round2(summary.total_commission_earned - summary.total_paid_out);
  summary.unallocated_payment = round2(Math.max(0, summary.total_paid_out - summary.settled_amount));
  return summary;
}
