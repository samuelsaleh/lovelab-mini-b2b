/**
 * OrgSettlementCard — zero-rate clarity (July 2026).
 * When members have awaiting/ready counts but €0 euros, show a banner
 * and per-row note so Sam knows to set rates.
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

    // The banner warns without opening anything.
    await waitFor(() => {
      expect(screen.getByTestId('org-settlement-zero-rate-banner')).toBeInTheDocument();
    });
    expect(screen.getByText(/Set a rate under/i)).toBeInTheDocument();

    // The per-member note lives in the breakdown, which opens on demand.
    fireEvent.click(screen.getByTestId('org-settlement-breakdown-toggle'));
    expect(screen.getByTestId('org-settlement-zero-rate-wassila')).toHaveTextContent(
      /0% rate — set a rate to calculate commission/i,
    );
  });
});

/**
 * Earned / paid out / outstanding are shown by the summary cards on
 * /admin/organizations/[id], which is the only page that renders this card.
 * Repeating them here is what made that page read as three sets of the same
 * numbers, so the card keeps only the part nothing else says: who gets paid.
 */
describe('OrgSettlementCard header', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockLedger = (perMember) => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/ledger')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            organization_summary: {
              total_commission_earned: 6065,
              total_paid_out: 1000,
              pending_balance: 5065,
            },
            per_member: perMember,
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ reports: [], payments: [] }) });
    });
  };

  test('names the owner the single payment goes to, without repeating the totals', async () => {
    mockLedger([
      {
        user_id: 'sarah',
        role: 'owner',
        profile: { full_name: 'Sarah Goutard' },
        awaiting_customer: 0,
        ready_to_pay: 5065,
        reported: 0,
        settled_amount: 1000,
      },
    ]);

    render(<OrgSettlementCard organizationId="org-sarah" />);

    await waitFor(() => {
      expect(screen.getByText(/payable to Sarah Goutard/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Commission earned')).not.toBeInTheDocument();
    expect(screen.queryByText('Paid out')).not.toBeInTheDocument();
    expect(screen.queryByText('Owed to organization')).not.toBeInTheDocument();
  });

  test('says so plainly when the organization has no owner to pay', async () => {
    mockLedger([
      {
        user_id: 'wassila',
        role: 'member',
        profile: { full_name: 'Wassila Mekidiche' },
        awaiting_customer: 0,
        ready_to_pay: 0,
        reported: 0,
        settled_amount: 0,
      },
    ]);

    render(<OrgSettlementCard organizationId="org-sarah" />);

    await waitFor(() => {
      expect(screen.getByText(/no owner found/i)).toBeInTheDocument();
    });
  });
});

/**
 * The per-member settlement table repeats the same names as the Members table
 * above the card, so it stays collapsed until payout time.
 */
describe('OrgSettlementCard breakdown collapse', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const perMember = [
    {
      user_id: 'sarah',
      role: 'owner',
      profile: { full_name: 'Sarah Goutard' },
      awaiting_customer: 200,
      ready_to_pay: 5065,
      reported: 0,
      settled_amount: 1000,
    },
    {
      user_id: 'wassila',
      role: 'member',
      profile: { full_name: 'Wassila Mekidiche' },
      awaiting_customer: 0,
      ready_to_pay: 3273,
      reported: 0,
      settled_amount: 0,
    },
  ];

  const mockLedger = () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/ledger')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            organization_summary: { total_commission_earned: 6065, total_paid_out: 1000, pending_balance: 5065 },
            per_member: perMember,
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ reports: [], payments: [] }) });
    });
  };

  test('starts collapsed and opens per-member rows only after the toggle', async () => {
    mockLedger();
    render(<OrgSettlementCard organizationId="org-sarah" />);

    const toggle = await screen.findByTestId('org-settlement-breakdown-toggle');
    expect(toggle).toHaveTextContent('Show breakdown (2 members)');
    expect(screen.queryByTestId('org-settlement-member-wassila')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByTestId('org-settlement-member-wassila')).toBeInTheDocument();
    expect(screen.getByTestId('org-settlement-member-sarah')).toBeInTheDocument();
    expect(toggle).toHaveTextContent('Hide breakdown');

    fireEvent.click(toggle);
    expect(screen.queryByTestId('org-settlement-member-wassila')).not.toBeInTheDocument();
  });
});
