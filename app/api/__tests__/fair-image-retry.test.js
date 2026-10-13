/**
 * @jest-environment node
 *
 * POST /api/fair-assistant/images/[id]/retry — "Try again" for a photo the card reader never answered.
 */
const trigger = jest.fn()
jest.mock('@/lib/fair-assistant/n8n', () => ({ triggerN8nCardWebhook: (...a) => trigger(...a) }))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }))

let images, batches
function from(name) {
  const st = { filters: [], patch: null, op: 'select', single: false }
  const q = {
    select() { return q },
    update(p) { st.op = 'update'; st.patch = p; return q },
    eq(c, v) { st.filters.push((r) => r[c] === v); return q },
    in(c, vs) { st.filters.push((r) => vs.includes(r[c])); return q },
    single() { st.single = true; return q },
    then(res, rej) { return Promise.resolve(exec()).then(res, rej) },
  }
  function exec() {
    const rows = (name === 'fair_images' ? images : batches).filter((r) => st.filters.every((f) => f(r)))
    if (st.op === 'update') { rows.forEach((r) => Object.assign(r, st.patch)); return { error: null } }
    return st.single ? (rows[0] ? { data: { ...rows[0] }, error: null } : { data: null, error: { message: 'nf' } }) : { data: rows, error: null }
  }
  return q
}
jest.mock('@/lib/fair-assistant/server', () => ({
  requireFairAdmin: jest.fn(async () => ({ user: { email: 'r@x.com' }, adminSupabase: { from } })),
}))

const { POST } = require('../fair-assistant/images/[id]/retry/route')
const call = (id) => POST(new global.Request('http://localhost/x', { method: 'POST' }), { params: Promise.resolve({ id }) })

beforeEach(() => {
  jest.clearAllMocks()
  images = [
    { id: 'i1', batch_id: 'b1', drive_file_id: 'drv1', file_name: 'Card 1.PNG', status: 'processing', error: null },
    { id: 'i2', batch_id: 'b1', drive_file_id: 'drv2', file_name: 'c2.jpg', status: 'processed', error: null },
    { id: 'i3', batch_id: 'b1', drive_file_id: null, file_name: 'c3.jpg', status: 'failed', error: 'x' },
    { id: 'i4', batch_id: 'b1', drive_file_id: 'drv4', file_name: 'c4.jpg', status: 'failed', error: 'OCR failed' },
  ]
  batches = [{ id: 'b1', status: 'extracted' }]
  trigger.mockResolvedValue({})
})

describe('image retry route', () => {
  test('sends the same Drive file to n8n again with the right mime type and marks the photo processing', async () => {
    const res = await call('i1')
    expect(res.status).toBe(200)
    expect(trigger).toHaveBeenCalledWith({ driveFileId: 'drv1', mimeType: 'image/png', batchId: 'b1', imageId: 'i1' })
    expect(images[0]).toMatchObject({ status: 'processing', error: null })
    expect(images[0].updated_at).toBeTruthy()
    expect(batches[0].status).toBe('extracting')
  })

  test('a failed photo can be retried; its old error is cleared', async () => {
    await call('i4')
    expect(trigger).toHaveBeenCalledTimes(1)
    expect(images[3]).toMatchObject({ status: 'processing', error: null })
  })

  test('a finished photo is refused (409) and n8n is not called', async () => {
    const res = await call('i2')
    expect(res.status).toBe(409)
    expect(trigger).not.toHaveBeenCalled()
  })

  test('a photo with no Drive file is refused with advice to upload again', async () => {
    const res = await call('i3')
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/upload it again/i)
  })

  test('unknown id is 404', async () => {
    expect((await call('nope')).status).toBe(404)
  })

  test('when n8n refuses, the photo ends failed with the reason and the call returns 502', async () => {
    trigger.mockRejectedValue(new Error('n8n webhook failed (403): no'))
    const res = await call('i1')
    expect(res.status).toBe(502)
    expect(images[0].status).toBe('failed')
    expect(images[0].error).toMatch(/403/)
  })

  test('a second click within seconds is refused (the card reader was just asked)', async () => {
    images[0].updated_at = new Date().toISOString()
    const res = await call('i1')
    expect(res.status).toBe(409)
    expect(trigger).not.toHaveBeenCalled()
  })
})
