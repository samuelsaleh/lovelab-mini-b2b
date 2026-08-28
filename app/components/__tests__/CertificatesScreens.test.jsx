import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import CertificatesDashboardClient from '../CertificatesDashboardClient'
import CertificatesStockClient from '../CertificatesStockClient'
import SerialSpec from '../igi/SerialSpec'

// Numbers are grouped with a narrow no-break space (see THIN_SPACE in
// lib/igi/derive.js). Testing Library normalises whitespace before matching, so
// the assertions below are written with a plain space on purpose.

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const MODELS = [
  {
    id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix / Sienna 1 / Moonlight Original',
    stones: '1', carat: 0.1, shape: 'Round', state: 'in_use', qty_ordered: 12250,
    shelf_min: 25, pool_min: 1800, shelf: 1006, pool: 11020, asked_now: 0,
    shelf_status: 'fine', pool_status: 'fine',
  },
  {
    id: 'm2', serial: 'LGAJ6552', name: 'Shapy Shine',
    stones: '1', carat: 0.5, shape: 'Heart', state: 'in_use', qty_ordered: 250,
    shelf_min: 25, pool_min: 100, shelf: 2, pool: 40, asked_now: 12,
    shelf_status: 'collect', pool_status: 'reorder',
  },
  {
    id: 'm3', serial: 'LGAJ6588', name: '—', stones: '4', carat: 0.8, shape: 'Rd',
    state: 'reserved', qty_ordered: null, shelf_min: 25, pool_min: null,
    shelf: null, pool: null, asked_now: 0, shelf_status: 'unmapped', pool_status: 'unknown',
  },
]

const OVERVIEW = {
  models: MODELS,
  totals: {
    on_shelf: 3504, at_igi: 59221, ordered: 62999, unattributed: 3245,
    models_in_use: 2, reserved: 1, awaiting_serial: 3,
    to_collect: 1, to_produce: 1, open_visits: 0,
  },
  shelf: { last_read: '2026-08-28', previous_read: '2026-08-27', unlinked: 0 },
  visits: [],
}

function mockFetch(overview = OVERVIEW, extra = {}) {
  global.fetch = jest.fn((url, init) => {
    if (String(url).includes('/api/igi/overview')) {
      return Promise.resolve({ ok: true, json: async () => overview })
    }
    if (String(url).includes('/api/igi/alerts')) {
      extra.onAlert?.(JSON.parse(init.body))
      return Promise.resolve({ ok: true, json: async () => ({ updated: [] }) })
    }
    return Promise.resolve({ ok: true, json: async () => ({ descriptions: [] }) })
  })
}

beforeEach(() => { jest.clearAllMocks() })

describe('the certificates dashboard', () => {
  it('leads with the two figures the module exists to answer', async () => {
    mockFetch()
    render(<CertificatesDashboardClient />)
    await waitFor(() => expect(screen.getByTestId('stat-shelf')).toBeInTheDocument())

    expect(screen.getByTestId('stat-shelf')).toHaveTextContent('3 504')
    expect(screen.getByTestId('stat-igi')).toHaveTextContent('59 221')
  })

  it('shows the unattributed certificates as their own unresolved figure', async () => {
    mockFetch()
    render(<CertificatesDashboardClient />)
    await waitFor(() => expect(screen.getByTestId('gap-card')).toBeInTheDocument())

    const gap = screen.getByTestId('gap-card')
    expect(gap).toHaveTextContent('3 245')
    expect(gap).toHaveTextContent(/no model attached/i)
    expect(gap).toHaveTextContent(/16 June and 28 July/)
    expect(gap).toHaveTextContent(/Unresolved/)
  })

  it('hides the gap card once nothing is unattributed', async () => {
    mockFetch({ ...OVERVIEW, totals: { ...OVERVIEW.totals, unattributed: 0 } })
    render(<CertificatesDashboardClient />)
    await waitFor(() => expect(screen.getByTestId('stat-shelf')).toBeInTheDocument())
    expect(screen.queryByTestId('gap-card')).not.toBeInTheDocument()
  })

  it('separates what to collect from what to produce', async () => {
    mockFetch()
    render(<CertificatesDashboardClient />)
    await waitFor(() => expect(screen.getByTestId('list-collect')).toBeInTheDocument())

    expect(screen.getByTestId('list-collect')).toHaveTextContent('Shapy Shine')
    expect(screen.getByTestId('list-produce')).toHaveTextContent('Shapy Shine')
    expect(screen.getByTestId('list-collect')).not.toHaveTextContent('Cuty-Cubix')
  })

  it('offers the matching screen when a description is unlinked', async () => {
    mockFetch({ ...OVERVIEW, shelf: { ...OVERVIEW.shelf, unlinked: 4 } })
    render(<CertificatesDashboardClient />)
    await waitFor(() => expect(screen.getByTestId('go-matching')).toBeInTheDocument())
    expect(screen.getByText(/4 stock descriptions are not linked/)).toBeInTheDocument()
  })

  it('reports a failure instead of showing an empty page', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      ok: false, json: async () => ({ error: 'Failed to load the certificate stock' }),
    }))
    render(<CertificatesDashboardClient />)
    await waitFor(() => {
      expect(screen.getByText('Failed to load the certificate stock')).toBeInTheDocument()
    })
  })
})

describe('the stock and alerts screen', () => {
  it('keeps reserved serials off an operational screen', async () => {
    mockFetch()
    render(<CertificatesStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))
    expect(screen.queryByText('LGAJ6588')).not.toBeInTheDocument()
  })

  it("shows IGI's alert level but does not offer to edit it", async () => {
    // Two alert rules, one owner each.
    mockFetch()
    render(<CertificatesStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))

    // One editable field per row — ours.
    expect(screen.getAllByTestId('shelf-min')).toHaveLength(2)
    expect(screen.getByText('1 800')).toBeInTheDocument()
  })

  it('says "not mapped" rather than zero when no snapshot carries the model', async () => {
    mockFetch({
      ...OVERVIEW,
      models: [{ ...MODELS[0], shelf: null, shelf_status: 'unmapped' }],
    })
    render(<CertificatesStockClient />)
    await waitFor(() => expect(screen.getByText('not mapped')).toBeInTheDocument())
  })

  it('filters down to what needs collecting', async () => {
    mockFetch()
    render(<CertificatesStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))

    fireEvent.click(screen.getByTestId('filter-collect'))
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(1))
    expect(screen.getByText('Shapy Shine')).toBeInTheDocument()
  })

  it('sets one level across every model shown', async () => {
    const onAlert = jest.fn()
    mockFetch(OVERVIEW, { onAlert })
    render(<CertificatesStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))

    fireEvent.change(screen.getByTestId('bulk-value'), { target: { value: '100' } })
    fireEvent.click(screen.getByTestId('bulk-apply'))

    await waitFor(() => expect(onAlert).toHaveBeenCalled())
    expect(onAlert).toHaveBeenCalledWith({ model_ids: ['m1', 'm2'], shelf_min: 100 })
  })

  it('only applies the bulk level to the filtered rows', async () => {
    const onAlert = jest.fn()
    mockFetch(OVERVIEW, { onAlert })
    render(<CertificatesStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))

    fireEvent.click(screen.getByTestId('filter-collect'))
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(1))
    fireEvent.change(screen.getByTestId('bulk-value'), { target: { value: '50' } })
    fireEvent.click(screen.getByTestId('bulk-apply'))

    await waitFor(() => expect(onAlert).toHaveBeenCalled())
    expect(onAlert).toHaveBeenCalledWith({ model_ids: ['m2'], shelf_min: 50 })
  })

  it('saves one model when its own level loses focus', async () => {
    const onAlert = jest.fn()
    mockFetch(OVERVIEW, { onAlert })
    render(<CertificatesStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))

    const input = screen.getAllByTestId('shelf-min')[0]
    fireEvent.change(input, { target: { value: '75' } })
    fireEvent.blur(input)

    await waitFor(() => expect(onAlert).toHaveBeenCalledWith({ model_ids: ['m1'], shelf_min: 75 }))
  })

  it('does not save an alert level that is not a whole number', async () => {
    const onAlert = jest.fn()
    mockFetch(OVERVIEW, { onAlert })
    render(<CertificatesStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))

    const input = screen.getAllByTestId('shelf-min')[0]
    fireEvent.change(input, { target: { value: '-5' } })
    fireEvent.blur(input)

    expect(onAlert).not.toHaveBeenCalled()
  })
})

describe('a serial never appears without its carat and shape', () => {
  it('renders the specification beside the serial', () => {
    render(<SerialSpec model={MODELS[0]} />)
    expect(screen.getByTestId('serial')).toHaveTextContent('LGAJ6530')
    expect(screen.getByText('1 st · 0,10 ct · Round')).toBeInTheDocument()
  })

  it('tells the two easily confused serials apart', () => {
    const { container: a } = render(<SerialSpec model={{ serial: 'LGAJ6529', stones: '1', carat: 0.05, shape: 'Round' }} />)
    const { container: b } = render(<SerialSpec model={{ serial: 'LGAJ6530', stones: '1', carat: 0.1, shape: 'Round' }} />)
    expect(a.textContent).not.toBe(b.textContent)
  })

  it('says so plainly when IGI has not numbered the model yet', () => {
    render(<SerialSpec model={{ serial: null, stones: '1', carat: 0.5, shape: 'Round' }} />)
    expect(screen.getByTestId('serial')).toHaveTextContent('no serial yet')
  })
})
