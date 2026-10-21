/**
 * OrgSettlementCard — organization reports and payments lists (Phase 31).
 *
 *   ✓ reports come from ?organization_id= (never the owner's personal list)
 *   ✓ each report shows the email outcome (Sent / Email failed + reason), the
 *     Drive outcome, whether it was paid, and Drive / Download links
 *   ✓ the payments ledger lists every organization payment with its report
 *   ✓ a report that already has a payment cannot be deleted
 */

import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../OrgCommissionsTable', () => () => <div data-testid="org-commissions-table-mock" />);

import OrgSettlementCard from '../OrgSettlementCard';

const ORG = '171e2660-88f9-4677-a346-72d7c71462e9';

const ledger = {
  organization_summary: { total_commission_earned: 6065, total_paid_out: 1000, pending_balance: 5065 },
  per_member: [
    { user_id: 'sarah', role: 'owner', profile: { full_name: 'Sarah Goutard' }, awaiting_customer: 0, ready_to_pay: 5065, reported: 0, settled_amount: 1000 },
  ],
};

const reports = [
  {
    id: 'rep-sent', period_label: '18 October 2026', period_key: '2026-10-18-0900', total_due: 1000, order_count: 4, bonus_count: 0,
    status: 'sent', email_sent_at: '2026-10-18T09:00:00.000Z', email_recipient: 'dionne@love-lab.com', email_error: null,
    drive_view_link: 'https://drive.google.com/file/d/abc/view', storage_path: 'Org/Org - 2026-10-18-0900.xlsx', created_at: '2026-10-18T09:00:00.000Z',
  },
  {
    id: 'rep-failed', period_label: '20 October 2026', period_key: '2026-10-20-1000', total_due: 760, order_count: 3, bonus_count: 1,
    status: 'generated', email_sent_at: null, email_recipient: null, email_error: 'no_api_key',
    drive_view_link: null, storage_path: 'Org/Org - 2026-10-20-1000.xlsx', created_at: '2026-10-20T10:00:00.000Z',
  },
];

const payments = [
  { id: 'pay-1', agent_id: 'sarah', amount: 1000, payment_date: '2026-10-19T12:00:00.000Z', report_id: 'rep-sent', invoice_number: 'INV-41', notes: 'Organization payment' },
];

let calls = [];

function installFetch() {
  global.fetch = jest.fn((url) => {
    const path = String(url);
    calls.push(path);
    if (path.includes('/ledger')) return Promise.resolve({ ok: true, json: async () => ledger });
    if (path.startsWith('/api/commission-reports?')) return Promise.resolve({ ok: true, json: async () => ({ reports }) });
    if (path.startsWith('/api/agent-payments?')) return Promise.resolve({ ok: true, json: async () => ({ payments }) });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

beforeEach(() => {
  calls = [];
  installFetch();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('OrgSettlementCard reports + payments', () => {
  test('lists the organization reports with email, Drive and payment outcome', async () => {
    render(<OrgSettlementCard organizationId={ORG} organizationName="Sarah Goutard Organization" />);

    await waitFor(() => expect(screen.getByTestId('org-report-rep-sent')).toBeInTheDocument());

    expect(calls).toContain(`/api/commission-reports?organization_id=${ORG}&limit=24`);
    expect(calls.some((p) => p.startsWith('/api/commission-reports?agent_id='))).toBe(false);
    expect(screen.getByTestId('org-commissions-table-mock')).toBeInTheDocument();

    const sent = screen.getByTestId('org-report-rep-sent');
    expect(within(sent).getByText('Sent')).toBeInTheDocument();
    expect(within(sent).getByText('Saved')).toBeInTheDocument();
    expect(within(sent).getByText(/Paid 19\/10\/2026/)).toBeInTheDocument();
    expect(within(sent).getByText('Drive')).toHaveAttribute('href', 'https://drive.google.com/file/d/abc/view');
    expect(within(sent).getByText('Download')).toHaveAttribute('href', '/api/commission-reports/rep-sent/download');
    expect(within(sent).getByText('Download')).toHaveAttribute('download', 'Sarah Goutard Organization - 2026-10-18-0900.xlsx');
    // Already paid → cannot be deleted from here.
    expect(within(sent).queryByText('Cancel report')).not.toBeInTheDocument();

    const failed = screen.getByTestId('org-report-rep-failed');
    expect(within(failed).getByText('Email failed')).toBeInTheDocument();
    expect(within(failed).getByText('no_api_key')).toBeInTheDocument();
    expect(within(failed).getByText('No Drive copy')).toBeInTheDocument();
    expect(within(failed).getByText('Awaiting payment')).toBeInTheDocument();
    expect(within(failed).getByText('Cancel report')).toBeInTheDocument();
    // A report without a Drive copy can be pushed to Drive by hand; one that
    // already has it cannot.
    expect(within(failed).getByText('Save to Drive')).toBeInTheDocument();
    expect(within(sent).queryByText('Save to Drive')).not.toBeInTheDocument();
  });

  test('"Save to Drive" posts to the drive route and refreshes the list', async () => {
    render(<OrgSettlementCard organizationId={ORG} organizationName="Sarah Goutard Organization" />);
    await waitFor(() => expect(screen.getByTestId('org-report-rep-failed')).toBeInTheDocument());
    const before = global.fetch.mock.calls.length;

    fireEvent.click(within(screen.getByTestId('org-report-rep-failed')).getByText('Save to Drive'));

    await waitFor(() => {
      const call = global.fetch.mock.calls.find(([url, opts]) => String(url) === '/api/commission-reports/rep-failed/drive' && opts?.method === 'POST');
      expect(call).toBeTruthy();
    });
    // The list reloads afterwards (ledger fetched again).
    await waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThan(before + 1));
  });

  test('lists every organization payment with its linked report', async () => {
    render(<OrgSettlementCard organizationId={ORG} organizationName="Sarah Goutard Organization" />);

    await waitFor(() => expect(screen.getByTestId('org-payment-pay-1')).toBeInTheDocument());
    const p = screen.getByTestId('org-payment-pay-1');
    expect(within(p).getByText('INV-41')).toBeInTheDocument();
    expect(within(p).getByText('18 October 2026')).toBeInTheDocument();
    expect(screen.getByText(/Edit or delete a payment on Sarah Goutard/)).toHaveAttribute('href', '/admin/agents/sarah');
  });
});
