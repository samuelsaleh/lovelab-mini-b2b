/**
 * Admin agent detail — forcing a commission on or off a report by hand.
 *
 * The bug this exists for: four of Nicolas's lines went out on the June
 * report but showed "Awaiting", because the badge also demanded the Paid?
 * tick. They were invisible in the wrong bucket AND excluded from every later
 * report, since a row with a report link is never swept up again. So the
 * badge now follows the link, and there's a button to move a line either way.
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

const REPORT_ID = 'rrrrrrrr-1111-1111-1111-111111111111';
const STUCK = 'aaaaaaaa-1111-1111-1111-111111111111';
const READY = 'aaaaaaaa-2222-2222-2222-222222222222';
const PAID = 'aaaaaaaa-3333-3333-3333-333333333333';
const CANCELLED = 'aaaaaaaa-4444-4444-4444-444444444444';

const AGENT = {
  id: 'agent-1',
  full_name: 'Nicolas Wholesale France',
  email: 'nicolas@example.com',
  commission_rate: 15,
  organization_id: null,
  is_agent: true,
  agent_status: 'active',
  new_client_bonus_mode: 'off',
  new_client_bonus_enabled: false,
  new_client_bonus_amount: 200,
};

const REPORTS = [
  { id: REPORT_ID, period_label: 'June 2026', period_key: '2026-06', status: 'sent', created_at: '2026-07-01T06:00:00.000Z' },
];

const row = (id, company, over = {}) => ({
  id,
  type: 'order',
  status: 'pending',
  agent_id: 'agent-1',
  document_id: `doc-${id.slice(0, 8)}`,
  order_total: 1000,
  commission_rate: 15,
  commission_amount: 150,
  customer_paid_at: null,
  report_id: null,
  created_at: '2026-06-11T10:00:00.000Z',
  document: { id: `doc-${id.slice(0, 8)}`, client_company: company, total_amount: 1000 },
  ...over,
});

function baseCommissions() {
  return [
    // The bug: on the June report, Paid? never ticked.
    row(STUCK, 'STUCK SHOP', { report_id: REPORT_ID }),
    row(READY, 'READY SHOP', { customer_paid_at: '2026-08-01T09:00:00.000Z' }),
    row(PAID, 'PAID SHOP', { status: 'paid', customer_paid_at: '2026-05-01T09:00:00.000Z', paid_at: '2026-06-01T09:00:00.000Z' }),
    row(CANCELLED, 'CANCELLED SHOP', { status: 'cancelled' }),
  ];
}

let calls = [];
let serverRows = [];
let patchResponse = { ok: true, body: { commission: {}, report: REPORTS[0], cascaded_bonuses: 0 } };

const json = (body) => Promise.resolve({ ok: true, json: async () => body });

function installFetch() {
  calls = [];
  serverRows = baseCommissions();
  global.fetch = jest.fn((url, opts) => {
    const href = String(url);
    calls.push({ url: href, method: opts?.method || 'GET', body: opts?.body });

    if (href.startsWith('/api/agents')) return json({ agents: [AGENT] });
    if (href.startsWith('/api/commissions?')) return json({ commissions: serverRows, summary: {} });
    if (href.startsWith('/api/agent-payments')) return json({ payments: [] });
    if (href.startsWith('/api/commission-reports')) return json({ reports: REPORTS });
    if (href.startsWith('/api/documents')) return json({ documents: [] });

    const reported = href.match(/^\/api\/commissions\/([^/]+)\/reported$/);
    if (reported) {
      if (patchResponse.ok) {
        const wanted = JSON.parse(opts.body).reported;
        serverRows = serverRows.map((r) =>
          r.id === reported[1]
            ? {
                ...r,
                report_id: wanted ? REPORT_ID : null,
                customer_paid_at: wanted ? (r.customer_paid_at || '2026-08-12T09:00:00.000Z') : r.customer_paid_at,
              }
            : r,
        );
      }
      return Promise.resolve({ ok: patchResponse.ok, json: async () => patchResponse.body });
    }
    return json({});
  });
}

const patchCalls = () => calls.filter((c) => /\/reported$/.test(c.url));
const rowFor = (text) => screen.getAllByText(text)[0].closest('tr');
const reportButtonIn = (text) =>
  within(rowFor(text)).queryByRole('button', { name: /mark reported|not reported/i });
const badgeIn = (text) => {
  const cells = within(rowFor(text)).getAllByRole('cell');
  return cells[cells.length - 1].textContent;
};

async function renderPage() {
  render(<AdminAgentDetailsPage />);
  await screen.findByText('STUCK SHOP');
}

beforeEach(() => {
  patchResponse = { ok: true, body: { commission: {}, report: REPORTS[0], cascaded_bonuses: 0 } };
  installFetch();
});

describe('the badge follows the report link', () => {
  test('a line on a report reads Reported even with no Paid? tick', async () => {
    await renderPage();
    expect(badgeIn('STUCK SHOP')).toMatch(/Reported/);
    expect(badgeIn('STUCK SHOP')).not.toMatch(/Awaiting/);
  });

  test('the other states are untouched', async () => {
    await renderPage();
    expect(badgeIn('READY SHOP')).toMatch(/Ready/);
    expect(badgeIn('PAID SHOP')).toMatch(/Paid/);
    expect(badgeIn('CANCELLED SHOP')).toMatch(/Cancelled/);
  });

  test('the filter chips agree with the badges', async () => {
    await renderPage();
    const reportedChip = screen.getByRole('button', { name: /^Reported/ });
    expect(reportedChip).toHaveTextContent('1');
    fireEvent.click(reportedChip);
    await waitFor(() => expect(screen.queryByText('READY SHOP')).toBeNull());
    expect(screen.getByText('STUCK SHOP')).toBeInTheDocument();
  });
});

describe('the manual button', () => {
  test('offers to take a reported line back off', async () => {
    await renderPage();
    expect(reportButtonIn('STUCK SHOP')).toHaveTextContent('Not reported');
  });

  test('offers to put an unreported line on the last report', async () => {
    await renderPage();
    expect(reportButtonIn('READY SHOP')).toHaveTextContent('Mark reported');
  });

  test('names the report it would use, so it is not a blind click', async () => {
    await renderPage();
    expect(reportButtonIn('READY SHOP')).toHaveAttribute('title', expect.stringContaining('June 2026'));
  });

  test('is not offered on settled rows', async () => {
    await renderPage();
    expect(reportButtonIn('PAID SHOP')).toBeNull();
    expect(reportButtonIn('CANCELLED SHOP')).toBeNull();
  });
});

describe('clicking it', () => {
  test('unlinks a reported row', async () => {
    await renderPage();
    fireEvent.click(reportButtonIn('STUCK SHOP'));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    const call = patchCalls()[0];
    expect(call.url).toBe(`/api/commissions/${STUCK}/reported`);
    expect(call.method).toBe('PATCH');
    expect(JSON.parse(call.body)).toEqual({ reported: false });
  });

  test('and the row drops back out of Reported', async () => {
    await renderPage();
    fireEvent.click(reportButtonIn('STUCK SHOP'));
    await waitFor(() => expect(badgeIn('STUCK SHOP')).toMatch(/Awaiting/));
    expect(reportButtonIn('STUCK SHOP')).toHaveTextContent('Mark reported');
  });

  test('links an unreported row', async () => {
    await renderPage();
    fireEvent.click(reportButtonIn('READY SHOP'));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(JSON.parse(patchCalls()[0].body)).toEqual({ reported: true });
    await waitFor(() => expect(badgeIn('READY SHOP')).toMatch(/Reported/));
  });

  test('refreshes the commissions without reloading the page', async () => {
    await renderPage();
    const documentsBefore = calls.filter((c) => c.url.startsWith('/api/documents')).length;
    fireEvent.click(reportButtonIn('STUCK SHOP'));
    await waitFor(() =>
      expect(calls.filter((c) => c.url.startsWith('/api/commissions?')).length).toBeGreaterThan(1),
    );
    expect(calls.filter((c) => c.url.startsWith('/api/documents')).length).toBe(documentsBefore);
  });

  test('a double click sends one request', async () => {
    await renderPage();
    const btn = reportButtonIn('STUCK SHOP');
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
  });

  test('a refusal is shown without wiping the table', async () => {
    patchResponse = { ok: false, body: { error: 'This agent has no report yet — send a report first.' } };
    await renderPage();
    fireEvent.click(reportButtonIn('READY SHOP'));
    expect(await screen.findByText(/no report yet/i)).toBeInTheDocument();
    expect(screen.getByText('STUCK SHOP')).toBeInTheDocument();
    expect(badgeIn('READY SHOP')).toMatch(/Ready/);
  });

  test('the refusal can be dismissed', async () => {
    patchResponse = { ok: false, body: { error: 'This agent has no report yet — send a report first.' } };
    await renderPage();
    fireEvent.click(reportButtonIn('READY SHOP'));
    const alert = await screen.findByRole('alert');
    fireEvent.click(within(alert).getByRole('button', { name: /dismiss/i }));
    await waitFor(() => expect(screen.queryByText(/no report yet/i)).toBeNull());
  });
});
