/**
 * Admin agent detail — the Paid? column in Commission History.
 *
 * Guards the two complaints that drove this change:
 *   1. Ticking Paid? used to run the page-wide load(), which fires 8-11
 *      requests (three of them /api/documents?per_page=200) behind a
 *      full-page "Loading…" spinner. It must now refetch commissions only.
 *   2. Only one row could be updated at a time. Several ticks must be able
 *      to be in flight at once, and a selection can be settled in a single
 *      bulk request.
 *
 * The per-row Paid? checkbox must survive all of this — it's still the
 * everyday way mom marks a single order as settled.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'agent-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

// Child cards do their own fetching; stub them so the request log only
// contains what the page itself asks for.
jest.mock('@/app/components/CommissionReportsCard', () => () => <div data-testid="reports-card" />);
jest.mock('@/app/components/AgentFolderBrowser', () => () => <div />);
jest.mock('@/app/components/ContractChatPanel', () => () => <div />);
jest.mock('@/app/components/SynaliaAgentTab', () => () => <div />);
jest.mock('@/app/components/AddBonusModal', () => () => <div />);
jest.mock('@/app/components/AddQuickOrderModal', () => () => <div />);
jest.mock('@/app/components/NewClientBonusModal', () => () => <div />);

import AdminAgentDetailsPage from '../[id]/page';

const AGENT = {
  id: 'agent-1',
  full_name: 'Nicolas Wholesale France',
  email: 'nicolas@example.com',
  commission_rate: 15,
  organization_id: null,
  is_agent: true,
  agent_status: 'active',
  new_client_bonus_enabled: false,
  new_client_bonus_amount: 200,
};

const ORDER_1 = 'aaaaaaaa-1111-1111-1111-111111111111';
const BONUS_1 = 'bbbbbbbb-1111-1111-1111-111111111111';
const ORDER_2 = 'aaaaaaaa-2222-2222-2222-222222222222';

function commissions() {
  return [
    {
      id: ORDER_1,
      type: 'order',
      status: 'pending',
      agent_id: 'agent-1',
      document_id: 'doc-1',
      order_total: 1000,
      commission_rate: 15,
      commission_amount: 150,
      customer_paid_at: null,
      created_at: '2026-08-01T10:00:00.000Z',
      document: {
        id: 'doc-1',
        client_company: 'ACME JEWELS',
        total_amount: 1000,
        created_at: '2026-02-21T11:40:53.000Z',
      },
    },
    {
      id: BONUS_1,
      type: 'new_client_bonus',
      status: 'pending',
      agent_id: 'agent-1',
      document_id: 'doc-1',
      order_total: 0,
      commission_rate: 0,
      commission_amount: 200,
      customer_paid_at: null,
      created_at: '2026-08-01T10:00:00.000Z',
      document: { id: 'doc-1', client_company: 'ACME JEWELS', total_amount: 1000 },
    },
    {
      id: ORDER_2,
      type: 'order',
      status: 'pending',
      agent_id: 'agent-1',
      document_id: 'doc-2',
      order_total: 500,
      commission_rate: 15,
      commission_amount: 75,
      customer_paid_at: null,
      created_at: '2026-08-02T10:00:00.000Z',
      document: { id: 'doc-2', client_company: 'BIJOUX LYON', total_amount: 500 },
    },
  ];
}

let calls = [];
let deferCustomerPaid = false;
let pendingResolvers = [];
// Stands in for the database so a refetch reflects what was just written,
// the way the real endpoint does.
let serverRows = [];

const json = (body) => Promise.resolve({ ok: true, json: async () => body });

/** Same cascade rule the API applies: an order carries its linked bonus. */
function writeServerPaid(ids, paid) {
  const stamp = paid ? new Date().toISOString() : null;
  const targets = new Set(ids);
  const cascadeKeys = new Set(
    serverRows
      .filter((r) => targets.has(r.id) && r.type === 'order' && r.document_id)
      .map((r) => `${r.agent_id}::${r.document_id}`),
  );
  serverRows = serverRows.map((r) => {
    const hit =
      targets.has(r.id) ||
      (r.type === 'new_client_bonus' && r.document_id && cascadeKeys.has(`${r.agent_id}::${r.document_id}`));
    return hit ? { ...r, customer_paid_at: stamp } : r;
  });
}

function installFetch() {
  calls = [];
  pendingResolvers = [];
  serverRows = commissions();
  global.fetch = jest.fn((url, opts) => {
    const href = String(url);
    calls.push({ url: href, method: opts?.method || 'GET', body: opts?.body });

    if (href.startsWith('/api/agents')) return json({ agents: [AGENT] });
    if (href.startsWith('/api/commissions?')) return json({ commissions: serverRows, summary: {} });
    if (href.startsWith('/api/agent-payments')) return json({ payments: [] });
    if (href.startsWith('/api/commission-reports')) return json({ reports: [] });
    if (href.startsWith('/api/documents')) return json({ documents: [] });
    if (href === '/api/commissions/customer-paid-bulk') {
      const { ids, paid } = JSON.parse(opts.body);
      writeServerPaid(ids, paid);
      return json({ updated_count: ids.length, not_found: [], cascaded_bonus_ids: [] });
    }
    if (href.includes('/customer-paid')) {
      const id = href.split('/')[3];
      const { paid } = JSON.parse(opts.body);
      const commit = () => writeServerPaid([id], paid);
      const res = { ok: true, json: async () => ({ commission: {}, cascaded_bonuses: 1 }) };
      if (deferCustomerPaid) {
        return new Promise((resolve) => pendingResolvers.push(() => { commit(); resolve(res); }));
      }
      commit();
      return Promise.resolve(res);
    }
    return json({});
  });
}

const countCalls = (matcher) => calls.filter((c) => matcher(c)).length;
const documentCalls = () => countCalls((c) => c.url.startsWith('/api/documents'));
const commissionListCalls = () => countCalls((c) => c.url.startsWith('/api/commissions?'));
const singlePaidCalls = () => calls.filter((c) => c.method === 'PATCH' && c.url.includes('/customer-paid') && !c.url.endsWith('bulk'));
const bulkCalls = () => calls.filter((c) => c.url === '/api/commissions/customer-paid-bulk');

/** The Paid? checkbox lives in the second-to-last cell of each row. */
function paidCheckbox(clientName) {
  const row = screen.getByText(clientName).closest('tr');
  const boxes = within(row).getAllByRole('checkbox');
  return boxes[boxes.length - 1];
}

/** The selection checkbox is the first cell of each row. */
function selectCheckbox(clientName) {
  const row = screen.getByText(clientName).closest('tr');
  return within(row).getAllByRole('checkbox')[0];
}

async function renderPage() {
  render(<AdminAgentDetailsPage />);
  await screen.findByText('ACME JEWELS');
}

beforeEach(() => {
  deferCustomerPaid = false;
  installFetch();
});

describe('Paid? checkbox — still there, still works', () => {
  test('every togglable row has a Paid? checkbox and a selection checkbox', async () => {
    await renderPage();
    expect(paidCheckbox('ACME JEWELS')).toBeInTheDocument();
    expect(selectCheckbox('ACME JEWELS')).toBeInTheDocument();
    expect(paidCheckbox('BIJOUX LYON')).toBeInTheDocument();
  });

  test('ticking one row sends exactly one PATCH for that commission', async () => {
    await renderPage();
    fireEvent.click(paidCheckbox('ACME JEWELS'));
    await waitFor(() => expect(singlePaidCalls()).toHaveLength(1));
    expect(singlePaidCalls()[0].url).toBe(`/api/commissions/${ORDER_1}/customer-paid`);
    expect(JSON.parse(singlePaidCalls()[0].body)).toEqual({ paid: true });
  });

  test('the linked new-client bonus is ticked optimistically, before the server replies', async () => {
    deferCustomerPaid = true;
    await renderPage();
    fireEvent.click(paidCheckbox('ACME JEWELS'));
    await waitFor(() => expect(singlePaidCalls()).toHaveLength(1));
    const bonusRow = screen.getByText(/New client bonus — ACME JEWELS/).closest('tr');
    const bonusPaid = within(bonusRow).getAllByRole('checkbox').at(-1);
    expect(bonusPaid).toBeChecked();
  });
});

describe('Paid? no longer triggers the full page reload', () => {
  test('no /api/documents refetch after ticking a row', async () => {
    await renderPage();
    const before = documentCalls();
    expect(before).toBeGreaterThan(0); // initial load did fetch documents

    fireEvent.click(paidCheckbox('ACME JEWELS'));
    await waitFor(() => expect(commissionListCalls()).toBe(2));

    expect(documentCalls()).toBe(before);
    expect(countCalls((c) => c.url.startsWith('/api/agents'))).toBe(1);
    expect(countCalls((c) => c.url.startsWith('/api/agent-payments'))).toBe(1);
    expect(countCalls((c) => c.url.startsWith('/api/commission-reports'))).toBe(1);
  });

  test('the table stays on screen — no full-page Loading spinner', async () => {
    await renderPage();
    fireEvent.click(paidCheckbox('ACME JEWELS'));
    await waitFor(() => expect(commissionListCalls()).toBe(2));
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(screen.getByText('ACME JEWELS')).toBeInTheDocument();
  });
});

describe('several rows at once', () => {
  test('a second row can be ticked while the first is still in flight', async () => {
    deferCustomerPaid = true;
    await renderPage();

    fireEvent.click(paidCheckbox('ACME JEWELS'));
    await waitFor(() => expect(singlePaidCalls()).toHaveLength(1));

    fireEvent.click(paidCheckbox('BIJOUX LYON'));
    await waitFor(() => expect(singlePaidCalls()).toHaveLength(2));

    // Both requests are open at the same time.
    expect(pendingResolvers).toHaveLength(2);
    expect(singlePaidCalls().map((c) => c.url)).toEqual([
      `/api/commissions/${ORDER_1}/customer-paid`,
      `/api/commissions/${ORDER_2}/customer-paid`,
    ]);
  });

  test('clicking the same row twice while in flight only sends one request', async () => {
    deferCustomerPaid = true;
    await renderPage();
    const box = paidCheckbox('ACME JEWELS');
    fireEvent.click(box);
    fireEvent.click(box);
    await waitFor(() => expect(singlePaidCalls()).toHaveLength(1));
    expect(singlePaidCalls()).toHaveLength(1);
  });
});

describe('bulk selection', () => {
  test('the bulk bar only appears once something is selected', async () => {
    await renderPage();
    expect(screen.queryByTestId('bulk-paid-bar')).not.toBeInTheDocument();
    fireEvent.click(selectCheckbox('ACME JEWELS'));
    expect(screen.getByTestId('bulk-paid-bar')).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  test('select-all then Mark as paid sends exactly one bulk request', async () => {
    await renderPage();
    fireEvent.click(screen.getByLabelText('Select all rows'));
    expect(screen.getByText('3 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /mark 3 as paid/i }));
    await waitFor(() => expect(bulkCalls()).toHaveLength(1));

    expect(singlePaidCalls()).toHaveLength(0);
    const body = JSON.parse(bulkCalls()[0].body);
    expect(body.paid).toBe(true);
    expect(body.ids.sort()).toEqual([ORDER_1, ORDER_2, BONUS_1].sort());
  });

  test('the bulk action refreshes commissions but not documents', async () => {
    await renderPage();
    const docsBefore = documentCalls();
    fireEvent.click(screen.getByLabelText('Select all rows'));
    fireEvent.click(screen.getByRole('button', { name: /mark 3 as paid/i }));
    await waitFor(() => expect(commissionListCalls()).toBe(2));
    expect(documentCalls()).toBe(docsBefore);
  });

  test('the selection clears after a successful bulk action', async () => {
    await renderPage();
    fireEvent.click(selectCheckbox('ACME JEWELS'));
    fireEvent.click(screen.getByRole('button', { name: /mark 1 as paid/i }));
    await waitFor(() => expect(screen.queryByTestId('bulk-paid-bar')).not.toBeInTheDocument());
  });

  test('Clear drops the selection without sending anything', async () => {
    await renderPage();
    fireEvent.click(screen.getByLabelText('Select all rows'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByTestId('bulk-paid-bar')).not.toBeInTheDocument();
    expect(bulkCalls()).toHaveLength(0);
  });

  test('rows already in the requested state are not re-sent', async () => {
    await renderPage();
    // Tick one row first, then bulk-mark everything as paid.
    fireEvent.click(paidCheckbox('ACME JEWELS'));
    await waitFor(() => expect(singlePaidCalls()).toHaveLength(1));

    fireEvent.click(screen.getByLabelText('Select all rows'));
    fireEvent.click(screen.getByRole('button', { name: /mark 3 as paid/i }));
    await waitFor(() => expect(bulkCalls()).toHaveLength(1));

    // ORDER_1 and its cascaded bonus are already paid locally, so only the
    // remaining order goes over the wire.
    expect(JSON.parse(bulkCalls()[0].body).ids).toEqual([ORDER_2]);
  });

  test('shows one clear rate, three money cards, and the fair-aware orders table', async () => {
    await renderPage();

    expect(screen.getByTestId('effective-rate-card')).toHaveTextContent('15%');
    expect(screen.getByTestId('effective-rate-card')).toHaveTextContent('custom agent rate');
    expect(screen.getByText('EARNED')).toBeInTheDocument();
    expect(screen.getByText('PAID OUT')).toBeInTheDocument();
    expect(screen.getByText('OUTSTANDING')).toBeInTheDocument();
    expect(screen.getByText('Orders & Commission')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Fair' })).toBeInTheDocument();
    expect(screen.queryByText(/Estimated from order documents/i)).not.toBeInTheDocument();
  });

  test('shows the original document date, not the later commission materialization date', async () => {
    await renderPage();
    const row = screen.getByText('ACME JEWELS').closest('tr');
    expect(within(row).getByText('21 Feb')).toBeInTheDocument();
    expect(within(row).queryByText('1 Aug')).not.toBeInTheDocument();
  });
});
