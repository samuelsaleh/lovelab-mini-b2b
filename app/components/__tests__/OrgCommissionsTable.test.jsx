/**
 * OrgCommissionsTable — every member's commission lines on the org page.
 *
 *   ✓ rows name the agent; the stage strip and chips count Ready vs Awaiting
 *   ✓ the agent select narrows the rows
 *   ✓ Paid? tick calls /customer-paid and flips the row locally, then onChanged
 *   ✓ select-all + "Mark N as paid" sends only the lines not yet ticked
 *   ✓ a failed load shows an inline error, never a crash
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import OrgCommissionsTable from '../OrgCommissionsTable';

const ORG = 'org-1';

const row = (id, agent, over = {}) => ({
  id,
  agent_id: agent.id,
  agent,
  type: 'order',
  status: 'pending',
  document_id: `doc-${id}`,
  order_total: 1000,
  commission_rate: 20,
  commission_amount: 200,
  customer_paid_at: null,
  report_id: null,
  invoice_number: null,
  created_at: '2026-10-05T10:00:00.000Z',
  document: { id: `doc-${id}`, client_company: `SHOP ${id}`, total_amount: 1000, created_at: '2026-10-05T10:00:00.000Z', event: { name: 'Paris Fair', type: 'fair' } },
  ...over,
});

const WASSILA = { id: 'wassila', full_name: 'Wassila Mekidiche', email: 'w@x.com' };
const RUBY = { id: 'ruby', full_name: 'Ruby Robin', email: 'r@x.com' };

let calls = [];
let serverRows = [];

function installFetch({ failList = false } = {}) {
  global.fetch = jest.fn((url, options = {}) => {
    const path = String(url);
    calls.push({ path, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    if (path.startsWith('/api/commissions?organization_id=')) {
      if (failList) return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'ledger exploded' }) });
      return Promise.resolve({ ok: true, json: async () => ({ commissions: serverRows, total_count: serverRows.length }) });
    }
    if (/\/api\/commissions\/[^/]+\/customer-paid$/.test(path)) {
      return Promise.resolve({ ok: true, json: async () => ({ commission: {} }) });
    }
    if (/\/api\/commissions\/[^/]+$/.test(path) && options.method === 'PATCH') {
      const body = JSON.parse(options.body);
      const id = path.split('/').pop();
      const commission = { id, ...body };
      if (body.order_total !== undefined && body.commission_amount === undefined) commission.commission_amount = body.order_total * 0.2;
      return Promise.resolve({ ok: true, json: async () => ({ success: true, commission }) });
    }
    if (/\/api\/commissions\/[^/]+$/.test(path) && options.method === 'DELETE') {
      return Promise.resolve({ ok: true, json: async () => ({ deleted: true }) });
    }
    if (path === '/api/commissions/customer-paid-bulk') {
      return Promise.resolve({ ok: true, json: async () => ({ updated: [] }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

beforeEach(() => {
  calls = [];
  serverRows = [
    row('c1', WASSILA, { customer_paid_at: '2026-10-10T00:00:00.000Z' }),
    row('c2', WASSILA),
    row('c3', RUBY, { customer_paid_at: '2026-10-11T00:00:00.000Z', report_id: 'rep-1' }),
    row('c4', RUBY, { status: 'paid', customer_paid_at: '2026-09-01T00:00:00.000Z', report_id: 'rep-0' }),
  ];
});

afterEach(() => {
  jest.restoreAllMocks();
});

const members = [
  { user_id: 'wassila', role: 'member', profile: { full_name: 'Wassila Mekidiche' } },
  { user_id: 'ruby', role: 'member', profile: { full_name: 'Ruby Robin' } },
  { user_id: 'sarah', role: 'owner', profile: { full_name: 'Sarah Goutard' } },
];
const summary = { awaiting_customer: 200, ready_to_pay: 200, reported: 200, settled_amount: 200 };

async function renderTable(props = {}) {
  const onChanged = jest.fn();
  render(<OrgCommissionsTable organizationId={ORG} members={members} summary={summary} onChanged={onChanged} {...props} />);
  await waitFor(() => expect(screen.getByTestId('org-commissions-row-c1')).toBeInTheDocument());
  return { onChanged };
}

describe('OrgCommissionsTable', () => {
  test('names the agent on each line and counts Ready vs Awaiting', async () => {
    installFetch();
    await renderTable();

    expect(calls[0].path).toBe('/api/commissions?organization_id=org-1&per_page=500');

    expect(within(screen.getByTestId('org-commissions-row-c1')).getByText('Wassila Mekidiche')).toBeInTheDocument();
    expect(within(screen.getByTestId('org-commissions-row-c3')).getByText('Ruby Robin')).toBeInTheDocument();
    expect(within(screen.getByTestId('org-commissions-row-c1')).getByText('Ready')).toBeInTheDocument();
    expect(within(screen.getByTestId('org-commissions-row-c2')).getByText('Awaiting')).toBeInTheDocument();
    expect(within(screen.getByTestId('org-commissions-row-c3')).getByText('Reported')).toBeInTheDocument();
    expect(within(screen.getByTestId('org-commissions-row-c4')).getByText('Paid')).toBeInTheDocument();

    expect(screen.getByTestId('org-commissions-stage-ready')).toHaveTextContent('1 line');
    expect(screen.getByTestId('org-commissions-stage-awaiting')).toHaveTextContent('1 line');
    expect(screen.getByTestId('org-commissions-filter-ready')).toHaveTextContent('Ready 1');

    // Clicking the Ready chip keeps only the ready line.
    fireEvent.click(screen.getByTestId('org-commissions-filter-ready'));
    expect(screen.getByTestId('org-commissions-row-c1')).toBeInTheDocument();
    expect(screen.queryByTestId('org-commissions-row-c2')).not.toBeInTheDocument();
  });

  test('the agent select narrows the rows to one member', async () => {
    installFetch();
    await renderTable();

    fireEvent.change(screen.getByTestId('org-commissions-agent-filter'), { target: { value: 'ruby' } });
    expect(screen.queryByTestId('org-commissions-row-c1')).not.toBeInTheDocument();
    expect(screen.getByTestId('org-commissions-row-c3')).toBeInTheDocument();
    expect(screen.getByTestId('org-commissions-row-c4')).toBeInTheDocument();
  });

  test('Paid? tick calls customer-paid, flips the row and tells the parent', async () => {
    installFetch();
    const { onChanged } = await renderTable();

    const box = within(screen.getByTestId('org-commissions-row-c2')).getByLabelText(/Customer paid SHOP c2/i);
    expect(box).not.toBeChecked();
    fireEvent.click(box);

    await waitFor(() => {
      expect(calls.find((c) => c.path === '/api/commissions/c2/customer-paid')).toMatchObject({ method: 'PATCH', body: { paid: true } });
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(within(screen.getByTestId('org-commissions-row-c2')).getByText('Ready')).toBeInTheDocument();
  });

  test('select all + Mark as paid only sends the lines not ticked yet', async () => {
    installFetch();
    await renderTable();

    fireEvent.click(screen.getByLabelText('Select all rows'));
    const bar = screen.getByTestId('org-commissions-bulk-bar');
    // c4 is paid out → not selectable; c1, c2, c3 are.
    expect(bar).toHaveTextContent('3 selected');
    fireEvent.click(within(bar).getByText('Mark 3 as paid'));

    await waitFor(() => {
      const bulk = calls.find((c) => c.path === '/api/commissions/customer-paid-bulk');
      expect(bulk).toBeTruthy();
      // c1 and c3 already carry customer_paid_at → only c2 goes to the server.
      expect(bulk.body).toEqual({ ids: ['c2'], paid: true });
    });
    await waitFor(() => expect(screen.queryByTestId('org-commissions-bulk-bar')).not.toBeInTheDocument());
    expect(within(screen.getByTestId('org-commissions-row-c2')).getByText('Ready')).toBeInTheDocument();
  });

  test('Delete removes a cancelled order\'s line after confirmation', async () => {
    installFetch();
    const { onChanged } = await renderTable();
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    fireEvent.click(within(screen.getByTestId('org-commissions-row-c2')).getByText('Delete'));

    await waitFor(() => {
      expect(calls.find((c) => c.path === '/api/commissions/c2' && c.method === 'DELETE')).toBeTruthy();
    });
    await waitFor(() => expect(screen.queryByTestId('org-commissions-row-c2')).not.toBeInTheDocument());
    expect(onChanged).toHaveBeenCalled();
  });

  test('Delete does nothing when the confirmation is declined', async () => {
    installFetch();
    await renderTable();
    jest.spyOn(window, 'confirm').mockReturnValue(false);

    fireEvent.click(within(screen.getByTestId('org-commissions-row-c2')).getByText('Delete'));

    expect(calls.find((c) => c.method === 'DELETE')).toBeFalsy();
    expect(screen.getByTestId('org-commissions-row-c2')).toBeInTheDocument();
  });

  test('typing a new net saves it and shows the recalculated commission', async () => {
    installFetch();
    const { onChanged } = await renderTable();
    const net = within(screen.getByTestId('org-commissions-row-c2')).getByLabelText(/Net for SHOP c2/);
    expect(net).toHaveValue('1000.00');

    fireEvent.change(net, { target: { value: '1800' } });
    fireEvent.blur(net, { target: { value: '1800' } });

    await waitFor(() => {
      expect(calls.find((c) => c.path === '/api/commissions/c2' && c.method === 'PATCH')).toMatchObject({ body: { order_total: 1800 } });
    });
    const commission = within(screen.getByTestId('org-commissions-row-c2')).getByLabelText(/Commission for SHOP c2/);
    await waitFor(() => expect(commission).toHaveValue('360.00'));
    expect(onChanged).toHaveBeenCalled();
  });

  test('an unchanged amount is not sent', async () => {
    installFetch();
    await renderTable();
    const net = within(screen.getByTestId('org-commissions-row-c2')).getByLabelText(/Net for SHOP c2/);
    fireEvent.blur(net, { target: { value: '1000.00' } });
    expect(calls.find((c) => c.method === 'PATCH')).toBeFalsy();
  });

  test('Cancel line sends status cancelled and reloads', async () => {
    installFetch();
    const { onChanged } = await renderTable();
    fireEvent.click(within(screen.getByTestId('org-commissions-row-c2')).getByText('Cancel line'));
    await waitFor(() => {
      expect(calls.find((c) => c.path === '/api/commissions/c2' && c.method === 'PATCH')).toMatchObject({ body: { status: 'cancelled' } });
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  test('a failed load shows an inline error with Retry', async () => {
    installFetch({ failList: true });
    render(<OrgCommissionsTable organizationId={ORG} members={members} summary={summary} />);
    await waitFor(() => expect(screen.getByTestId('org-commissions-error')).toHaveTextContent('ledger exploded'));
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});
