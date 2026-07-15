import test from 'node:test';
import assert from 'node:assert/strict';

import {
  commissionSettlementStage,
  summarizeOrganizationSettlement,
} from '../../lib/organizations/settlement.js';

test('commission lifecycle maps to one mutually exclusive settlement stage', () => {
  assert.equal(commissionSettlementStage({ status: 'pending' }), 'awaiting');
  assert.equal(commissionSettlementStage({ status: 'approved', customer_paid_at: '2026-07-01' }), 'ready');
  assert.equal(
    commissionSettlementStage({ status: 'approved', customer_paid_at: '2026-07-01', report_id: 'report' }),
    'reported'
  );
  assert.equal(
    commissionSettlementStage({ status: 'paid', customer_paid_at: '2026-07-01', report_id: 'report' }),
    'settled'
  );
  assert.equal(commissionSettlementStage({ status: 'cancelled' }), 'cancelled');
});

test('one organization payment retains per-member settled allocation', () => {
  const summary = summarizeOrganizationSettlement([
    {
      total_commission_earned: 100,
      awaiting_customer: 10,
      ready_to_pay: 20,
      reported: 30,
      settled_amount: 40,
    },
    {
      total_commission_earned: 50,
      awaiting_customer: 0,
      ready_to_pay: 10,
      reported: 0,
      settled_amount: 40,
    },
  ], 80);

  assert.equal(summary.total_commission_earned, 150);
  assert.equal(summary.total_paid_out, 80);
  assert.equal(summary.pending_balance, 70);
  assert.equal(summary.settled_amount, 80);
  assert.equal(summary.unallocated_payment, 0);
});

test('payment without a linked report is surfaced as unallocated', () => {
  const summary = summarizeOrganizationSettlement([
    { total_commission_earned: 100, settled_amount: 20 },
  ], 50);
  assert.equal(summary.unallocated_payment, 30);
});
