/**
 * @jest-environment jsdom
 *
 * Login page contracts that matter for the onboarding overhaul:
 *  (a) Failed password sign-in renders an actual <a href="/forgot-password"> anchor
 *  (b) Failed magic-link sign-in renders an actual <a href="/request-access"> anchor
 *  (c) The secondary "Don't have access yet? Request access" link is always rendered
 *  (d) Magic Link tab posts to /api/magic-link (not signInWithOtp directly), so
 *      the email comes from our LoveLab-branded route
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockSignInWithPassword = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockSignInWithOtp = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: (...args) => mockSignInWithPassword(...args),
      signInWithOAuth: (...args) => mockSignInWithOAuth(...args),
      signInWithOtp: (...args) => mockSignInWithOtp(...args),
    },
  }),
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockPush }),
  useSearchParams: () => ({ get: () => null }),
}));

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
}));

const originalFetch = global.fetch;

import LoginPage from '../login/page';

beforeEach(() => {
  jest.clearAllMocks();
  mockSignInWithPassword.mockResolvedValue({ data: null, error: null });
  mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://google.test/redirect' }, error: null });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('Login page — UI contracts', () => {
  it('(c) renders the secondary "Don\'t have access yet? Request access" link', () => {
    render(<LoginPage />);
    const link = screen.getByRole('link', { name: /request access/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/request-access');
  });

  it('renders the three login mode tabs', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: 'Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Magic Link' })).toBeInTheDocument();
  });

  it('renders "Forgot password?" link only on the Password tab', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    // Default Google tab — no Forgot Password link
    expect(screen.queryByRole('link', { name: /forgot password/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Password' }));
    const forgot = screen.getByRole('link', { name: /forgot password/i });
    expect(forgot).toHaveAttribute('href', '/forgot-password');
  });
});

describe('Login page — error states with anchors', () => {
  it('(a) failed password sign-in renders <a href="/forgot-password"> Reset password', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ data: null, error: { message: 'Invalid creds' } });
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Password' }));
    await user.type(screen.getByPlaceholderText(/email address/i), 'foo@bar.com');
    await user.type(screen.getByPlaceholderText(/^password$/i), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const banner = await screen.findByTestId('login-error-with-link');
    expect(banner).toHaveTextContent(/wrong email or password/i);
    const resetLink = banner.querySelector('a[href="/forgot-password"]');
    expect(resetLink).not.toBeNull();
    expect(resetLink).toHaveTextContent(/reset password/i);
  });

  it('(b) network error on magic-link renders <a href="/request-access"> Request access', async () => {
    global.fetch.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Magic Link' }));
    await user.type(screen.getByPlaceholderText(/your email address/i), 'foo@bar.com');
    await user.click(screen.getByRole('button', { name: /send magic link/i }));

    const banner = await screen.findByTestId('login-error-with-link');
    const requestLink = banner.querySelector('a[href="/request-access"]');
    expect(requestLink).not.toBeNull();
    expect(requestLink).toHaveTextContent(/request access/i);
  });

  it('429 from /api/magic-link surfaces a "too many attempts" message', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Magic Link' }));
    await user.type(screen.getByPlaceholderText(/your email address/i), 'foo@bar.com');
    await user.click(screen.getByRole('button', { name: /send magic link/i }));
    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
  });
});

describe('Login page — Magic Link routes through LoveLab API', () => {
  it('(d) posts to /api/magic-link instead of calling supabase.auth.signInWithOtp', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Magic Link' }));
    await user.type(screen.getByPlaceholderText(/your email address/i), 'agent@example.com');
    await user.click(screen.getByRole('button', { name: /send magic link/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/magic-link',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'agent@example.com' }),
        }),
      ),
    );
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('shows a generic success message after a successful submit (no enumeration leak)', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Magic Link' }));
    await user.type(screen.getByPlaceholderText(/your email address/i), 'agent@example.com');
    await user.click(screen.getByRole('button', { name: /send magic link/i }));
    // The generic message is rendered both in the top success banner and in
    // the magic-link success card with the 📬 emoji — both are intentional.
    const matches = await screen.findAllByText(/if your email is registered/i);
    expect(matches.length).toBeGreaterThan(0);
  });
});
