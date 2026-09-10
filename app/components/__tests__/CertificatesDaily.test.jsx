import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import CertificatesDailyClient from '../CertificatesDailyClient'
import CertificatesVisitsClient from '../CertificatesVisitsClient'

// Numbers group with a narrow no-break space; Testing Library normalises
// whitespace, so these assertions use a plain one.

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const DAYS = [
  {
    date: '2026-08-25', total: 327, attributed: 327, unattributed: 0, date_suspect: false,
    visits: [{ id: 'v20', visit_no: 20, status: 'closed' }, { id: 'v21', visit_no: 21, status: 'closed' }],
    models: [
      { model_id: 'm1', qty: 250, serial: 'LGAJ6529', name: 'Cuty-Cubix', stones: '1', carat: 0.05, shape: 'Round' },
      { model_id: 'm2', qty: 77, serial: 'LGAJ6530', name: 'Multi Three', stones: '3', carat: 0.1, shape: 'Round' },
    ],
  },
  {
    date: '2026-07-03', total: 694, attributed: 0, unattributed: 694, date_suspect: false,
    visits: [{ id: 'v11', visit_no: 11, status: 'closed' }],
    models: [],
  },
]

function mockFetch(days = DAYS) {
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ days }) }))
}

beforeEach(() => { jest.clearAllMocks() })

describe('what was taken, day by day', () => {
  it('lists every day certificates moved, newest first', async () => {
    mockFetch()
    render(<CertificatesDailyClient />)
    await waitFor(() => expect(screen.getAllByTestId('daily-day')).toHaveLength(2))
    expect(screen.getByText('25/08/2026')).toBeInTheDocument()
    expect(screen.getByText('03/07/2026')).toBeInTheDocument()
  })

  it('opens the most recent day without being asked', async () => {
    // It is the day being asked about nine times out of ten.
    mockFetch()
    render(<CertificatesDailyClient />)
    await waitFor(() => expect(screen.getAllByTestId('daily-model')).toHaveLength(2))
    expect(screen.getByText('Cuty-Cubix')).toBeInTheDocument()
  })

  it('shows a model once for the day, however many movements it spanned', async () => {
    mockFetch()
    render(<CertificatesDailyClient />)
    await waitFor(() => expect(screen.getAllByTestId('daily-model')).toHaveLength(2))
    // 250 is two movements' worth of one model, already added up.
    expect(screen.getAllByTestId('daily-model')[0]).toHaveTextContent('250')
  })

  it('never shows a serial without its carat and shape', async () => {
    mockFetch()
    render(<CertificatesDailyClient />)
    await waitFor(() => expect(screen.getAllByTestId('daily-model')).toHaveLength(2))
    const row = screen.getAllByTestId('daily-model')[0]
    expect(row).toHaveTextContent('LGAJ6529')
    expect(row).toHaveTextContent('0,05 ct')
  })

  it('names the movements the day was made of, and opens one', async () => {
    mockFetch()
    render(<CertificatesDailyClient />)
    await waitFor(() => expect(screen.getAllByTestId('daily-open-visit')).toHaveLength(2))
    fireEvent.click(screen.getAllByTestId('daily-open-visit')[0])
    expect(push).toHaveBeenCalledWith('/certificates/visits/v20')
  })

  it('shows a day with no model detail as exactly that', async () => {
    mockFetch()
    render(<CertificatesDailyClient />)
    await waitFor(() => expect(screen.getAllByTestId('daily-day')).toHaveLength(2))

    fireEvent.click(screen.getAllByTestId('daily-day-head')[1])
    await waitFor(() => expect(screen.getByTestId('daily-no-breakdown')).toBeInTheDocument())
    expect(screen.getByTestId('daily-no-breakdown')).toHaveTextContent('694')
    expect(screen.getByTestId('daily-no-breakdown')).toHaveTextContent(/no models named/i)
  })

  it('says up front how much of the history has no model behind it', async () => {
    mockFetch()
    render(<CertificatesDailyClient />)
    await waitFor(() => expect(screen.getByTestId('daily-gap-note')).toBeInTheDocument())
    expect(screen.getByTestId('daily-gap-note')).toHaveTextContent('694')
  })

  it('says so plainly when nothing has moved', async () => {
    mockFetch([])
    render(<CertificatesDailyClient />)
    await waitFor(() => expect(screen.getByTestId('daily-empty')).toBeInTheDocument())
    expect(screen.queryByTestId('daily-gap-note')).not.toBeInTheDocument()
  })
})

describe('the Movements screen reads the same history two ways', () => {
  const VISITS = [
    { id: 'v20', visit_no: 20, visit_date: '2026-08-25', status: 'closed', date_suspect: false, unattributed_total: null, line_count: 4, total: 250 },
    { id: 'v21', visit_no: 21, visit_date: '2026-08-25', status: 'closed', date_suspect: false, unattributed_total: null, line_count: 1, total: 77 },
  ]
  function mockBoth() {
    global.fetch = jest.fn((url) => {
      const u = String(url)
      if (u.includes('/api/igi/daily')) return Promise.resolve({ ok: true, json: async () => ({ days: DAYS }) })
      return Promise.resolve({ ok: true, json: async () => ({ visits: VISITS }) })
    })
  }

  it('starts by movement and switches to by day without leaving the screen', async () => {
    mockBoth()
    render(<CertificatesVisitsClient />)
    await waitFor(() => expect(screen.getAllByTestId('visit-row')).toHaveLength(2))
    expect(screen.queryByTestId('daily-day')).toBeNull()

    fireEvent.click(screen.getByTestId('view-day'))
    await waitFor(() => expect(screen.getAllByTestId('daily-day')).toHaveLength(2))
    expect(screen.queryByTestId('visit-row')).toBeNull()
    // One heading, not two: the embedded day view has no page head of its own.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Movements')
  })

  it('can open on the day view for the old Daily history address', async () => {
    mockBoth()
    render(<CertificatesVisitsClient initialView="day" />)
    await waitFor(() => expect(screen.getAllByTestId('daily-day')).toHaveLength(2))
  })

  it('sends people to Stock to ask for more, since the request lives there now', async () => {
    mockBoth()
    render(<CertificatesVisitsClient />)
    await waitFor(() => expect(screen.getByTestId('new-request')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('new-request'))
    expect(push).toHaveBeenCalledWith('/certificates/stock')
  })
})
