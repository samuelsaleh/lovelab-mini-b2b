/**
 * @jest-environment node
 *
 * GET/POST /api/clients — unit tests
 *
 * Guarantees:
 *   - The client directory is shared: agents (non-admins) see ALL clients,
 *     not just the ones they created. No created_by filter is applied.
 *   - Search filters are still applied on top of the shared directory.
 *   - The non-admin result set is capped at 2000 (same as admins) so large
 *     shared directories are actually browsable.
 *   - POST update is a SHARED directory: a non-admin can edit ANY client
 *     (no created_by filter), so an agent can keep an office-created client
 *     up to date. created_by is never part of the update filter.
 *   - POST update of a missing id returns 404.
 *   - Contact columns (name/email/phone) are guarded: an update reads the
 *     stored row first and only replaces a filled contact detail when the
 *     caller confirms, so a browser autofill cannot rewrite them silently.
 */

// ── Mock Supabase query chain ────────────────────────────────────────────────

const mockQuery = {
  select: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  limit: jest.fn(),
  maybeSingle: jest.fn(),
  single: jest.fn(),
}

const mockAdminSupabase = {
  from: jest.fn(() => mockQuery),
}

// Regular (RLS) client used for auth.getUser + profile role lookup + insert.
let mockUser = { id: 'agent-1' }
let mockRole = 'member'

const mockRegularSupabase = {
  auth: {
    getUser: jest.fn(async () => ({ data: { user: mockUser } })),
  },
  from: jest.fn(() => mockQuery),
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue(mockRegularSupabase),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}))

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }))

const { GET, POST } = require('../clients/route')

function makeGet(params = {}) {
  const url = new URL('http://localhost/api/clients')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new global.Request(url.toString())
}

function makePost(body) {
  return new global.Request('http://localhost/api/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { id: 'agent-1' }
  mockRole = 'member'

  // Re-attach chainable methods.
  ;['select', 'order', 'eq', 'in', 'or', 'ilike', 'update', 'insert'].forEach((k) => {
    mockQuery[k].mockReturnValue(mockQuery)
  })

  // profiles role lookup resolves to the current role; everything else default.
  mockRegularSupabase.from.mockImplementation((table) => {
    if (table === 'profiles') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { role: mockRole } }) }) }),
      }
    }
    return mockQuery
  })
  mockAdminSupabase.from.mockReturnValue(mockQuery)

  mockQuery.limit.mockResolvedValue({ data: [], error: null })
  mockQuery.maybeSingle.mockResolvedValue({ data: null, error: null })
  mockQuery.single.mockResolvedValue({ data: null, error: null })
})

describe('GET /api/clients — shared directory', () => {
  test('non-admin (agent): does NOT filter by created_by', async () => {
    mockRole = 'member'
    await GET(makeGet())
    // No ownership filter should ever be applied.
    expect(mockQuery.eq).not.toHaveBeenCalledWith('created_by', expect.anything())
    expect(mockQuery.in).not.toHaveBeenCalledWith('created_by', expect.anything())
  })

  test('admin: also does NOT filter by created_by', async () => {
    mockRole = 'admin'
    await GET(makeGet())
    expect(mockQuery.eq).not.toHaveBeenCalledWith('created_by', expect.anything())
  })

  test('non-admin result set is capped at 2000 (not 50)', async () => {
    mockRole = 'member'
    await GET(makeGet())
    expect(mockQuery.limit).toHaveBeenCalledWith(2000)
  })

  test('applies a sanitized search filter across company/name/email', async () => {
    mockRole = 'member'
    await GET(makeGet({ search: 'BLD' }))
    expect(mockQuery.or).toHaveBeenCalledWith(
      'company.ilike.%BLD%,name.ilike.%BLD%,email.ilike.%BLD%'
    )
  })

  test('returns 401 when there is no authenticated user', async () => {
    mockUser = null
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })
})

// An update first reads the stored contact columns, then runs the update.
// Both use maybeSingle, so the pre-read has to be queued first.
function mockStoredContact(row = { name: null, email: null, phone: null }) {
  mockQuery.maybeSingle.mockResolvedValueOnce({ data: row, error: null })
}

describe('POST /api/clients — update on shared directory', () => {
  test('non-admin updating a client they DO own: persists and returns it', async () => {
    mockRole = 'member'
    mockStoredContact()
    mockQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: 'c-1', company: 'Owned Co', created_by: 'agent-1' },
      error: null,
    })
    const res = await POST(makePost({ id: 'c-1', company: 'Owned Co' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.client).toEqual({ id: 'c-1', company: 'Owned Co', created_by: 'agent-1' })
    expect(json.readOnly).toBeUndefined()
  })

  test('non-admin can edit ANY client (shared directory): persists and returns it, no created_by filter', async () => {
    mockRole = 'member'
    mockStoredContact()
    // The update matches the row (no ownership filter) and returns it.
    mockQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: 'c-bld', company: 'sas bld', address: 'New Street 1', created_by: 'admin-sunita' },
      error: null,
    })
    const res = await POST(makePost({ id: 'c-bld', company: 'sas bld', address: 'New Street 1' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.readOnly).toBeUndefined()
    expect(json.client.company).toBe('sas bld')
    expect(json.client.address).toBe('New Street 1')
    // The update must NEVER be scoped by created_by — that's what shares the
    // directory for editing.
    expect(mockQuery.in).not.toHaveBeenCalledWith('created_by', expect.anything())
    expect(mockQuery.eq).not.toHaveBeenCalledWith('created_by', expect.anything())
  })

  test('update of a non-existent id returns 404', async () => {
    mockRole = 'member'
    mockQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: null }) // update matched nothing
    const res = await POST(makePost({ id: 'missing', company: 'Ghost Co' }))
    expect(res.status).toBe(404)
  })

  test('rejects an update/create with no company name', async () => {
    mockRole = 'member'
    const res = await POST(makePost({ id: 'c-1', company: '   ' }))
    expect(res.status).toBe(400)
  })

  test('persists dzb_client_number, jeweler_group, and shipping on update', async () => {
    mockRole = 'member'
    mockStoredContact()
    mockQuery.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'c-dzb',
        company: 'Bijou FR',
        dzb_client_number: '5544',
        jeweler_group: 'SYNALIA',
        shipping_same_as_billing: false,
        shipping_address: 'Depot 1',
      },
      error: null,
    })
    const res = await POST(makePost({
      id: 'c-dzb',
      company: 'Bijou FR',
      dzb_client_number: '5544',
      jeweler_group: 'synalia',
      shipping_same_as_billing: false,
      shipping_address: 'Depot 1',
      shipping_address_line2: '75001 Paris',
      shipping_country: 'France',
    }))
    expect(res.status).toBe(200)
    expect(mockQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      dzb_client_number: '5544',
      jeweler_group: 'SYNALIA',
      shipping_same_as_billing: false,
      shipping_address: 'Depot 1',
      shipping_address_line2: '75001 Paris',
      shipping_country: 'France',
    }))
  })

  test('still saves contact details when client shipping columns are not migrated yet', async () => {
    mockStoredContact()
    mockQuery.maybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: 'PGRST204',
          message: "Could not find the 'shipping_country' column of 'clients' in the schema cache",
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'c-legacy-schema',
          company: 'Legacy Co',
          name: 'Sophie Client',
          email: 'sophie@example.com',
        },
        error: null,
      })

    const res = await POST(makePost({
      id: 'c-legacy-schema',
      company: 'Legacy Co',
      name: 'Sophie Client',
      email: 'sophie@example.com',
      shipping_same_as_billing: false,
      shipping_country: 'France',
    }))

    expect(res.status).toBe(200)
    expect(mockQuery.update).toHaveBeenCalledTimes(2)
    expect(mockQuery.update.mock.calls[0][0]).toEqual(expect.objectContaining({
      name: 'Sophie Client',
      email: 'sophie@example.com',
      shipping_country: 'France',
    }))
    expect(mockQuery.update.mock.calls[1][0]).toEqual(expect.objectContaining({
      name: 'Sophie Client',
      email: 'sophie@example.com',
    }))
    expect(mockQuery.update.mock.calls[1][0]).not.toHaveProperty('shipping_country')
    expect(mockQuery.update.mock.calls[1][0]).not.toHaveProperty('shipping_same_as_billing')
  })
})

describe('POST /api/clients — contact overwrite guard', () => {
  test('a different contact is NOT written without confirmation and warnings are returned', async () => {
    mockRole = 'member'
    mockStoredContact({ name: 'Marie Dupont', email: 'contact@littlefactory.re', phone: null })
    mockQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: 'c-1', company: 'SAS LITTLE FACTORY' },
      error: null,
    })

    const res = await POST(makePost({
      id: 'c-1',
      company: 'SAS LITTLE FACTORY',
      name: 'Dionne Saleh',
      email: 'dionnesaleh@gmail.com',
    }))
    const json = await res.json()

    expect(res.status).toBe(200)
    const payload = mockQuery.update.mock.calls[0][0]
    expect(payload).not.toHaveProperty('name')
    expect(payload).not.toHaveProperty('email')
    expect(json.contact_warnings).toEqual([
      { field: 'name', stored: 'Marie Dupont', incoming: 'Dionne Saleh' },
      { field: 'email', stored: 'contact@littlefactory.re', incoming: 'dionnesaleh@gmail.com' },
    ])
  })

  test('a different contact IS written when confirm_contact_overwrite is true', async () => {
    mockRole = 'member'
    mockStoredContact({ name: 'Marie Dupont', email: 'contact@littlefactory.re', phone: null })
    mockQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: 'c-1', company: 'SAS LITTLE FACTORY' },
      error: null,
    })

    const res = await POST(makePost({
      id: 'c-1',
      company: 'SAS LITTLE FACTORY',
      name: 'Sophie Martin',
      confirm_contact_overwrite: true,
    }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(mockQuery.update.mock.calls[0][0]).toEqual(expect.objectContaining({ name: 'Sophie Martin' }))
    expect(json.contact_warnings).toBeUndefined()
  })

  test('an empty contact field never wipes the stored value', async () => {
    mockRole = 'member'
    mockStoredContact({ name: 'Marie Dupont', email: 'contact@littlefactory.re', phone: '+262693218939' })
    mockQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: 'c-1', company: 'SAS LITTLE FACTORY' },
      error: null,
    })

    const res = await POST(makePost({
      id: 'c-1',
      company: 'SAS LITTLE FACTORY',
      name: '',
      email: '   ',
    }))
    const json = await res.json()

    expect(res.status).toBe(200)
    const payload = mockQuery.update.mock.calls[0][0]
    expect(payload).not.toHaveProperty('name')
    expect(payload).not.toHaveProperty('email')
    expect(payload).not.toHaveProperty('phone')
    expect(json.contact_warnings).toBeUndefined()
  })

  test('filling an empty stored contact column needs no confirmation', async () => {
    mockRole = 'member'
    mockStoredContact({ name: null, email: null, phone: null })
    mockQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: 'c-1', company: 'SAS LITTLE FACTORY' },
      error: null,
    })

    const res = await POST(makePost({
      id: 'c-1',
      company: 'SAS LITTLE FACTORY',
      name: 'Marie Dupont',
      email: 'contact@littlefactory.re',
    }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(mockQuery.update.mock.calls[0][0]).toEqual(expect.objectContaining({
      name: 'Marie Dupont',
      email: 'contact@littlefactory.re',
    }))
    expect(json.contact_warnings).toBeUndefined()
  })
})
