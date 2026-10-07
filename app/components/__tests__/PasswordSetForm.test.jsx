/**
 * @jest-environment jsdom
 *
 * Shared form used by /set-password and /reset-password. Confirms:
 *   - Renders the supplied headline/subtext/submitLabel
 *   - Validates length and confirmation match before calling Supabase
 *   - Sends the password to PATCH /api/me/password-set when markPasswordSet=true
 *   - Calls onSuccess on success, surfaces server errors to the UI
 *   - markPasswordSet=false updates Supabase directly and skips the PATCH call
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockUpdateUser = jest.fn();
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { updateUser: (...args) => mockUpdateUser(...args) },
  }),
}));

const originalFetch = global.fetch;

import PasswordSetForm from '../PasswordSetForm';

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('PasswordSetForm', () => {
  it('renders supplied copy', () => {
    render(
      <PasswordSetForm
        headline="My headline"
        subtext="My subtext"
        submitLabel="Save it"
      />,
    );
    expect(screen.getByText('My headline')).toBeInTheDocument();
    expect(screen.getByText('My subtext')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save it' })).toBeInTheDocument();
  });

  it('rejects passwords shorter than 8 characters', async () => {
    const onSuccess = jest.fn();
    const user = userEvent.setup();
    render(<PasswordSetForm onSuccess={onSuccess} />);
    await user.type(screen.getByPlaceholderText(/at least 8/i), 'short');
    await user.type(screen.getByPlaceholderText(/repeat/i), 'short');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('rejects mismatched confirmation', async () => {
    const user = userEvent.setup();
    render(<PasswordSetForm />);
    await user.type(screen.getByPlaceholderText(/at least 8/i), 'longenoughpw');
    await user.type(screen.getByPlaceholderText(/repeat/i), 'differentpw1');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('sends the password to the trusted route before onSuccess on happy path', async () => {
    const onSuccess = jest.fn();
    const user = userEvent.setup();
    render(<PasswordSetForm onSuccess={onSuccess} />);
    await user.type(screen.getByPlaceholderText(/at least 8/i), 'newgoodpw1!');
    await user.type(screen.getByPlaceholderText(/repeat/i), 'newgoodpw1!');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/me/password-set',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: 'newgoodpw1!' }),
        }),
      ),
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('updates Supabase directly and skips the PATCH call when markPasswordSet=false', async () => {
    const onSuccess = jest.fn();
    const user = userEvent.setup();
    render(<PasswordSetForm onSuccess={onSuccess} markPasswordSet={false} />);
    await user.type(screen.getByPlaceholderText(/at least 8/i), 'newgoodpw1!');
    await user.type(screen.getByPlaceholderText(/repeat/i), 'newgoodpw1!');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalled());
    expect(global.fetch).not.toHaveBeenCalled();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('surfaces trusted route errors and does not call onSuccess', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid token' }),
    });
    const onSuccess = jest.fn();
    const user = userEvent.setup();
    render(<PasswordSetForm onSuccess={onSuccess} />);
    await user.type(screen.getByPlaceholderText(/at least 8/i), 'newgoodpw1!');
    await user.type(screen.getByPlaceholderText(/repeat/i), 'newgoodpw1!');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/invalid token/i)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('surfaces Supabase errors when markPasswordSet=false', async () => {
    mockUpdateUser.mockResolvedValueOnce({ data: null, error: { message: 'Invalid token' } });
    const onSuccess = jest.fn();
    const user = userEvent.setup();
    render(<PasswordSetForm onSuccess={onSuccess} markPasswordSet={false} />);
    await user.type(screen.getByPlaceholderText(/at least 8/i), 'newgoodpw1!');
    await user.type(screen.getByPlaceholderText(/repeat/i), 'newgoodpw1!');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/invalid token/i)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
