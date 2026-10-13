/**
 * @jest-environment node
 *
 * POST /api/fair-assistant/upload — only photos, one copy per batch.
 */
const trigger = jest.fn()
const upload = jest.fn()
const del = jest.fn()
jest.mock('@/lib/fair-assistant/n8n', () => ({ triggerN8nCardWebhook: (...a) => trigger(...a) }))
jest.mock('@/lib/google-drive', () => ({ uploadFileToDrive: (...a) => upload(...a), deleteFileFromDrive: (...a) => del(...a) }))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }))

let images, batch, noHashColumn
function from(name) {
  const st = { filters: [], patch: null, op: 'select', single: false, row: null }
  const q = {
    select() { return q },
    insert(r) { st.op = 'insert'; st.row = r; return q },
    update(p) { st.op = 'update'; st.patch = p; return q },
    eq(c, v) { st.filters.push((r) => r[c] === v); if (c === 'content_hash' && noHashColumn) st.err = { message: 'column content_hash does not exist' }; return q },
    limit() { return q },
    single() { st.single = true; return q },
    then(res, rej) { return Promise.resolve(exec()).then(res, rej) },
  }
  function exec() {
    if (name === 'fair_batches') return st.op === 'update' ? { error: null } : { data: { ...batch }, error: null }
    if (st.err) return { data: null, error: st.err }
    if (st.op === 'insert') {
      if (st.row.content_hash && images.some((i) => i.batch_id === st.row.batch_id && i.content_hash === st.row.content_hash)) return { data: null, error: { code: '23505', message: 'dup' } }
      const row = { id: `i${images.length + 1}`, ...st.row }; images.push(row); return { data: row, error: null }
    }
    if (st.op === 'update') return { error: null }
    return { data: images.filter((r) => st.filters.every((f) => f(r))), error: null }
  }
  return q
}
jest.mock('@/lib/fair-assistant/server', () => ({
  requireFairAdmin: jest.fn(async () => ({ user: { email: 'r@x.com' }, adminSupabase: { from } })),
}))

const { POST } = require('../fair-assistant/upload/route')
const send = (parts, { name = 'card.jpg', type = 'image/jpeg', batchId = 'b1' } = {}) => {
  const fd = new global.FormData()
  fd.append('batchId', batchId)
  fd.append('file', new global.File([parts], name, { type }))
  return POST({ formData: async () => fd, headers: new Headers(), url: 'http://x/y' })
}

beforeEach(() => {
  jest.clearAllMocks(); process.env.FAIR_DRIVE_INBOX_FOLDER_ID = 'inbox'
  images = []; batch = { id: 'b1', status: 'uploading', total_images: 0 }; noHashColumn = false
  upload.mockResolvedValue({ id: 'drv1' }); trigger.mockResolvedValue({}); del.mockResolvedValue({})
})

describe('upload route', () => {
  test('stores a photo, records its hash, starts the card reader', async () => {
    const res = await send('abc'); const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.duplicate).toBeUndefined()
    expect(images[0].content_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  test('the same bytes uploaded twice in a batch are stored and read once; the second call returns the first photo', async () => {
    await send('same-bytes')
    const res = await send('same-bytes', { name: 'again.jpg' }); const body = await res.json()
    expect(body.duplicate).toBe(true)
    expect(body.image.id).toBe('i1')
    expect(images).toHaveLength(1)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  test('different bytes are different photos', async () => {
    await send('one'); await send('two')
    expect(images).toHaveLength(2)
  })

  test('two identical uploads racing past the check keep one photo (unique index) and drop the extra Drive copy', async () => {
    images = [{ id: 'i1', batch_id: 'b1', content_hash: require('crypto').createHash('sha256').update('race').digest('hex'), drive_file_id: 'drv0' }]
    // make the pre-check miss (as if both calls ran before the first insert)
    const real = images; let first = true
    const orig = real.filter
    real.filter = function (fn) { if (first) { first = false; return [] } return orig.call(this, fn) }
    const res = await send('race'); const body = await res.json()
    expect(body.duplicate).toBe(true)
    expect(del).toHaveBeenCalledWith('drv1')
    expect(trigger).not.toHaveBeenCalled()
  })

  test('works before the migration: no hash column means no dedupe, the photo is still stored', async () => {
    noHashColumn = true
    const res = await send('abc')
    expect(res.status).toBe(200)
    expect(images[0].content_hash).toBeUndefined()
  })

  test('a PDF or text file is refused with a plain message and nothing is uploaded', async () => {
    const res = await send('%PDF', { name: 'notes.pdf', type: 'application/pdf' })
    expect(res.status).toBe(415)
    expect((await res.json()).error).toMatch(/not a photo/i)
    expect(upload).not.toHaveBeenCalled()
  })

  test('a phone HEIC photo is accepted, even when the browser sends no type', async () => {
    const res = await send('heic', { name: 'IMG_1.HEIC', type: 'application/octet-stream' })
    expect(res.status).toBe(200)
  })

  test('a file over 12 MB is refused', async () => {
    const res = await send(Buffer.alloc(12 * 1024 * 1024 + 1))
    expect(res.status).toBe(413)
    expect(upload).not.toHaveBeenCalled()
  })

  test('picking again a photo whose first attempt FAILED asks the card reader again', async () => {
    await send('retry-me')
    images[0].status = 'failed'; images[0].error = 'x'
    trigger.mockClear()
    const body = await (await send('retry-me')).json()
    expect(body).toMatchObject({ duplicate: true, retried: true })
    expect(trigger).toHaveBeenCalledTimes(1)
    expect(images).toHaveLength(1)
  })
})
