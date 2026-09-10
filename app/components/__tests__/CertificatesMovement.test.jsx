import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import CertificatesRequestClient from '../CertificatesRequestClient'
import CertificatesVisitDetail from '../CertificatesVisitDetail'
import CertificatesModelsClient from '../CertificatesModelsClient'

// Numbers are grouped with a narrow no-break space (THIN_SPACE in
// lib/igi/derive.js). Testing Library normalises whitespace before matching, so
// the assertions below are written with a plain space on purpose.

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const MODELS = [
  {
    id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', igi_name: 'Cuty - Cubix',
    stones: '1', carat: 0.1, shape: 'Round', state: 'in_use', qty_ordered: 12250,
    shelf: 1006, pool: 900, shelf_min: 25, pool_min: null, asked_now: 0,
    shelf_status: 'fine', pool_status: 'fine',
  },
  {
    id: 'm2', serial: 'LGAJ6552', name: 'Shapy Shine',
    stones: '1', carat: 0.5, shape: 'Heart', state: 'in_use', qty_ordered: 250,
    shelf: 2, pool: 50, shelf_min: 25, pool_min: 100, asked_now: 0,
    shelf_status: 'collect', pool_status: 'reorder',
  },
  {
    id: 'm3', serial: 'LGAJ6588', name: '—', stones: '4', carat: 0.8, shape: 'Rd',
    state: 'reserved', qty_ordered: null, shelf: null, pool: null, shelf_min: 25,
    shelf_status: 'unmapped', pool_status: 'unknown',
  },
  {
    id: 'm4', serial: null, name: 'Full Moonlight', stones: '1', carat: 0.5, shape: 'Round',
    state: 'awaiting_serial', qty_ordered: null, shelf: null, pool: null, shelf_min: 25,
    shelf_status: 'unmapped', pool_status: 'unknown',
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
    render(<CertificatesRequestClient />)
    await waitFor(() => expect(screen.getAllByTestId('request-row')).toHaveLength(2))
    // The reserved serial and the one with no serial are both absent.
    expect(screen.queryByText('LGAJ6588')).not.toBeInTheDocument()
    expect(screen.queryByText('Full Moonlight')).not.toBeInTheDocument()
  })

  it('adds up what is being asked for', async () => {
    mockFetch()
    render(<CertificatesRequestClient />)
    await waitFor(() => expect(screen.getAllByTestId('request-row')).toHaveLength(2))

    const inputs = screen.getAllByTestId('ask-qty')
    fireEvent.change(inputs[0], { target: { value: '50' } })
    fireEvent.change(inputs[1], { target: { value: '12' } })

    await waitFor(() => {
      expect(screen.getByTestId('request-total')).toHaveTextContent('62')
      expect(screen.getByTestId('request-total')).toHaveTextContent('across 2 models')
    })
  })

  it('warns when more is asked for than IGI hold, without blocking it', async () => {
    mockFetch()
    render(<CertificatesRequestClient />)
    await waitFor(() => expect(screen.getAllByTestId('request-row')).toHaveLength(2))

    // m2: asking 500, IGI hold 50.
    fireEvent.change(screen.getAllByTestId('ask-qty')[1], { target: { value: '500' } })

    await waitFor(() => expect(screen.getByTestId('shortage-warning')).toBeInTheDocument())
    expect(screen.getByTestId('shortage-warning')).toHaveTextContent('short by 450')
    // Still sendable — the point is to warn, not to prevent.
    expect(screen.getByTestId('send-request')).not.toBeDisabled()
  })

  it('will not send an empty request', async () => {
    mockFetch()
    render(<CertificatesRequestClient />)
    await waitFor(() => expect(screen.getAllByTestId('request-row')).toHaveLength(2))
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
    render(<CertificatesRequestClient />)
    await waitFor(() => expect(screen.getAllByTestId('request-row')).toHaveLength(2))

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
  it('keeps reserved serials collapsed until asked for', async () => {
    mockFetch()
    render(<CertificatesModelsClient />)
    await waitFor(() => expect(screen.getAllByTestId('model-row')).toHaveLength(2))

    expect(screen.queryByTestId('reserved-row')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('toggle-reserved'))
    await waitFor(() => expect(screen.getAllByTestId('reserved-row')).toHaveLength(1))
  })

  it('lists the models still waiting for a serial', async () => {
    mockFetch()
    render(<CertificatesModelsClient />)
    await waitFor(() => expect(screen.getByTestId('awaiting-serial')).toBeInTheDocument())
    expect(screen.getByTestId('awaiting-serial')).toHaveTextContent('Full Moonlight')
    expect(screen.getByTestId('awaiting-serial')).toHaveTextContent(/cannot be requested/)
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
    await waitFor(() => expect(screen.getAllByTestId('model-name')).toHaveLength(2))

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
    await waitFor(() => expect(screen.getAllByTestId('model-name')).toHaveLength(2))

    const input = screen.getAllByTestId('model-name')[0]
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)

    expect(called).toBe(false)
  })

  it('shows what IGI called a model when it differs from ours', async () => {
    mockFetch()
    render(<CertificatesModelsClient />)
    await waitFor(() => expect(screen.getByText(/IGI’s file called it Cuty - Cubix/)).toBeInTheDocument())
  })
})
