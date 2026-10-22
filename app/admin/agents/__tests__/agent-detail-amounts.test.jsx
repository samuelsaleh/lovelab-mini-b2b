/**
 * Admin agent detail — edit a line's Net / Commission and cancel a line,
 * like on the organization page (Sam, 22 Oct 2026: "for all the agents").
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

const AGENT = {
  id: 'agent-1',
  full_name: 'Corinne Secret Code Paris',
  email: 'corinne@example.com',
  commission_rate: 15,
  organization_id: null,
  is_agent: true,
  agent_status: 'active',
  new_client_bonus_mode: 'off',
  new_client_bonus_amount: 0,
};

const row = (id, company, over = {}) => ({
  id,
  type: 'order',
  status: 'pending',
  agent_id: 'agent-1',
  document_id: `doc-${id}`,
  order_total: 1000,
  commission_rate: 15,
  commission_amount: 150,
  customer_paid_at: null,
  report_id: null,
  created_at: '2026-09-14T10:00:00.000Z',
  document: { id: `doc-${id}`, client_company: company, total_amount: 1000 },
  ...over,
});

let serverRows;
let calls;

const json = (body, ok = true) => Promise.resolve({ ok, json: async () => body });

function installFetch() {
  calls = [];
  serverRows = [
    row('c1', 'SARL SKYGARDEN'),
    row('c2', 'PAID SHOP', { status: 'paid', customer_paid_at: '2026-09-01T00:00:00.000Z' }),
  ];
  global.fetch = jest.fn((url, opts) => {
    const href = String(url);
    const method = opts?.method || 'GET';
    const body = opts?.body ? JSON.parse(opts.body) : null;
    calls.push({ href, method, body });
    const patch = href.match(/^\/api\/commissions\/([^/?]+)$/);
    if (patch && method === 'PATCH') {
      serverRows = serverRows.map((r) => {
        if (r.id !== patch[1]) return r;
        const next = { ...r, ...body };
        if (body.order_total !== undefined && body.commission_amount === undefined) {
          next.commission_amount = Math.round(body.order_total * r.commission_rate) / 100;
        }
        return next;
      });
      return json({ success: true, commission: serverRows.find((r) => r.id === patch[1]) });
    }
    if (href.startsWith('/api/agents')) return json({ agents: [AGENT] });
    if (href.startsWith('/api/commissions?')) return json({ commissions: serverRows, summary: {} });
    if (href.startsWith('/api/agent-payments')) return json({ payments: [] });
    if (href.startsWith('/api/commission-reports')) return json({ reports: [] });
    if (href.startsWith('/api/documents')) return json({ documents: [] });
    return json({});
  });
}

beforeEach(() => {
  installFetch();
});
afterEach(() => {
  jest.restoreAllMocks();
});

const rowFor = (text) => screen.getAllByText(text)[0].closest('tr');

test('a new net is saved and the commission follows the rate', async () => {
  render(<AdminAgentDetailsPage />);
  await screen.findByText('SARL SKYGARDEN');
  const net = within(rowFor('SARL SKYGARDEN')).getByLabelText('Net for SARL SKYGARDEN');
  expect(net).toHaveValue('1000.00');

  fireEvent.change(net, { target: { value: '1842' } });
  fireEvent.blur(net, { target: { value: '1842' } });

  await waitFor(() => {
    expect(calls.find((c) => c.href === '/api/commissions/c1' && c.method === 'PATCH')).toMatchObject({ body: { order_total: 1842 } });
  });
  const commission = within(rowFor('SARL SKYGARDEN')).getByLabelText('Commission for SARL SKYGARDEN');
  await waitFor(() => expect(commission).toHaveValue('276.30'));
});

test('the commission itself can be typed', async () => {
  render(<AdminAgentDetailsPage />);
  await screen.findByText('SARL SKYGARDEN');
  const commission = within(rowFor('SARL SKYGARDEN')).getByLabelText('Commission for SARL SKYGARDEN');
  fireEvent.change(commission, { target: { value: '200,5' } });
  fireEvent.blur(commission, { target: { value: '200,5' } });
  await waitFor(() => {
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ body: { commission_amount: 200.5 } });
  });
});

test('a paid line shows plain amounts, not inputs', async () => {
  render(<AdminAgentDetailsPage />);
  await screen.findByText('PAID SHOP');
  expect(within(rowFor('PAID SHOP')).queryByLabelText(/Net for/)).not.toBeInTheDocument();
  expect(within(rowFor('PAID SHOP')).queryByText('Cancel line')).not.toBeInTheDocument();
});

test('Cancel line sends status cancelled; Restore brings it back', async () => {
  render(<AdminAgentDetailsPage />);
  await screen.findByText('SARL SKYGARDEN');

  fireEvent.click(within(rowFor('SARL SKYGARDEN')).getByText('Cancel line'));
  await waitFor(() => {
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ href: '/api/commissions/c1', body: { status: 'cancelled' } });
  });

  const restore = await within(rowFor('SARL SKYGARDEN')).findByText('Restore');
  fireEvent.click(restore);
  await waitFor(() => {
    expect(calls.filter((c) => c.method === 'PATCH').pop()).toMatchObject({ body: { status: 'pending' } });
  });
});
