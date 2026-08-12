/**
 * NewClientBonusModal — three modes.
 *
 * The dangerous button here is "Automatic": it backfills the agent's
 * whole history in one click. So the modal must default to what the
 * agent already is, must warn before switching to automatic, and must
 * never preview or promise a backfill in the other two modes.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import NewClientBonusModal from '../NewClientBonusModal';

const AGENT = {
  id: 'agent-1',
  full_name: 'Nicolas Wholesale France',
  new_client_bonus_mode: 'manual',
  new_client_bonus_enabled: true,
  new_client_bonus_amount: 200,
};

let patchBodies = [];
let previewResponse = { rows: [], customer_count: 0, total: 0 };

beforeEach(() => {
  patchBodies = [];
  previewResponse = {
    rows: [
      { document_id: 'd1', customer: 'ACME JEWELS', first_order_date: '2026-05-01T10:00:00Z' },
      { document_id: 'd2', customer: 'BIJOUX LYON', first_order_date: '2026-06-01T10:00:00Z' },
    ],
    customer_count: 2,
    total: 400,
  };
  global.fetch = jest.fn((url, opts) => {
    const href = String(url);
    if (href.includes('/preview')) {
      return Promise.resolve({ ok: true, json: async () => previewResponse });
    }
    patchBodies.push(JSON.parse(opts.body));
    return Promise.resolve({ ok: true, json: async () => ({ agent: {}, backfill: { created: 0 } }) });
  });
});

const modeButton = (name) => screen.getByRole('radio', { name });
const submit = () => screen.getByRole('button', { name: /save|confirm|turn bonus off/i });

const renderModal = (agent = AGENT, props = {}) =>
  render(<NewClientBonusModal agent={agent} onClose={jest.fn()} onSuccess={jest.fn()} {...props} />);

describe('opening state', () => {
  test('starts on the mode the agent already has', () => {
    renderModal();
    expect(modeButton('I decide')).toHaveAttribute('aria-checked', 'true');
    expect(modeButton('Automatic')).toHaveAttribute('aria-checked', 'false');
  });

  test('an agent with only the old boolean opens on Automatic', () => {
    renderModal({ id: 'a', new_client_bonus_enabled: true, new_client_bonus_amount: 200 });
    expect(modeButton('Automatic')).toHaveAttribute('aria-checked', 'true');
  });

  test('an agent with the bonus switched off opens on Off', () => {
    renderModal({ id: 'a', new_client_bonus_enabled: false });
    expect(modeButton('Off')).toHaveAttribute('aria-checked', 'true');
  });

  test('the amount defaults to 200 when none is set', () => {
    renderModal({ id: 'a', new_client_bonus_enabled: false });
    expect(screen.getByPlaceholderText('200.00')).toHaveValue(200);
  });

  test('saving is disabled until something changes', () => {
    renderModal();
    expect(submit()).toBeDisabled();
  });
});

describe('the manual mode creates nothing', () => {
  test('no backfill preview is shown or fetched', async () => {
    renderModal();
    expect(screen.queryByText(/retroactive backfill preview/i)).toBeNull();
    await waitFor(() => {
      expect(global.fetch.mock.calls.filter(([u]) => String(u).includes('/preview'))).toHaveLength(0);
    });
  });

  test('no warning about paying retroactively', () => {
    renderModal();
    expect(screen.queryByRole('note')).toBeNull();
  });

  test('explains that the admin decides per order', () => {
    renderModal();
    expect(screen.getByText(/each new client gets a button/i)).toBeInTheDocument();
  });

  test('switching from automatic to manual sends mode manual', async () => {
    renderModal({ ...AGENT, new_client_bonus_mode: 'auto' });
    fireEvent.click(modeButton('I decide'));
    fireEvent.click(submit());
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toEqual({ mode: 'manual', amount: 200 });
  });
});

describe('the automatic mode warns before it backfills', () => {
  test('switching to automatic shows the retroactive warning', () => {
    renderModal();
    fireEvent.click(modeButton('Automatic'));
    expect(screen.getByRole('note')).toHaveTextContent(/pays retroactively/i);
  });

  test('the preview loads and totals the damage', async () => {
    renderModal();
    fireEvent.click(modeButton('Automatic'));
    expect(await screen.findByText(/2 bonuses/i)).toBeInTheDocument();
    expect(screen.getByText('ACME JEWELS')).toBeInTheDocument();
    await waitFor(() => expect(submit()).toHaveTextContent(/confirm/i));
  });

  test('an agent already on automatic sees no warning, only the preview', async () => {
    renderModal({ ...AGENT, new_client_bonus_mode: 'auto' });
    expect(screen.queryByRole('note')).toBeNull();
    expect(await screen.findByText(/2 bonuses/i)).toBeInTheDocument();
  });

  test('sends mode auto', async () => {
    renderModal();
    fireEvent.click(modeButton('Automatic'));
    fireEvent.click(submit());
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toEqual({ mode: 'auto', amount: 200 });
  });
});

describe('switching off', () => {
  test('sends mode off and keeps the amount for later', async () => {
    renderModal();
    fireEvent.click(modeButton('Off'));
    expect(submit()).toHaveTextContent(/turn bonus off/i);
    fireEvent.click(submit());
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toEqual({ mode: 'off', amount: 200 });
  });

  test('no preview is fetched when switching off', async () => {
    renderModal({ ...AGENT, new_client_bonus_mode: 'auto' });
    fireEvent.click(modeButton('Off'));
    await waitFor(() => expect(screen.queryByText(/retroactive backfill preview/i)).toBeNull());
  });
});

describe('validation and failure', () => {
  test('a zero amount blocks saving in manual mode too', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('200.00'), { target: { value: '0' } });
    expect(screen.getByText(/must be greater than 0/i)).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  test('a server error is surfaced instead of a silent close', async () => {
    global.fetch = jest.fn((url) =>
      String(url).includes('/preview')
        ? Promise.resolve({ ok: true, json: async () => previewResponse })
        : Promise.resolve({ ok: false, json: async () => ({ error: 'Agent not found' }) }),
    );
    const onSuccess = jest.fn();
    renderModal(AGENT, { onSuccess });
    fireEvent.click(modeButton('Off'));
    fireEvent.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('Agent not found');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('a successful save reports back to the page', async () => {
    const onSuccess = jest.fn();
    renderModal(AGENT, { onSuccess });
    fireEvent.click(modeButton('Off'));
    fireEvent.click(submit());
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});
