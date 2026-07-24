/**
 * OrgSettlementCard — zero-rate clarity (July 2026).
 * When members have awaiting/ready counts but €0 euros, show a banner
 * and per-row note so Sam knows to set rates.
 */

import { render, screen, waitFor } from '@testing-library/react';
import OrgSettlementCard, { isZeroRateWithCounts } from '../OrgSettlementCard';

describe('isZeroRateWithCounts', () => {
  test('true when counts > 0 and all euros are 0', () => {
    expect(isZeroRateWithCounts({
      awaiting_count: 5,
      ready_count: 2,
      reported_count: 0,
      awaiting_customer: 0,
      ready_to_pay: 0,
      reported: 0,
      settled_amount: 0,
    })).toBe(true);
  });

  test('false when there is any euro amount', () => {
    expect(isZeroRateWithCounts({
      awaiting_count: 1,
      ready_count: 0,
      awaiting_customer: 50,
      ready_to_pay: 0,
      reported: 0,
      settled_amount: 0,
    })).toBe(false);
  });

  test('false when no counts', () => {
    expect(isZeroRateWithCounts({
      awaiting_count: 0,
      ready_count: 0,
      awaiting_customer: 0,
      ready_to_pay: 0,
    })).toBe(false);
  });
});

describe('OrgSettlementCard zero-rate UI', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('shows banner and per-member note when counts exist but euros are €0', async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/ledger')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            organization_summary: {
              total_commission_earned: 0,
              total_paid_out: 0,
              pending_balance: 0,
            },
            per_member: [
              {
                user_id: 'wassila',
                role: 'member',
                profile: { full_name: 'Wassila Mekidiche' },
                awaiting_count: 5,
                ready_count: 2,
                reported_count: 0,
                awaiting_customer: 0,
                ready_to_pay: 0,
                reported: 0,
                settled_amount: 0,
                invoice_numbers: ['260178'],
                last_invoice_number: '260178',
              },
              {
                user_id: 'sarah',
                role: 'owner',
                profile: { full_name: 'Sarah Goutard' },
                awaiting_count: 0,
                ready_count: 0,
                reported_count: 0,
                awaiting_customer: 0,
                ready_to_pay: 0,
                reported: 0,
                settled_amount: 0,
              },
            ],
          }),
        });
      }
      // owner reports / payments
      return Promise.resolve({ ok: true, json: async () => ({ reports: [], payments: [] }) });
    });

    render(<OrgSettlementCard organizationId="org-sarah" />);

    await waitFor(() => {
      expect(screen.getByTestId('org-settlement-zero-rate-banner')).toBeInTheDocument();
    });
    expect(screen.getByText(/Set a rate under/i)).toBeInTheDocument();
    expect(screen.getByTestId('org-settlement-zero-rate-wassila')).toHaveTextContent(
      /0% rate — set a rate to calculate commission/i,
    );
  });
});
