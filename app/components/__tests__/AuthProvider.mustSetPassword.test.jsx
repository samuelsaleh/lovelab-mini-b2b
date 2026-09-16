/**
 * @jest-environment jsdom
 *
 * The "choose your own password" redirect, for employees invited with a
 * temporary password. They are marked on the auth user
 * (user_metadata.must_set_password) because has_password_set is false on
 * every Google-created profile too — Sam's included — and those must never
 * be sent to /set-password.
 */
import { render, waitFor } from '@testing-library/react';

const replace = jest.fn();
let pathname = '/admin';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => pathname,
}));
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }), signOut: jest.fn() },
  }),
}));

import { AuthProvider } from '../AuthProvider';

function serve(user, profile) {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ user, profile }) }));
}

beforeEach(() => { jest.clearAllMocks(); pathname = '/admin'; });
afterEach(() => { delete global.fetch; });

const settle = () => new Promise((r) => setTimeout(r, 30));

test('an invited employee on a temporary password is sent to /set-password', async () => {
  serve({ id: 'emp', user_metadata: { must_set_password: true } }, { id: 'emp', role: 'admin', has_password_set: false });
  render(<AuthProvider><div /></AuthProvider>);
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/set-password?next=%2Fadmin'));
});

test('an admin who always signed in with Google is left alone', async () => {
  serve({ id: 'sam', user_metadata: { full_name: 'Sam' } }, { id: 'sam', role: 'admin', has_password_set: false });
  render(<AuthProvider><div /></AuthProvider>);
  await settle();
  expect(replace).not.toHaveBeenCalled();
});

test('once the password is chosen, the mark no longer matters', async () => {
  serve({ id: 'emp', user_metadata: { must_set_password: true } }, { id: 'emp', role: 'admin', has_password_set: true });
  render(<AuthProvider><div /></AuthProvider>);
  await settle();
  expect(replace).not.toHaveBeenCalled();
});

test('agents still get the redirect without any mark, and never on /set-password itself', async () => {
  serve({ id: 'a', user_metadata: {} }, { id: 'a', is_agent: true, has_password_set: false });
  render(<AuthProvider><div /></AuthProvider>);
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/set-password?next=%2Fadmin'));

  replace.mockClear();
  pathname = '/set-password';
  serve({ id: 'emp', user_metadata: { must_set_password: true } }, { id: 'emp', role: 'admin', has_password_set: false });
  render(<AuthProvider><div /></AuthProvider>);
  await settle();
  expect(replace).not.toHaveBeenCalled();
});

// Sam, 15 Sep 2026: an admin can also be a commercial (is_agent). That must
// not turn the agent rule on for them — they sign in with Google.
test('an admin who is also a commercial is left alone without the mark', async () => {
  serve({ id: 'raphael', user_metadata: { full_name: 'Raphael' } }, { id: 'raphael', role: 'admin', is_agent: true, agent_status: 'active', has_password_set: false });
  render(<AuthProvider><div /></AuthProvider>);
  await settle();
  expect(replace).not.toHaveBeenCalled();
});

test('an invited employee who is also a commercial is still asked, because of the mark', async () => {
  serve({ id: 'new', user_metadata: { must_set_password: true } }, { id: 'new', role: 'admin', is_agent: true, has_password_set: false });
  render(<AuthProvider><div /></AuthProvider>);
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/set-password?next=%2Fadmin'));
});
