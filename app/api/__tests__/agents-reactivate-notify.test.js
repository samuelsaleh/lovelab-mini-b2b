/**
 * @jest-environment node
 *
 * PUT /api/agents/[id] — reactivation email (Sam, 21 Oct 2026).
 *
 * Reactivating a paused agent from the agent page sends `notify: true`; the
 * agent then gets "your access has been restored" with a sign-in link.
 *
 * Covers:
 *   ✓ paused → active with notify: email sent to the agent, notified: true
 *   ✓ the sign-in link is a magic link when Supabase can make one
 *   ✓ without notify: status changes, no email
 *   ✓ already active → active with notify: no email (nothing was restored)
 *   ✓ pausing never emails
 *   ✓ an email failure does not fail the reactivation (notified: false)
 */

let existingStatus = 'paused';
let updatedRow = null;
let sendEmailResult = { sent: true };

const mockSendEmail = jest.fn(async () => sendEmailResult);
jest.mock('@/lib/send-email', () => ({ sendEmail: (...args) => mockSendEmail(...args) }));

const mockGenerateLink = jest.fn(async () => ({ data: { properties: { action_link: 'https://auth.example/magic?token=abc' } } }));

const mockAdminSupabase = {
  auth: { admin: { generateLink: (...args) => mockGenerateLink(...args) } },
  from: jest.fn((table) => {
    if (table === 'profiles') {
      const q = { _update: null };
      q.select = jest.fn(() => q);
      q.eq = jest.fn(() => q);
      q.update = jest.fn((payload) => { q._update = payload; return q; });
      q.single = jest.fn(async () => {
        if (q._update) {
          updatedRow = { id: 'agent-1', email: 'm.schlund@example.com', full_name: 'Marc Schlund', ...q._update };
          return { data: updatedRow, error: null };
        }
        return { data: { id: 'agent-1', is_agent: true, agent_status: existingStatus }, error: null };
      });
      return q;
    }
    throw new Error('unexpected table: ' + table);
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({})),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));
jest.mock('@/lib/organizations/authz', () => ({
  requireSession: jest.fn(async () => ({ user: { id: 'admin-user' }, profile: { role: 'admin' } })),
  isAdmin: jest.fn(() => true),
}));
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/organizations/provision-agent', () => ({ provisionAgentInOrg: jest.fn() }));
jest.mock('@/lib/agents/access', () => ({ grantAccess: jest.fn(), revokeAccess: jest.fn() }));
jest.mock('@/lib/healthEvent', () => ({ recordHealthEvent: jest.fn() }));
jest.mock('@/lib/commissionRecalc', () => ({ recalcUnpaidCommissionsForAgent: jest.fn() }));

const { PUT } = require('../agents/[id]/route');

const call = (body) => PUT(
  new global.Request('http://localhost/api/agents/agent-1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
  { params: { id: 'agent-1' } },
);

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  existingStatus = 'paused';
  updatedRow = null;
  sendEmailResult = { sent: true };
  mockSendEmail.mockClear();
  mockGenerateLink.mockClear();
  process.env.RESEND_API_KEY = 're_test';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://app.example';
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

test('paused → active with notify emails the agent a sign-in link', async () => {
  const res = await call({ agent_status: 'active', notify: true });
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(body.agent.agent_status).toBe('active');
  expect(body.notified).toBe(true);
  expect(mockGenerateLink).toHaveBeenCalledWith(expect.objectContaining({
    type: 'magiclink',
    email: 'm.schlund@example.com',
    options: { redirectTo: 'https://app.example/auth/callback' },
  }));
  expect(mockSendEmail).toHaveBeenCalledTimes(1);
  const mail = mockSendEmail.mock.calls[0][0];
  expect(mail.to).toBe('m.schlund@example.com');
  expect(mail.subject).toMatch(/Marc Schlund, your LoveLab access has been restored/);
  expect(mail.html).toContain('https://auth.example/magic?token=abc');
});

test('without notify the status changes and nobody is emailed', async () => {
  const res = await call({ agent_status: 'active' });
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.notified).toBe(false);
  expect(mockSendEmail).not.toHaveBeenCalled();
});

test('an agent already active is not emailed again', async () => {
  existingStatus = 'active';
  const body = await (await call({ agent_status: 'active', notify: true })).json();
  expect(body.notified).toBe(false);
  expect(mockSendEmail).not.toHaveBeenCalled();
});

test('pausing never emails', async () => {
  existingStatus = 'active';
  const body = await (await call({ agent_status: 'paused', notify: true })).json();
  expect(body.agent.agent_status).toBe('paused');
  expect(mockSendEmail).not.toHaveBeenCalled();
});

test('an email failure does not fail the reactivation', async () => {
  sendEmailResult = { sent: false, reason: 'resend_error' };
  const res = await call({ agent_status: 'active', notify: true });
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.agent.agent_status).toBe('active');
  expect(body.notified).toBe(false);
});
