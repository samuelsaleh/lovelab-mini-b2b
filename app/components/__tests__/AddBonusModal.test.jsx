/**
 * AddBonusModal — unit tests (Phase 19a)
 *
 * Locks the modal's contract:
 *   - Renders the agent's name in the title (used from both the agents list
 *     and the agent details page).
 *   - Submit POSTs `{ agent_id, amount, notes }` to /api/commissions.
 *   - Calls onSuccess when the API returns 200 OK.
 *   - Surfaces a non-OK response as an inline error and keeps the modal open.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AddBonusModal from '../AddBonusModal';

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

describe('AddBonusModal', () => {
  const agent = { id: 'agent-1', full_name: 'Marc Schlund', email: 'marc@example.com' };

  beforeEach(() => {
    global.fetch = jest.fn();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders with the agent name in the title', () => {
    render(<AddBonusModal agent={agent} onClose={jest.fn()} onSuccess={jest.fn()} />);
    expect(screen.getByText(/Add Bonus — Marc Schlund/)).toBeInTheDocument();
  });

  it('falls back to email when full_name is missing', () => {
    render(
      <AddBonusModal
        agent={{ id: 'a2', email: 'noname@example.com' }}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    expect(screen.getByText(/Add Bonus — noname@example.com/)).toBeInTheDocument();
  });

  it('submits POST /api/commissions with agent_id, amount, notes and calls onSuccess', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ commission: { id: 'c1' } }),
    });
    const onSuccess = jest.fn();
    render(<AddBonusModal agent={agent} onClose={jest.fn()} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
    fireEvent.change(screen.getByPlaceholderText('Optional'), {
      target: { value: 'Q1 push' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add Bonus/i }));
      await flushPromises();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/commissions');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({
      agent_id: 'agent-1',
      amount: 100,
      notes: 'Q1 push',
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('surfaces a server error and does not call onSuccess', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Database exploded' }),
    });
    const onSuccess = jest.fn();
    render(<AddBonusModal agent={agent} onClose={jest.fn()} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '50' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add Bonus/i }));
      await flushPromises();
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Database exploded');
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('rejects non-positive amounts client-side without hitting the API', async () => {
    render(<AddBonusModal agent={agent} onClose={jest.fn()} onSuccess={jest.fn()} />);
    // Bypass the native min validation by submitting via the form button.
    // We assert no network call occurred for amount = 0.
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Bonus/i }));
    await flushPromises();
    // HTML5 min=0.01 prevents the form from submitting; fetch must not fire.
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
