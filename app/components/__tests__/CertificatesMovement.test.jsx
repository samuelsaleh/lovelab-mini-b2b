import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import CertificatesStockClient from '../CertificatesStockClient'
import CertificatesVisitDetail from '../CertificatesVisitDetail'
import CertificatesModelsClient from '../CertificatesModelsClient'
import CertificatesVisitsClient from '../CertificatesVisitsClient'

// Numbers are grouped with a narrow no-break space (THIN_SPACE in
// lib/igi/derive.js). Testing Library normalises whitespace before matching, so
// the assertions below are written with a plain space on purpose.

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const MODELS = [
  {
    id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', igi_name: 'Cuty - Cubix',
    stones: '1', carat: 0.1, shape: 'Round', state: 'in_use', qty_ordered: 12250,
    shelf: 1006, pool: 900, shelf_min: 25, asked_now: 0,
    shelf_status: 'fine',
  },
  {
    id: 'm2', serial: 'LGAJ6552', name: 'Shapy Shine',
    stones: '1', carat: 0.5, shape: 'Heart', state: 'in_use', qty_ordered: 250,
    shelf: 2, pool: 50, shelf_min: 25, asked_now: 0,
    shelf_status: 'collect',
  },
  {
    id: 'm3', serial: 'LGAJ6588', name: '—', stones: '4', carat: 0.8, shape: 'Rd',
    state: 'reserved', qty_ordered: null, shelf: null, pool: null, shelf_min: 25,
    shelf_status: 'unmapped',
  },
  {
    id: 'm4', serial: null, name: 'Full Moonlight', stones: '1', carat: 0.5, shape: 'Round',
    state: 'awaiting_serial', qty_ordered: null, shelf: null, pool: null, shelf_min: 25,
    shelf_status: 'unmapped',
  },
]

function mockFetch(handlers = {}) {
  global.fetch = jest.fn((url, init) => {
    const u = String(url)
    if (u.includes('/api/igi/overview')) {
      return Promise.resolve({ ok: true, json: async () => ({ models: MODELS, totals: {}, shelf: {}, visits: [] }) })
    }
    if (handlers[u]) return handlers[u](init)
    for (const [key, fn] of Object.entries(handlers)) {
      if (u.includes(key)) return fn(init)
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
}

beforeEach(() => { jest.clearAllMocks() })

describe('asking IGI for certificates', () => {
  it('offers only models that can actually be made', async () => {
    mockFetch()
    render(<CertificatesStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))
    // The reserved serial and the one with no serial are both absent.
    expect(screen.queryByText('LGAJ6588')).not.toBeInTheDocument()
    expect(screen.queryByText('Full Moonlight')).not.toBeInTheDocument()
  })

  it('adds up what is being asked for', async () => {
    mockFetch()
    render(<CertificatesStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))

    const inputs = screen.getAllByTestId('ask-qty')
    fireEvent.change(inputs[0], { target: { value: '50' } })
    fireEvent.change(inputs[1], { target: { value: '12' } })

    // The total lives on the one button that sends it (16 Sept 2026).
    await waitFor(() => {
      expect(screen.getByTestId('send-request')).toHaveTextContent('Send to IGI · 62 on 2 lines')
    })
  })

  it('warns when more is asked for than IGI hold, without blocking it', async () => {
    mockFetch()
    render(<CertificatesStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))

    // m2: asking 500, IGI hold 50.
    fireEvent.change(screen.getAllByTestId('ask-qty')[1], { target: { value: '500' } })

    // The warning sits on the row itself, in the "what to do" column.
    await waitFor(() => expect(screen.getAllByTestId('todo-cell')[1]).toHaveTextContent('Short by 450'))
    // Still sendable — the point is to warn, not to prevent.
    expect(screen.getByTestId('send-request')).not.toBeDisabled()
  })

  it('will not send an empty request', async () => {
    mockFetch()
    render(<CertificatesStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))
    expect(screen.getByTestId('send-request')).toBeDisabled()
  })

  it('sends the chosen models and opens the movement', async () => {
    let sent = null
    mockFetch({
      '/api/igi/visits': (init) => {
        sent = JSON.parse(init.body)
        return Promise.resolve({ ok: true, json: async () => ({ visit: { id: 'v9' }, short: [] }) })
      },
    })
    render(<CertificatesStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))

    fireEvent.change(screen.getAllByTestId('ask-qty')[0], { target: { value: '50' } })
    fireEvent.click(screen.getByTestId('send-request'))

    await waitFor(() => expect(sent).toEqual({ lines: [{ model_id: 'm1', qty: 50 }] }))
    expect(push).toHaveBeenCalledWith('/certificates/visits/v9')
  })
})

describe('one movement', () => {
  const LINES = [
    { id: 'l1', model_id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', stones: '1', carat: 0.1, shape: 'Round', qty_requested: 100, qty_issued: null, qty_received: null, held: 900, short_by: 0 },
    { id: 'l2', model_id: 'm2', serial: 'LGAJ6552', name: 'Shapy Shine', stones: '1', carat: 0.5, shape: 'Heart', qty_requested: 500, qty_issued: null, qty_received: null, held: 50, short_by: 450 },
  ]

  function mockVisit(visit, lines = LINES, onPatch, onDelete) {
    global.fetch = jest.fn((url, init) => {
      const u = String(url)
      if (init?.method === 'PATCH') {
        onPatch?.(u, JSON.parse(init.body))
        return Promise.resolve({ ok: true, json: async () => ({ visit, received: 62 }) })
      }
      if (init?.method === 'DELETE') {
        onDelete?.(u)
        return Promise.resolve({ ok: true, json: async () => ({ returned_to_igi: 141 }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ visit, lines }) })
    })
  }

  const MINE = {
    id: 'v1', visit_no: 24, visit_date: '2026-08-28', status: 'requested',
    unattributed_total: null, created_by: 'u1',
  }
  const IMPORTED = { ...MINE, visit_no: 3, created_by: null }

  it('shows the shortage against what IGI hold', async () => {
    mockVisit({ id: 'v1', visit_no: 24, visit_date: '2026-08-28', status: 'requested', unattributed_total: null })
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getByTestId('shortage')).toBeInTheDocument())
    expect(screen.getByTestId('shortage')).toHaveTextContent('short by 450')
  })

  it('offers only the record step while waiting on IGI', async () => {
    mockVisit({ id: 'v1', visit_no: 24, visit_date: '2026-08-28', status: 'requested', unattributed_total: null })
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getByTestId('confirm-made')).toBeInTheDocument())
    expect(screen.queryByTestId('confirm-return')).not.toBeInTheDocument()
  })

  it('sends only the quantities that were typed, leaving the rest as asked', async () => {
    let body = null
    mockVisit(
      { id: 'v1', visit_no: 24, visit_date: '2026-08-28', status: 'requested', unattributed_total: null },
      LINES,
      (_u, b) => { body = b },
    )
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getAllByTestId('made-qty')).toHaveLength(2))

    fireEvent.change(screen.getAllByTestId('made-qty')[1], { target: { value: '41' } })
    fireEvent.click(screen.getByTestId('confirm-made'))

    await waitFor(() => expect(body).toEqual({ issued: { m2: '41' } }))
  })

  it('confirms the whole return with one button', async () => {
    let body = null
    const issuedLines = LINES.map((l) => ({ ...l, qty_issued: l.model_id === 'm1' ? 50 : 12 }))
    mockVisit(
      { id: 'v1', visit_no: 24, visit_date: '2026-08-28', status: 'issued', unattributed_total: null },
      issuedLines,
      (_u, b) => { body = b },
    )
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getByTestId('confirm-return')).toBeInTheDocument())

    // No per-model fields until somebody says something is short.
    expect(screen.queryByTestId('back-qty')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('confirm-return'))
    await waitFor(() => expect(body).toEqual({ received: {} }))
  })

  it('only asks for models once you say something is short', async () => {
    const issuedLines = LINES.map((l) => ({ ...l, qty_issued: 50 }))
    mockVisit(
      { id: 'v1', visit_no: 24, visit_date: '2026-08-28', status: 'issued', unattributed_total: null },
      issuedLines,
    )
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getByTestId('toggle-short-return')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('toggle-short-return'))
    await waitFor(() => expect(screen.getAllByTestId('back-qty')).toHaveLength(2))
  })

  it('says plainly when a movement has no model detail', async () => {
    mockVisit(
      { id: 'v1', visit_no: 9, visit_date: '2016-06-01', status: 'closed', unattributed_total: 453, date_suspect: true },
      [],
    )
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getByTestId('no-breakdown')).toBeInTheDocument())
    expect(screen.getByTestId('no-breakdown')).toHaveTextContent('453')
    expect(screen.getByTestId('no-breakdown')).toHaveTextContent(/belong to no model/)
    expect(screen.getByText('Date mistyped in the file')).toBeInTheDocument()
  })

  it('says when a movement is a correction, not a walk across the road', async () => {
    // Sam, 18 Sept 2026: "what is V-030?" — the attribution of 110 of the
    // June–July gap read like any other movement. Now it says so.
    mockVisit(
      { id: 'v30', visit_no: 30, visit_date: '2026-07-28', status: 'closed', unattributed_total: null, correction: true, note: 'Correction, 16 Sept 2026: 110 attributed.' },
      LINES,
    )
    render(<CertificatesVisitDetail visitId="v30" />)
    await waitFor(() => expect(screen.getByTestId('correction-note')).toBeInTheDocument())
    expect(screen.getByText('Correction')).toBeInTheDocument()
    expect(screen.getByTestId('correction-note')).toHaveTextContent('nothing crossed the road')
    expect(screen.getByTestId('correction-note')).toHaveTextContent('110 attributed')
  })

  it('says IGI were emailed about the request, when they were', async () => {
    mockVisit({ ...MINE, notified_at: '2026-09-18T08:32:00Z', notify_error: null })
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getByTestId('email-sent')).toBeInTheDocument())
    expect(screen.getByTestId('email-sent')).toHaveTextContent(/IGI were emailed on 18 Sept 2026 at \d\d:\d\d/)
    expect(screen.queryByTestId('email-failed')).toBeNull()
  })

  it('says why the email failed and lets you send it again (Sam, 18 Sept 2026)', async () => {
    const posts = []
    global.fetch = jest.fn((url, init) => {
      const u = String(url)
      if (init?.method === 'POST') {
        posts.push(u)
        return Promise.resolve({ ok: true, json: async () => ({ email: { sent: true, recipients: ['michael@igi.org'] } }) })
      }
      const visit = posts.length
        ? { ...MINE, notified_at: '2026-09-18T09:00:00Z', notify_error: null }
        : { ...MINE, notified_at: null, notify_error: 'Email is not configured on this server (no RESEND_API_KEY)' }
      return Promise.resolve({ ok: true, json: async () => ({ visit, lines: LINES }) })
    })
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getByTestId('email-failed')).toBeInTheDocument())
    expect(screen.getByTestId('email-failed')).toHaveTextContent('IGI have not been emailed')
    expect(screen.getByTestId('email-failed')).toHaveTextContent('no RESEND_API_KEY')

    fireEvent.click(screen.getByTestId('email-retry'))
    await waitFor(() => expect(posts).toEqual(['/api/igi/visits/v1/notify']))
    await waitFor(() => expect(screen.getByTestId('email-sent')).toBeInTheDocument())
    expect(screen.getByTestId('notice')).toHaveTextContent('IGI emailed: michael@igi.org')
  })

  it('says nothing about email once IGI have recorded what they made', async () => {
    const issuedLines = LINES.map((l) => ({ ...l, qty_issued: 50 }))
    mockVisit({ ...MINE, status: 'issued', notified_at: null }, issuedLines)
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getByTestId('confirm-return')).toBeInTheDocument())
    expect(screen.queryByTestId('email-failed')).toBeNull()
    expect(screen.queryByTestId('email-sent')).toBeNull()
  })

  it('tells you IGI were told when a return comes back short', async () => {
    const issuedLines = LINES.map((l) => ({ ...l, qty_issued: 50 }))
    global.fetch = jest.fn((url, init) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: async () => ({ visit: { ...MINE, status: 'closed' }, received: 98, missing: 2, email: { sent: true, missing: 2 } }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ visit: { ...MINE, status: 'issued' }, lines: issuedLines }) })
    })
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getByTestId('confirm-return')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('confirm-return'))
    await waitFor(() => expect(screen.getByTestId('notice')).toHaveTextContent('Received — 98 certificates. 2 missing — IGI were told.'))
  })

  it('offers no action once the movement is closed', async () => {
    mockVisit({ id: 'v1', visit_no: 24, visit_date: '2026-08-28', status: 'closed', unattributed_total: null })
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getByText(/This movement is closed/)).toBeInTheDocument())
    expect(screen.queryByTestId('confirm-made')).not.toBeInTheDocument()
    expect(screen.queryByTestId('confirm-return')).not.toBeInTheDocument()
  })
})

describe('clearing out a test movement', () => {
  const LINES = [
    { id: 'l1', model_id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', stones: '1', carat: 0.1, shape: 'Round', qty_requested: 100, qty_issued: 100, qty_received: null, held: 900, short_by: 0 },
    { id: 'l2', model_id: 'm2', serial: 'LGAJ6552', name: 'Shapy Shine', stones: '1', carat: 0.5, shape: 'Heart', qty_requested: 500, qty_issued: 41, qty_received: null, held: 50, short_by: 0 },
  ]
  const MINE = { id: 'v1', visit_no: 24, visit_date: '2026-08-28', status: 'issued', unattributed_total: null, created_by: 'u1' }
  const IMPORTED = { ...MINE, visit_no: 3, created_by: null }

  function mockVisit(visit, onDelete) {
    global.fetch = jest.fn((url, init) => {
      if (init?.method === 'DELETE') {
        onDelete?.(String(url), init.method)
        return Promise.resolve({ ok: true, json: async () => ({ returned_to_igi: 141 }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ visit, lines: LINES }) })
    })
  }

  it('asks twice before deleting anything', async () => {
    mockVisit(MINE)
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getByTestId('delete-movement')).toBeInTheDocument())
    // The first click only opens the question.
    expect(screen.queryByTestId('delete-confirmed')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('delete-movement'))
    expect(screen.getByTestId('delete-confirmed')).toBeInTheDocument()
  })

  it('says how much goes back to IGI before you commit', async () => {
    // 100 + 41 issued. Saying it out loud is the point: "delete" beside a stock
    // number usually means somebody also has to remember to undo something.
    mockVisit(MINE)
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getByTestId('delete-movement')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('delete-movement'))
    expect(screen.getByTestId('delete-confirm')).toHaveTextContent('141 certificates')
    expect(screen.getByTestId('delete-confirm')).toHaveTextContent(/shelf is unaffected/i)
  })

  it('backs out cleanly', async () => {
    mockVisit(MINE)
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getByTestId('delete-movement')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('delete-movement'))
    fireEvent.click(screen.getByTestId('delete-cancel'))
    expect(screen.queryByTestId('delete-confirmed')).not.toBeInTheDocument()
    expect(screen.getByTestId('delete-movement')).toBeInTheDocument()
  })

  it('deletes and returns to the list', async () => {
    let called = null
    mockVisit(MINE, (url, method) => { called = { url, method } })
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getByTestId('delete-movement')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('delete-movement'))
    fireEvent.click(screen.getByTestId('delete-confirmed'))

    await waitFor(() => expect(called).toEqual({ url: '/api/igi/visits/v1', method: 'DELETE' }))
    expect(push).toHaveBeenCalledWith('/certificates/visits')
  })

  it('offers nothing at all on an imported movement', async () => {
    // The 23 from IGI's file are the record of what happened between two
    // companies. There is no button, not a disabled one.
    mockVisit(IMPORTED)
    render(<CertificatesVisitDetail visitId="v1" />)
    await waitFor(() => expect(screen.getByTestId('delete-refused')).toBeInTheDocument())
    expect(screen.queryByTestId('delete-movement')).not.toBeInTheDocument()
    expect(screen.getByTestId('delete-refused')).toHaveTextContent(/imported history/i)
  })
})

describe('the model register', () => {
  it('does not show reserved serials at all — nothing can be done with them', async () => {
    // Sam, 16 Sept 2026: the collapsed "reserved serials" section was one more
    // thing to wonder about. IGI produced the last fifteen; the state is empty.
    mockFetch()
    render(<CertificatesModelsClient />)
    await waitFor(() => expect(screen.getAllByTestId('model-row')).toHaveLength(2))
    expect(screen.queryByText('LGAJ6588')).not.toBeInTheDocument()
    expect(screen.queryByTestId('toggle-reserved')).not.toBeInTheDocument()
  })

  it('lists a model still waiting for a serial on the same list, with a chip', async () => {
    mockFetch()
    render(<CertificatesModelsClient />)
    await waitFor(() => expect(screen.getByTestId('awaiting-row')).toBeInTheDocument())
    expect(screen.getByTestId('awaiting-row')).toHaveTextContent('Waiting for IGI’s serial')
  })

  it('renames a model and says the history did not move', async () => {
    let body = null
    mockFetch({
      '/api/igi/models': (init) => {
        body = JSON.parse(init.body)
        return Promise.resolve({ ok: true, json: async () => ({ model: { id: 'm1', name: 'Moonlight Original' } }) })
      },
    })
    render(<CertificatesModelsClient />)
    await waitFor(() => expect(screen.getAllByTestId('model-name')).toHaveLength(3))

    const input = screen.getAllByTestId('model-name')[0]
    fireEvent.change(input, { target: { value: 'Moonlight Original' } })
    fireEvent.blur(input)

    await waitFor(() => expect(body).toEqual({ model_id: 'm1', name: 'Moonlight Original' }))
    expect(await screen.findByTestId('notice')).toHaveTextContent(/hangs on the serial/)
  })

  it('will not save an empty name', async () => {
    let called = false
    mockFetch({ '/api/igi/models': () => { called = true; return Promise.resolve({ ok: true, json: async () => ({}) }) } })
    render(<CertificatesModelsClient />)
    await waitFor(() => expect(screen.getAllByTestId('model-name')).toHaveLength(3))

    const input = screen.getAllByTestId('model-name')[0]
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)

    expect(called).toBe(false)
  })
})

describe('the Movements list flags what went missing (Sam, 18 Sept 2026)', () => {
  it('shows fewer-than-asked and missing-on-return on the movement they belong to', async () => {
    const VISITS = [
      { id: 'v20', visit_no: 20, visit_date: '2026-08-25', status: 'closed', date_suspect: false, unattributed_total: null, line_count: 4, total: 250, short_issue: 40, short_return: 2 },
      { id: 'v21', visit_no: 21, visit_date: '2026-08-25', status: 'closed', date_suspect: false, unattributed_total: null, line_count: 1, total: 77, short_issue: 0, short_return: 0 },
    ]
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ visits: VISITS }) }))
    render(<CertificatesVisitsClient />)
    await waitFor(() => expect(screen.getAllByTestId('visit-row')).toHaveLength(2))
    expect(screen.getByTestId('short-issue')).toHaveTextContent('40 fewer than asked')
    expect(screen.getByTestId('short-return')).toHaveTextContent('2 missing on return')
    expect(screen.getAllByTestId('short-issue')).toHaveLength(1)
  })

  it('lists LoveLab ERP outs grouped by invoice on the LoveLab out switch', async () => {
    const OUTS = [
      {
        id: 'o8',
        erp_out_id: 8,
        invoice_no: '2',
        out_date: '2026-09-18',
        party: 'ALBERT SALEH',
        description: 'Cuty / Cubix / Long Moonlight · LGAJ6529 · 1 × 0,05 Round',
        pcs: 104,
        serial: 'LGAJ6529',
        synced_at: '2026-09-18T11:10:02Z',
      },
      {
        id: 'o9',
        erp_out_id: 9,
        invoice_no: '2',
        out_date: '2026-09-18',
        party: 'ALBERT SALEH',
        description: 'Shapy Shine · LGAJ6552 · 1 × 0,5 Heart',
        pcs: 50,
        serial: 'LGAJ6552',
        synced_at: '2026-09-18T11:10:02Z',
      },
      {
        id: 'o10',
        erp_out_id: 10,
        invoice_no: '3',
        out_date: '2026-09-17',
        party: 'OTHER BUYER',
        description: 'Full Moonlight · LGAJ6500',
        pcs: 20,
        serial: 'LGAJ6500',
        synced_at: '2026-09-18T11:10:02Z',
      },
    ]
    global.fetch = jest.fn((url) => {
      const u = String(url)
      if (u.includes('/api/igi/certificate-erp-outs')) {
        return Promise.resolve({ ok: true, json: async () => ({ outs: OUTS, count: 3 }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ visits: [] }) })
    })
    render(<CertificatesVisitsClient />)
    await waitFor(() => expect(screen.getByTestId('view')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('view-erp-out'))
    await waitFor(() => expect(screen.getAllByTestId('erp-out-group')).toHaveLength(2))

    const invoice2 = screen.getAllByTestId('erp-out-group')[0]
    expect(invoice2).toHaveTextContent('ALBERT SALEH')
    expect(invoice2).toHaveTextContent('154')
    expect(screen.queryByTestId('erp-out-row')).not.toBeInTheDocument()

    fireEvent.click(invoice2)
    await waitFor(() => expect(screen.getAllByTestId('erp-out-row')).toHaveLength(2))
    expect(screen.getByTestId('erp-outs-table')).toHaveTextContent('LGAJ6529')
    expect(screen.getByTestId('erp-outs-table')).toHaveTextContent('LGAJ6552')
  })

  it('filters LoveLab outs by party search', async () => {
    const OUTS = [
      {
        id: 'o8', erp_out_id: 8, invoice_no: '2', out_date: '2026-09-18',
        party: 'ALBERT SALEH', description: 'x', pcs: 104, serial: 'LGAJ6529',
        synced_at: '2026-09-18T11:10:02Z',
      },
      {
        id: 'o10', erp_out_id: 10, invoice_no: '3', out_date: '2026-09-17',
        party: 'OTHER BUYER', description: 'y', pcs: 20, serial: 'LGAJ6500',
        synced_at: '2026-09-18T11:10:02Z',
      },
    ]
    global.fetch = jest.fn((url) => {
      const u = String(url)
      if (u.includes('/api/igi/certificate-erp-outs')) {
        return Promise.resolve({ ok: true, json: async () => ({ outs: OUTS, count: 2 }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ visits: [] }) })
    })
    render(<CertificatesVisitsClient />)
    await waitFor(() => expect(screen.getByTestId('view')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('view-erp-out'))
    await waitFor(() => expect(screen.getAllByTestId('erp-out-group')).toHaveLength(2))

    fireEvent.change(screen.getByTestId('erp-party-search'), { target: { value: 'albert' } })
    await waitFor(() => expect(screen.getAllByTestId('erp-out-group')).toHaveLength(1))
    expect(screen.getByTestId('erp-out-group')).toHaveTextContent('ALBERT SALEH')
    expect(screen.queryByText('OTHER BUYER')).not.toBeInTheDocument()
  })

  it('lists LoveLab ERP ins grouped by invoice on the LoveLab in switch', async () => {
    const INS = [
      {
        id: 'i5',
        erp_in_id: 5,
        invoice_no: '2',
        in_date: '2026-09-18',
        party: 'IGI',
        description: 'Cuty / Cubix / Long Moonlight · LGAJ6529 · 1 × 0,05 Round',
        pcs: 2,
        serial: 'LGAJ6529',
        external_ref: 'visit:0fbe7a0b-787b-4dda-892a-f13e5a6282b7',
        synced_at: '2026-09-18T11:24:25Z',
      },
      {
        id: 'i1',
        erp_in_id: 1,
        invoice_no: '1',
        in_date: '2026-09-18',
        party: 'ALBERT SALEH',
        description: 'Cuty / Cubix / Long Moonlight · LGAJ6529 · 1 × 0,05 Round',
        pcs: 500,
        serial: 'LGAJ6529',
        external_ref: null,
        synced_at: '2026-09-18T11:24:25Z',
      },
    ]
    global.fetch = jest.fn((url) => {
      const u = String(url)
      if (u.includes('/api/igi/certificate-erp-ins')) {
        return Promise.resolve({ ok: true, json: async () => ({ ins: INS, count: 2 }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ visits: [] }) })
    })
    render(<CertificatesVisitsClient />)
    await waitFor(() => expect(screen.getByTestId('view')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('view-erp-in'))
    await waitFor(() => expect(screen.getAllByTestId('erp-in-group')).toHaveLength(2))
    expect(screen.queryByTestId('erp-in-row')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByTestId('erp-in-group')[0])
    await waitFor(() => expect(screen.getByTestId('erp-in-row')).toBeInTheDocument())
    expect(screen.getByText('IGI receive')).toBeInTheDocument()

    fireEvent.click(screen.getAllByTestId('erp-in-group')[1])
    await waitFor(() => expect(screen.getByText('ERP manual')).toBeInTheDocument())
  })
})
