/**
 * @jest-environment node
 *
 * findAuthUserByEmail — the one lookup every invite uses.
 *
 * supabase-js ignores a `filter` option on listUsers, so the old
 * `listUsers({ filter: 'email.eq.x', perPage: 1 })` returned the oldest user
 * in the project and matched only by luck. This pages and matches itself.
 */
const { findAuthUserByEmail } = require('../auth/findAuthUser')

function client(pages, { fail = false } = {}) {
  const calls = []
  return {
    calls,
    auth: { admin: { listUsers: jest.fn(async ({ page, perPage }) => {
      calls.push({ page, perPage })
      if (fail) return { data: null, error: new Error('gotrue down') }
      return { data: { users: pages[page - 1] || [] }, error: null }
    }) } },
  }
}

test('finds a user on a later page, matching the address case-insensitively', async () => {
  const full = Array.from({ length: 3 }, (_, i) => ({ id: `u${i}`, email: `u${i}@x.com` }))
  const c = client([full, [{ id: 'r', email: 'Raphael@Love-Lab.com' }]])
  const found = await findAuthUserByEmail(c, ' raphael@love-lab.com ', { perPage: 3 })
  expect(found).toEqual({ id: 'r', email: 'Raphael@Love-Lab.com' })
  expect(c.calls).toEqual([{ page: 1, perPage: 3 }, { page: 2, perPage: 3 }])
})

test('stops at a short page and answers null when nobody has the address', async () => {
  const c = client([[{ id: 'a', email: 'a@x.com' }]])
  expect(await findAuthUserByEmail(c, 'nobody@x.com', { perPage: 3 })).toBeNull()
  expect(c.calls).toEqual([{ page: 1, perPage: 3 }])
})

test('an empty address is null without calling the API', async () => {
  const c = client([])
  expect(await findAuthUserByEmail(c, '')).toBeNull()
  expect(c.calls).toEqual([])
})

test('an API failure is a warning and null, never a throw', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  const c = client([], { fail: true })
  expect(await findAuthUserByEmail(c, 'a@x.com')).toBeNull()
  expect(console.warn).toHaveBeenCalled()
  console.warn.mockRestore()
})

test('gives up after maxPages on a pathological list', async () => {
  const page = Array.from({ length: 2 }, (_, i) => ({ id: `p${i}`, email: `p${i}@x.com` }))
  const c = client(Array(50).fill(page))
  expect(await findAuthUserByEmail(c, 'zz@x.com', { perPage: 2, maxPages: 5 })).toBeNull()
  expect(c.calls).toHaveLength(5)
})
