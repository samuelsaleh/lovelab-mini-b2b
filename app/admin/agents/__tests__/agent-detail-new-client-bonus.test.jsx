/**
 * Admin agent detail — granting the new-client bonus by hand.
 *
 * The €200 is no longer added on order save. It only exists if the
 * admin clicks the button on the order, so this test guards both
 * halves: the button appears on exactly the right rows, and clicking
 * it posts the right thing.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'agent-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

jest.mock('@/app/components/CommissionReportsCard', () => () => <div />);
jest.mock('@/app/components/AgentFolderBrowser', () => () => <div />);
jest.mock('@/app/components/ContractChatPanel', () => () => <div />);
jest.mock('@/app/components/SynaliaAgentTab', () => () => <div />);
jest.mock('@/app/components/AddBonusModal', () => () => <div />);
jest.mock('@/app/components/AddQuickOrderModal', () => () => <div />);
jest.mock('@/app/components/NewClientBonusModal', () => () => <div />);

import AdminAgentDetailsPage from '../[id]/page';

const ORDER_NEW = 'aaaaaaaa-1111-1111-1111-111111111111';
const ORDER_REPEAT = 'aaaaaaaa-2222-2222-2222-222222222222';
const ORDER_WITH_BONUS = 'aaaaaaaa-3333-3333-3333-333333333333';
const BONUS_EXISTING = 'bbbbbbbb-3333-3333-3333-333333333333';

const manualAgent = (over = {}) => ({
  id: 'agent-1',
  full_name: 'Nicolas Wholesale France',
  email: 'nicolas@example.com',
  commission_rate: 15,
  organization_id: null,
  is_agent: true,
  agent_status: 'active',
  new_client_bonus_mode: 'manual',
  new_client_bonus_enabled: true,
  new_client_bonus_amount: 200,
  ...over,
});

const orderRow = (id, docId, company, createdAt) => ({
  id,
  type: 'order',
  status: 'pending',
  agent_id: 'agent-1',
  document_id: docId,
  order_total: 1000,
  commission_rate: 15,
  commission_amount: 150,
  customer_paid_at: null,
  created_at: createdAt,
  document: { id: docId, client_company: company, total_amount: 1000, created_at: createdAt },
});

function baseCommissions() {
  return [
    // First (and only) order for ACME — the open decision.
    orderRow(ORDER_NEW, 'doc-1', 'ACME JEWELS', '2026-08-01T10:00:00.000Z'),
    // BIJOUX already has a bonus, so neither of its orders may be offered.
    orderRow(ORDER_WITH_BONUS, 'doc-3', 'BIJOUX LYON', '2026-07-01T10:00:00.000Z'),
    {
      id: BONUS_EXISTING,
      type: 'new_client_bonus',
      status: 'pending',
      agent_id: 'agent-1',
      document_id: 'doc-3',
      order_total: 0,
      commission_rate: 0,
      commission_amount: 200,
      customer_paid_at: null,
      created_at: '2026-07-01T10:00:00.000Z',
      document: { id: 'doc-3', client_company: 'BIJOUX LYON' },
    },
    orderRow(ORDER_REPEAT, 'doc-4', 'BIJOUX LYON', '2026-08-05T10:00:00.000Z'),
  ];
}

let calls = [];
let agent = manualAgent();
let serverRows = [];
let bonusPostResponse = { ok: true, body: { created: true, amount: 200 } };

const json = (body) => Promise.resolve({ ok: true, json: async () => body });

function installFetch() {
  calls = [];
  serverRows = baseCommissions();
  global.fetch = jest.fn((url, opts) => {
    const href = String(url);
    calls.push({ url: href, method: opts?.method || 'GET', body: opts?.body });

    if (href.startsWith('/api/agents')) return json({ agents: [agent] });
    if (href.startsWith('/api/commissions?')) return json({ commissions: serverRows, summary: {} });
    if (href.startsWith('/api/agent-payments')) return json({ payments: [] });
    if (href.startsWith('/api/commission-reports')) return json({ reports: [] });
    if (href.startsWith('/api/documents')) return json({ documents: [] });
    if (href === '/api/commissions/new-client-bonus') {
      const { document_id } = JSON.parse(opts.body);
      if (bonusPostResponse.ok) {
        serverRows = [
          ...serverRows,
          {
            id: `bonus-for-${document_id}`,
            type: 'new_client_bonus',
            status: 'pending',
            agent_id: 'agent-1',
            document_id,
            order_total: 0,
            commission_rate: 0,
            commission_amount: 200,
            customer_paid_at: null,
            created_at: '2026-08-12T10:00:00.000Z',
            document: { id: document_id, client_company: 'ACME JEWELS' },
          },
        ];
      }
      return Promise.resolve({
        ok: bonusPostResponse.ok,
        json: async () => bonusPostResponse.body,
      });
    }
    return json({});
  });
}

const bonusPostCalls = () => calls.filter((c) => c.url === '/api/commissions/new-client-bonus');

function rowFor(text) {
  return screen.getAllByText(text)[0].closest('tr');
}

function bonusButtonIn(rowText) {
  return within(rowFor(rowText)).queryByRole('button', { name: /bonus/i });
}

async function renderPage() {
  render(<AdminAgentDetailsPage />);
  await screen.findByText('ACME JEWELS');
}

beforeEach(() => {
  agent = manualAgent();
  bonusPostResponse = { ok: true, body: { created: true, amount: 200 } };
  installFetch();
});

describe('where the button shows up', () => {
  test('the first order from a new client offers the bonus', async () => {
    await renderPage();
    const btn = bonusButtonIn('ACME JEWELS');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('200,00');
  });

  test('that row is flagged as a new client', async () => {
    await renderPage();
    expect(within(rowFor('ACME JEWELS')).getByText('NEW CLIENT')).toBeInTheDocument();
  });

  test('a client that already has a bonus is not offered another one', async () => {
    await renderPage();
    const bonusRows = screen.getAllByText(/BIJOUX LYON/);
    for (const node of bonusRows) {
      const row = node.closest('tr');
      expect(within(row).queryByRole('button', { name: /\+.*bonus/i })).toBeNull();
    }
  });

  test('no buttons at all when the bonus is switched off for this agent', async () => {
    agent = manualAgent({ new_client_bonus_mode: 'off', new_client_bonus_enabled: false });
    await renderPage();
    expect(bonusButtonIn('ACME JEWELS')).toBeNull();
    expect(screen.queryByText('NEW CLIENT')).toBeNull();
  });

  test('no buttons when the agent has no amount configured', async () => {
    agent = manualAgent({ new_client_bonus_amount: null });
    await renderPage();
    expect(bonusButtonIn('ACME JEWELS')).toBeNull();
  });

  test('an auto agent can still be topped up by hand', async () => {
    agent = manualAgent({ new_client_bonus_mode: 'auto' });
    await renderPage();
    expect(bonusButtonIn('ACME JEWELS')).toBeInTheDocument();
  });
});

describe('clicking the button', () => {
  test('posts the agent and the order, and nothing else', async () => {
    await renderPage();
    fireEvent.click(bonusButtonIn('ACME JEWELS'));
    await waitFor(() => expect(bonusPostCalls()).toHaveLength(1));
    const call = bonusPostCalls()[0];
    expect(call.method).toBe('POST');
    expect(JSON.parse(call.body)).toEqual({ agent_id: 'agent-1', document_id: 'doc-1' });
  });

  test('never sends an amount — the server decides what it is worth', async () => {
    await renderPage();
    fireEvent.click(bonusButtonIn('ACME JEWELS'));
    await waitFor(() => expect(bonusPostCalls()).toHaveLength(1));
    expect(JSON.parse(bonusPostCalls()[0].body)).not.toHaveProperty('amount');
  });

  test('the new bonus row appears and the button goes away', async () => {
    await renderPage();
    fireEvent.click(bonusButtonIn('ACME JEWELS'));
    await screen.findByText(/New client bonus — ACME JEWELS/);
    await waitFor(() => expect(bonusButtonIn('ACME JEWELS')).toBeNull());
  });

  test('refreshes commissions without a full page reload', async () => {
    await renderPage();
    const documentsBefore = calls.filter((c) => c.url.startsWith('/api/documents')).length;
    fireEvent.click(bonusButtonIn('ACME JEWELS'));
    await waitFor(() => expect(bonusPostCalls()).toHaveLength(1));
    await waitFor(() =>
      expect(calls.filter((c) => c.url.startsWith('/api/commissions?')).length).toBeGreaterThan(1),
    );
    expect(calls.filter((c) => c.url.startsWith('/api/documents')).length).toBe(documentsBefore);
  });

  test('a double click cannot create two bonuses', async () => {
    await renderPage();
    const btn = bonusButtonIn('ACME JEWELS');
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(bonusPostCalls()).toHaveLength(1));
  });

  test('a refusal from the server is shown and creates nothing', async () => {
    bonusPostResponse = {
      ok: false,
      body: { error: 'This is not the first order for this customer.', reason: 'not_first_order' },
    };
    await renderPage();
    fireEvent.click(bonusButtonIn('ACME JEWELS'));
    expect(await screen.findByText(/not the first order for this customer/i)).toBeInTheDocument();
    expect(screen.queryByText(/New client bonus — ACME JEWELS/)).toBeNull();
    // Still clickable, so the admin can retry after fixing the cause.
    await waitFor(() => expect(bonusButtonIn('ACME JEWELS')).toBeEnabled());
  });
});
