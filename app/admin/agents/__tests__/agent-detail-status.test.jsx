/**
 * Admin agent detail — pause / reactivate platform access (Sam, 21 Oct 2026).
 *
 * Marc Schlund was paused and had to be let back in. Paused and inactive
 * agents are refused at sign-in (lib/auth/isUserAllowed), so the page offers
 * "Reactivate" next to the status badge; an active agent gets "Pause access".
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

let agentRow;
let calls = [];
let putOk = true;

const json = (body, ok = true) => Promise.resolve({ ok, json: async () => body });

function installFetch() {
  calls = [];
  global.fetch = jest.fn((url, opts) => {
    const href = String(url);
    const method = opts?.method || 'GET';
    calls.push({ url: href, method, body: opts?.body ? JSON.parse(opts.body) : null });
    if (href === '/api/agents/agent-1' && method === 'PUT') {
      if (!putOk) return json({ error: 'Failed to update agent' }, false);
      const body = JSON.parse(opts.body);
      const { notify, ...fields } = body;
      agentRow = { ...agentRow, ...fields };
      return json({ agent: agentRow, notified: notify === true });
    }
    if (href.startsWith('/api/agents')) return json({ agents: [agentRow] });
    if (href.startsWith('/api/commissions?')) return json({ commissions: [], summary: {} });
    if (href.startsWith('/api/agent-payments')) return json({ payments: [] });
    if (href.startsWith('/api/commission-reports')) return json({ reports: [] });
    if (href.startsWith('/api/documents')) return json({ documents: [] });
    return json({});
  });
}

beforeEach(() => {
  putOk = true;
  agentRow = {
    id: 'agent-1',
    full_name: 'Marc Schlund',
    email: 'm.schlund@example.com',
    commission_rate: 15,
    organization_id: null,
    is_agent: true,
    agent_status: 'paused',
    new_client_bonus_mode: 'off',
    new_client_bonus_amount: 0,
  };
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  installFetch();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const putCalls = () => calls.filter((c) => c.method === 'PUT');

test('a paused agent can be reactivated from the page', async () => {
  render(<AdminAgentDetailsPage />);
  const button = await screen.findByTestId('agent-reactivate');
  expect(screen.getByTestId('agent-status-badge')).toHaveTextContent('paused');
  expect(screen.queryByTestId('agent-pause')).not.toBeInTheDocument();

  fireEvent.click(button);

  await waitFor(() => expect(screen.getByTestId('agent-status-badge')).toHaveTextContent('active'));
  // Reactivating asks the server to email the agent a sign-in link.
  expect(putCalls()).toEqual([{ url: '/api/agents/agent-1', method: 'PUT', body: { agent_status: 'active', notify: true } }]);
  expect(screen.getByTestId('agent-status-message')).toHaveTextContent(
    'Marc Schlund is active again and can sign in. An email with a sign-in link went to m.schlund@example.com.',
  );
  // The button flips to the opposite action.
  expect(screen.getByTestId('agent-pause')).toBeInTheDocument();
  expect(screen.queryByTestId('agent-reactivate')).not.toBeInTheDocument();
});

test('an active agent can be paused', async () => {
  agentRow.agent_status = 'active';
  render(<AdminAgentDetailsPage />);
  fireEvent.click(await screen.findByTestId('agent-pause'));

  await waitFor(() => expect(screen.getByTestId('agent-status-badge')).toHaveTextContent('paused'));
  expect(putCalls()[0].body).toEqual({ agent_status: 'paused' });
});

test('nothing is sent when the confirmation is declined', async () => {
  window.confirm.mockReturnValue(false);
  render(<AdminAgentDetailsPage />);
  fireEvent.click(await screen.findByTestId('agent-reactivate'));
  expect(putCalls()).toHaveLength(0);
  expect(screen.getByTestId('agent-status-badge')).toHaveTextContent('paused');
});

test('a server error is shown and the status stays', async () => {
  putOk = false;
  render(<AdminAgentDetailsPage />);
  fireEvent.click(await screen.findByTestId('agent-reactivate'));
  await waitFor(() => expect(screen.getByTestId('agent-status-message')).toHaveTextContent('Failed to update agent'));
  expect(screen.getByTestId('agent-status-badge')).toHaveTextContent('paused');
});
