/**
 * @jest-environment node
 *
 * GET + POST /api/consignment-contacts — unit tests
 *
 * Covers:
 *   - GET returns 401 for unauthenticated users
 *   - GET returns 403 for non-admin users
 *   - GET returns contacts array for admins
 *   - POST returns 401 for unauthenticated users
 *   - POST returns 403 for non-admin users
 *   - POST returns 400 when full_name is missing
 *   - POST creates and returns contact for admins
 */

const mockContact = { id: 'contact-1', full_name: 'Jane Doe', company: 'Acme', phone: null, email: null, address: null, notes: null };

const mockQuery = {
  select: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: mockContact, error: null }),
};
mockQuery.then = (cb) => Promise.resolve(cb({ data: [mockContact], error: null }));

const mockAdminSupabase = { from: jest.fn(() => mockQuery) };

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

const mockGetUserContext = jest.fn();
jest.mock('@/app/api/_lib/access', () => ({
  getUserContext: (...args) => mockGetUserContext(...args),
}));

const { GET, POST } = require('../consignment-contacts/route');

function makeRequest(body = null) {
  return {
    url: 'http://localhost/api/consignment-contacts',
    json: body ? jest.fn().mockResolvedValue(body) : undefined,
  };
}

describe('GET /api/consignment-contacts', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetUserContext.mockResolvedValueOnce({ user: null, isAdmin: false });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    mockGetUserContext.mockResolvedValueOnce({ user: { id: 'agent-1' }, isAdmin: false });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns contacts array for admin', async () => {
    mockGetUserContext.mockResolvedValueOnce({ user: { id: 'admin-1' }, isAdmin: true });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.contacts)).toBe(true);
  });
});

describe('POST /api/consignment-contacts', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetUserContext.mockResolvedValueOnce({ user: null, isAdmin: false });
    const res = await POST(makeRequest({ full_name: 'Jane' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    mockGetUserContext.mockResolvedValueOnce({ user: { id: 'agent-1' }, isAdmin: false });
    const res = await POST(makeRequest({ full_name: 'Jane' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when full_name is missing', async () => {
    mockGetUserContext.mockResolvedValueOnce({ user: { id: 'admin-1' }, isAdmin: true });
    const res = await POST(makeRequest({ company: 'Acme' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/full_name/i);
  });

  it('creates and returns contact for admin', async () => {
    mockGetUserContext.mockResolvedValueOnce({ user: { id: 'admin-1' }, isAdmin: true });
    const res = await POST(makeRequest({ full_name: 'Jane Doe', company: 'Acme' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.contact).toBeDefined();
    expect(body.contact.full_name).toBe('Jane Doe');
  });
});
