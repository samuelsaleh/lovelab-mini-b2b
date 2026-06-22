/**
 * @jest-environment node
 *
 * PATCH /api/documents/[id] — sample → b2b promotion
 */

const mockUpdate = jest.fn().mockReturnThis();
const mockSelect = jest.fn().mockReturnThis();
const mockEq = jest.fn().mockReturnThis();
const mockSingle = jest.fn();

const mockAdminSupabase = {
  from: jest.fn(() => ({
    select: mockSelect,
    update: mockUpdate,
    eq: mockEq,
    single: mockSingle,
  })),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

jest.mock('@/app/api/_lib/access', () => ({
  getUserContext: jest.fn().mockResolvedValue({ user: { id: 'agent-1', email: 'a@test.com' }, isAdmin: false }),
  isUserOwnerOrSameEmail: jest.fn().mockResolvedValue(true),
  requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
}));

jest.mock('@/lib/commissionAttribution', () => ({
  resolveCommissionAgent: jest.fn().mockResolvedValue({ agentId: 'agent-1', profile: { id: 'agent-1' } }),
  upsertCommissionForDocument: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/newClientBonus', () => ({
  maybeCreateBonusForOrder: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/healthEvent', () => ({ recordHealthEvent: jest.fn() }));

jest.mock('@/lib/email', () => ({
  getSenderFrom: jest.fn(() => 'test@test.com'),
  getOrderNotificationRecipients: jest.fn(() => ['admin@test.com']),
}));

jest.mock('@/lib/email-templates', () => ({
  orderNotificationEmail: jest.fn(() => ({ subject: 'New order', html: '<p>hi</p>' })),
}));

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({}) },
  })),
}));

const { PATCH } = require('../documents/[id]/route');
const { upsertCommissionForDocument } = require('@/lib/commissionAttribution');

const DOC_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const EVENT_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

function makePatchRequest(body) {
  return new global.Request(`http://localhost/api/documents/${DOC_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const sampleDoc = {
  id: DOC_ID,
  created_by: 'agent-1',
  event_id: null,
  metadata: { is_sample: true, formState: {} },
  order_channel: 'sample',
  status: 'sent',
  document_type: 'order',
  client_name: 'Test',
  client_company: 'Co',
  total_amount: 500,
  file_name: 'sample.pdf',
};

const promotedDoc = {
  id: DOC_ID,
  created_by: 'agent-1',
  event_id: EVENT_ID,
  metadata: { is_sample: false, promoted_at: '2026-06-22T00:00:00.000Z' },
  order_channel: 'b2b',
  status: 'sent',
  document_type: 'order',
  client_name: 'Test',
  client_company: 'Co',
  total_amount: 500,
  file_name: 'sample.pdf',
};

let singleCallCount = 0;

beforeEach(() => {
  jest.clearAllMocks();
  singleCallCount = 0;
  const access = require('@/app/api/_lib/access');
  access.getUserContext.mockResolvedValue({ user: { id: 'agent-1', email: 'a@test.com' }, isAdmin: false });
  access.isUserOwnerOrSameEmail.mockResolvedValue(true);
  access.requireEventPermission.mockResolvedValue({ allowed: true });
  mockSelect.mockReturnThis();
  mockUpdate.mockReturnThis();
  mockEq.mockReturnThis();
  mockSingle.mockImplementation(() => {
    singleCallCount += 1;
    if (singleCallCount === 1) {
      return Promise.resolve({ data: sampleDoc, error: null });
    }
    return Promise.resolve({ data: promotedDoc, error: null });
  });
});

describe('PATCH /api/documents/[id] sample promotion', () => {
  test('requires event_id when promoting sample to b2b', async () => {
    const res = await PATCH(makePatchRequest({ order_channel: 'b2b' }), { params: Promise.resolve({ id: DOC_ID }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/event_id/i);
  });

  test('promotes sample to b2b and creates commission', async () => {
    const res = await PATCH(
      makePatchRequest({ order_channel: 'b2b', event_id: EVENT_ID, metadata: { is_sample: false } }),
      { params: Promise.resolve({ id: DOC_ID }) },
    );
    expect(res.status).toBe(200);
    expect(upsertCommissionForDocument).toHaveBeenCalled();
    const data = await res.json();
    expect(data.document.order_channel).toBe('b2b');
  });
});
