/**
 * Admin agent detail — settling a stuck commission by hand ("Force paid").
 *
 * The bug this exists for: SARL GINA's April lines (a €346.50 order and its
 * €200 new-client bonus) went out on a report, the agent was paid, but the
 * lines stayed on "Reported" — no Paid? tick, no payout. A reported row is
 * excluded from every later report, so Record Payment could never reach them
 * again and they sat there. This button is the way out, and Undo reverses it.
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
const GINA_ORDER = 'aaaaaaaa-1111-1111-1111-111111111111';
const GINA_BONUS = 'aaaaaaaa-2222-2222-2222-222222222222';
const READY = 'aaaaaaaa-3333-3333-3333-333333333333';
const AWAITING = 'aaaaaaaa-4444-4444-4444-444444444444';
const PAID = 'aaaaaaaa-5555-5555-5555-555555555555';
const CANCELLED = 'aaaaaaaa-6666-6666-6666-666666666666';

const AGENT = {
  id: 'agent-1',
  full_name: 'Dionne Wholesale',
  email: 'dionne@example.com',
  commission_rate: 15,
  organization_id: null,
  is_agent: true,
  agent_status: 'active',
  new_client_bonus_mode: 'off',
  new_client_bonus_enabled: false,
  new_client_bonus_amount: 200,
};

const REPORTS = [
  { id: REPORT_ID, period_label: 'April 2026', period_key: '2026-04', status: 'sent', created_at: '2026-05-01T06:00:00.000Z' },
];

const row = (id, company, over = {}) => ({
  id,
  type: 'order',
  status: 'pending',
  agent_id: 'agent-1',
  document_id: `doc-${id.slice(0, 8)}`,
  order_total: 2310,
  commission_rate: 15,
  commission_amount: 346.5,
  customer_paid_at: null,
  report_id: null,
  paid_at: null,
  created_at: '2026-04-30T10:00:00.000Z',
  document: { id: `doc-${id.slice(0, 8)}`, client_company: company, total_amount: 2310 },
  ...over,
});

function baseCommissions() {
  return [
    // The real pair: on the April report, Paid? never ticked, never settled.
    row(GINA_ORDER, 'SARL GINA', { report_id: REPORT_ID }),
    row(GINA_BONUS, 'SARL GINA', {
      type: 'new_client_bonus',
      document_id: `doc-${GINA_ORDER.slice(0, 8)}`,
      document: { id: `doc-${GINA_ORDER.slice(0, 8)}`, client_company: 'SARL GINA', total_amount: 2310 },
      report_id: REPORT_ID,
      commission_amount: 200,
      order_total: 0,
      commission_rate: 0,
    }),
    row(READY, 'READY SHOP', { customer_paid_at: '2026-08-01T09:00:00.000Z' }),
    row(AWAITING, 'AWAITING SHOP'),
    row(PAID, 'PAID SHOP', { status: 'paid', customer_paid_at: '2026-05-01T09:00:00.000Z', paid_at: '2026-06-01T09:00:00.000Z' }),
    row(CANCELLED, 'CANCELLED SHOP', { status: 'cancelled' }),
  ];
}

let calls = [];
let serverRows = [];
let patchResponse = { ok: true, body: { commission: {}, cascaded_bonuses: 1 } };

const json = (body) => Promise.resolve({ ok: true, json: async () => body });

// Mirrors the route: the clicked row is settled, and the new-client bonus of
// the same order follows it. Paid? is stamped only where it was missing.
function settleOnServer(id) {
  const clicked = serverRows.find((r) => r.id === id);
  if (!clicked) return;
  const at = '2026-08-13T09:00:00.000Z';
  const settle = (r) => ({
    ...r,
    status: 'paid',
    paid_at: at,
    customer_paid_at: r.customer_paid_at || at,
  });
  serverRows = serverRows.map((r) => {
    if (r.id === id) return settle(r);
    const cascades = clicked.type === 'order'
      && !!clicked.document_id
      && r.type === 'new_client_bonus'
      && r.document_id === clicked.document_id
      && ['pending', 'approved'].includes(r.status);
    return cascades ? settle(r) : r;
  });
}

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

    const forced = href.match(/^\/api\/commissions\/([^/]+)\/force-paid$/);
    if (forced) {
      if (patchResponse.ok) settleOnServer(forced[1]);
      return Promise.resolve({ ok: patchResponse.ok, json: async () => patchResponse.body });
    }

    const reverted = href.match(/^\/api\/commissions\/([^/]+)\/revert-paid$/);
    if (reverted) {
      serverRows = serverRows.map((r) =>
        r.id === reverted[1] ? { ...r, status: 'pending', paid_at: null } : r,
      );
      return json({ commission: {}, cascaded_bonuses: 0 });
    }
    return json({});
  });
}

const forceCalls = () => calls.filter((c) => /\/force-paid$/.test(c.url));
const rowFor = (text) => screen.getAllByText(text)[0].closest('tr');
const forceButtonIn = (text) =>
  within(rowFor(text)).queryByRole('button', { name: /force paid/i });
const undoButtonIn = (text) => within(rowFor(text)).queryByRole('button', { name: /^undo$/i });
const badgeIn = (text) => {
  const cells = within(rowFor(text)).getAllByRole('cell');
  return cells[cells.length - 1].textContent;
};

async function renderPage() {
  render(<AdminAgentDetailsPage />);
  await screen.findByText('SARL GINA');
}

beforeEach(() => {
  patchResponse = { ok: true, body: { commission: {}, cascaded_bonuses: 1 } };
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  installFetch();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('where the button is offered', () => {
  test('on the reported line that never got paid out', async () => {
    await renderPage();
    expect(badgeIn('SARL GINA')).toMatch(/Reported/);
    expect(forceButtonIn('SARL GINA')).toBeInTheDocument();
  });

  test('on its new-client bonus too, so either one can be clicked', async () => {
    await renderPage();
    expect(forceButtonIn('New client bonus — SARL GINA')).toBeInTheDocument();
  });

  test('on a Ready line whose customer paid but which never went on a report', async () => {
    await renderPage();
    expect(forceButtonIn('READY SHOP')).toBeInTheDocument();
  });

  test('NOT on an Awaiting line — tick Paid? first', async () => {
    await renderPage();
    expect(badgeIn('AWAITING SHOP')).toMatch(/Awaiting/);
    expect(forceButtonIn('AWAITING SHOP')).toBeNull();
  });

  test('NOT on lines that are already settled', async () => {
    await renderPage();
    expect(forceButtonIn('PAID SHOP')).toBeNull();
    expect(forceButtonIn('CANCELLED SHOP')).toBeNull();
  });

  test('says what it does, so it is not a blind click', async () => {
    await renderPage();
    expect(forceButtonIn('SARL GINA')).toHaveAttribute(
      'title',
      expect.stringMatching(/already paid.*Undo/is),
    );
  });
});

describe('clicking it', () => {
  test('asks first, and does nothing when mom says no', async () => {
    window.confirm.mockReturnValue(false);
    await renderPage();
    fireEvent.click(forceButtonIn('SARL GINA'));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(forceCalls()).toHaveLength(0));
    expect(badgeIn('SARL GINA')).toMatch(/Reported/);
  });

  test('PATCHes the force-paid endpoint for that row', async () => {
    await renderPage();
    fireEvent.click(forceButtonIn('SARL GINA'));
    await waitFor(() => expect(forceCalls()).toHaveLength(1));
    expect(forceCalls()[0].url).toBe(`/api/commissions/${GINA_ORDER}/force-paid`);
    expect(forceCalls()[0].method).toBe('PATCH');
  });

  test('the line turns Paid and offers Undo instead', async () => {
    await renderPage();
    fireEvent.click(forceButtonIn('SARL GINA'));
    await waitFor(() => expect(badgeIn('SARL GINA')).toMatch(/Paid/));
    expect(forceButtonIn('SARL GINA')).toBeNull();
    expect(undoButtonIn('SARL GINA')).toBeInTheDocument();
  });

  test('the new-client bonus is settled in the same click', async () => {
    await renderPage();
    fireEvent.click(forceButtonIn('SARL GINA'));
    await waitFor(() => expect(badgeIn('New client bonus — SARL GINA')).toMatch(/Paid/));
    expect(forceCalls()).toHaveLength(1);
  });

  // The round trip has to land where it started, or a mistaken click is a
  // one-way door. Forcing keeps the report link, so a reported line comes back
  // as Reported — and the Paid? date it stamped keeps it out of "Awaiting".
  test('Undo puts a reported line back on Reported, where it was', async () => {
    await renderPage();
    fireEvent.click(forceButtonIn('SARL GINA'));
    await waitFor(() => expect(undoButtonIn('SARL GINA')).toBeInTheDocument());
    fireEvent.click(undoButtonIn('SARL GINA'));
    await waitFor(() => expect(badgeIn('SARL GINA')).toMatch(/Reported/));
    expect(forceButtonIn('SARL GINA')).toBeInTheDocument();
  });

  test('Undo puts a Ready line back on Ready, not Awaiting', async () => {
    await renderPage();
    fireEvent.click(forceButtonIn('READY SHOP'));
    await waitFor(() => expect(undoButtonIn('READY SHOP')).toBeInTheDocument());
    fireEvent.click(undoButtonIn('READY SHOP'));
    await waitFor(() => expect(badgeIn('READY SHOP')).toMatch(/Ready/));
  });

  test('leaves every other line alone', async () => {
    await renderPage();
    fireEvent.click(forceButtonIn('SARL GINA'));
    await waitFor(() => expect(badgeIn('SARL GINA')).toMatch(/Paid/));
    expect(badgeIn('READY SHOP')).toMatch(/Ready/);
    expect(badgeIn('AWAITING SHOP')).toMatch(/Awaiting/);
    expect(badgeIn('CANCELLED SHOP')).toMatch(/Cancelled/);
  });

  test('refreshes the commissions without reloading the page', async () => {
    await renderPage();
    const documentsBefore = calls.filter((c) => c.url.startsWith('/api/documents')).length;
    fireEvent.click(forceButtonIn('SARL GINA'));
    await waitFor(() =>
      expect(calls.filter((c) => c.url.startsWith('/api/commissions?')).length).toBeGreaterThan(1),
    );
    expect(calls.filter((c) => c.url.startsWith('/api/documents')).length).toBe(documentsBefore);
  });

  test('a double click sends one request', async () => {
    await renderPage();
    const btn = forceButtonIn('SARL GINA');
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(forceCalls()).toHaveLength(1));
  });
});

describe('when the server refuses', () => {
  test('the reason is shown without wiping the table', async () => {
    patchResponse = { ok: false, body: { error: 'This commission is already paid out.' } };
    await renderPage();
    fireEvent.click(forceButtonIn('SARL GINA'));
    expect(await screen.findByText(/already paid out/i)).toBeInTheDocument();
    expect(screen.getByText('READY SHOP')).toBeInTheDocument();
    expect(badgeIn('SARL GINA')).toMatch(/Reported/);
  });

  test('the message can be dismissed', async () => {
    patchResponse = { ok: false, body: { error: 'This commission is already paid out.' } };
    await renderPage();
    fireEvent.click(forceButtonIn('SARL GINA'));
    const alert = await screen.findByRole('alert');
    fireEvent.click(within(alert).getByRole('button', { name: /dismiss/i }));
    await waitFor(() => expect(screen.queryByText(/already paid out/i)).toBeNull());
  });
});
