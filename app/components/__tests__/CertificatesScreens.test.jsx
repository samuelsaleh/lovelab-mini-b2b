import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import CertificatesStockClient from '../CertificatesStockClient'
import CertificatesDashboardClient from '../CertificatesDashboardClient'
import SerialSpec from '../igi/SerialSpec'

// Numbers are grouped with a narrow no-break space (see THIN_SPACE in
// lib/igi/derive.js). Testing Library normalises whitespace before matching, so
// the assertions below are written with a plain space on purpose.

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const MODELS = [
  {
    id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix / Sienna 1 / Moonlight Original',
    stones: '1', carat: 0.1, shape: 'Round', state: 'in_use', qty_ordered: 12250,
    shelf_min: 25, order_min: null, shelf: 1006, pool: 11020, asked_now: 0,
    shelf_status: 'fine', order_status: 'fine',
  },
  {
    id: 'm2', serial: 'LGAJ6552', name: 'Shapy Shine',
    stones: '1', carat: 0.5, shape: 'Heart', state: 'in_use', qty_ordered: 250,
    shelf_min: 25, order_min: 100, shelf: 2, pool: 40, asked_now: 12,
    shelf_status: 'collect', order_status: 'order',
  },
  {
    id: 'm3', serial: 'LGAJ6588', name: '—', stones: '4', carat: 0.8, shape: 'Rd',
    state: 'reserved', qty_ordered: null, shelf_min: 25, order_min: null,
    shelf: null, pool: null, asked_now: 0, shelf_status: 'unmapped', order_status: 'unknown',
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
    const u = String(url)
    if (u.includes('/api/igi/overview')) {
      return Promise.resolve({ ok: true, json: async () => overview })
    }
    if (u.includes('/shelf-history')) {
      return extra.onShelfHistory
        ? extra.onShelfHistory(u)
        : Promise.resolve({
          ok: true,
          json: async () => ({
            model: { id: 'm1', name: 'Cuty-Cubix', serial: 'LGAJ6530' },
            shelf: {
              current: 1006,
              as_of: '2026-09-18',
              descriptions: ['Cuty pack'],
              history: [{ date: '2026-09-18', pcs: 1006, change: null }],
              source: 'Nightly packing-stock',
            },
            certificate_ledger: {
              total_in: 1200,
              total_out: 194,
              net: 1006,
              source: 'Certificate ledger',
              entries: [
                {
                  id: 'in-1', kind: 'in', date: '2026-09-01', invoice_no: '1',
                  party: 'IGI', pcs: 1200, balance: 1200, external_ref: 'visit:abc',
                },
                {
                  id: 'out-1', kind: 'out', date: '2026-09-10', invoice_no: '2',
                  party: 'SHOP', pcs: 194, balance: 1006,
                },
              ],
            },
          }),
        })
    }
    if (u.includes('/api/igi/visits') && init?.method === 'POST') {
      return extra.onPost
        ? extra.onPost(JSON.parse(init.body))
        : Promise.resolve({ ok: true, json: async () => ({ visit: { id: 'v9' } }) })
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
}

async function renderStock(overview, extra) {
  mockFetch(overview, extra)
  render(<CertificatesStockClient />)
  await waitFor(() => expect(screen.getByTestId('facts')).toBeInTheDocument())
}

beforeEach(() => { jest.clearAllMocks() })

describe('Stock is the front page — one line per model', () => {
  // Sam, 16 Sept 2026: "too much information". No dashboard; the line under
  // the title says what the dashboard used to say.
  it('says what there is to do in one line', async () => {
    await renderStock()
    expect(screen.getByTestId('fact-collect')).toHaveTextContent('1 to collect')
    expect(screen.getByTestId('fact-order')).toHaveTextContent('1 to order')
    expect(screen.getByTestId('fact-shelf')).toHaveTextContent('shelf read on 28/08/2026')
  })

  it('keeps reserved serials off an operational screen', async () => {
    await renderStock()
    expect(screen.getAllByTestId('stock-row')).toHaveLength(2)
    expect(screen.queryByText(/LGAJ6588/)).not.toBeInTheDocument()
  })

  it('has five columns and no level to edit — levels live on Models', async () => {
    await renderStock()
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).toEqual(['Model', 'On our shelf', 'At IGI', 'What to do', 'Ask for'])
    expect(screen.queryByTestId('shelf-min')).not.toBeInTheDocument()
    expect(screen.queryByTestId('order-min')).not.toBeInTheDocument()
  })

  it('shows each figure with its level underneath', async () => {
    await renderStock()
    const [fine, low] = screen.getAllByTestId('shelf-cell')
    expect(fine).toHaveTextContent('1 006')
    expect(fine).toHaveTextContent('level 25')
    expect(fine).toHaveTextContent('history')
    expect(low).toHaveTextContent('2')
    expect(low.querySelector('.n')).toHaveClass('low')
    // One level on IGI's stock, ours. None set reads as none.
    expect(screen.getAllByTestId('igi-cell')[0]).toHaveTextContent('no level yet')
  })

  it('opens In/Out history when a shelf figure is clicked', async () => {
    await renderStock()
    fireEvent.click(screen.getAllByTestId('shelf-open')[0])
    await waitFor(() => expect(screen.getByTestId('shelf-summary')).toBeInTheDocument())
    expect(screen.getByTestId('shelf-summary')).toHaveTextContent('Certificate In')
    expect(screen.getByTestId('shelf-ledger-table')).toHaveTextContent('IGI')
    expect(screen.getByTestId('shelf-ledger-table')).toHaveTextContent('SHOP')
    expect(screen.getByTestId('shelf-snapshot-table')).toHaveTextContent('18/09/2026')
  })

  it('says what to do in words: Collect, Order at IGI, and what is already asked', async () => {
    await renderStock()
    const [nothing, todo] = screen.getAllByTestId('todo-cell')
    expect(nothing).toHaveTextContent('—')
    expect(todo).toHaveTextContent('Collect')
    expect(todo).toHaveTextContent('Order at IGI')
    expect(todo).toHaveTextContent('Asked · 12')
  })

  it('says "no shelf figure" rather than zero when no snapshot carries the model', async () => {
    await renderStock({
      ...OVERVIEW,
      models: [{ ...MODELS[0], shelf: null, shelf_status: 'unmapped' }],
    })
    expect(screen.getByTestId('shelf-cell')).toHaveTextContent('no shelf figure')
    expect(screen.getByTestId('fact-unmapped')).toHaveTextContent('1 without a shelf figure')
    expect(screen.getByText('match them')).toHaveAttribute('href', '/certificates/matching')
  })

  it('calls a model IGI never named "Unnamed model", with a way to name it', async () => {
    await renderStock({ ...OVERVIEW, models: [{ ...MODELS[2], state: 'in_use', pool: 500 }] })
    expect(screen.getByTestId('model-name')).toHaveTextContent('Unnamed model')
    expect(screen.getByTestId('name-it')).toHaveAttribute('href', '/certificates/models')
  })

  it('filters down to what needs collecting, and to what needs ordering', async () => {
    await renderStock()
    fireEvent.click(screen.getByTestId('filter-collect'))
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(1))
    expect(screen.getByText('Shapy Shine')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('filter-order'))
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(1))

    fireEvent.click(screen.getByTestId('filter-all'))
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))
  })

  it('reports a failure instead of showing an empty page', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      ok: false, json: async () => ({ error: 'Failed to load the certificate stock' }),
    }))
    render(<CertificatesStockClient />)
    await waitFor(() => {
      expect(screen.getByText('Failed to load the certificate stock')).toBeInTheDocument()
    })
  })
})

describe('the request is a column on Stock, and one button sends it', () => {
  it('sends what is in the boxes and opens the movement', async () => {
    const push = jest.fn()
    jest.spyOn(require('next/navigation'), 'useRouter').mockReturnValue({ push })
    let sent = null
    await renderStock(OVERVIEW, {
      onPost: async (body) => { sent = body; return { ok: true, json: async () => ({ visit: { id: 'v9' } }) } },
    })

    expect(screen.getByTestId('send-request')).toBeDisabled()
    fireEvent.change(screen.getAllByTestId('ask-qty')[1], { target: { value: '30' } })
    expect(screen.getByTestId('send-request')).toHaveTextContent('Send to IGI · 30 on 1 line')

    fireEvent.click(screen.getByTestId('send-request'))
    await waitFor(() => expect(sent).toEqual({ lines: [{ model_id: 'm2', qty: 30 }] }))
    expect(push).toHaveBeenCalledWith('/certificates/visits/v9')
  })

  it('warns on the row when asking for more than IGI hold', async () => {
    // Nobody should walk across the road expecting 500 and come back with 40.
    await renderStock()
    fireEvent.change(screen.getAllByTestId('ask-qty')[1], { target: { value: '500' } })
    expect(screen.getAllByTestId('todo-cell')[1]).toHaveTextContent('Short by 460')
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

describe('our level on IGI’s stock (10 Sept 2026) still drives Stock', () => {
  it('shows our level rather than IGI’s once we hold one, and says Order at IGI below it', async () => {
    await renderStock({
      ...OVERVIEW,
      models: [
        { ...MODELS[0], order_min: 20000, order_status: 'order' },
        { ...MODELS[1], order_status: 'fine', shelf_status: 'fine' },
      ],
    })
    const [ours] = screen.getAllByTestId('igi-cell')
    expect(ours).toHaveTextContent('level 20 000')
    expect(ours.querySelector('.n')).toHaveClass('low')
    expect(screen.getAllByTestId('todo-cell')[0]).toHaveTextContent('Order at IGI')
    expect(screen.getByTestId('fact-order')).toHaveTextContent('1 to order')
  })
})

describe('the dashboard is two lists, and nothing else', () => {
  // Sam, 16 Sept 2026: the old front page was useful for exactly these two
  // lists. Shapy Shine: shelf 2, level 25 → back up to 50 would mean 48, but
  // IGI only hold 40.
  async function renderDash(overview = OVERVIEW, extra = {}) {
    mockFetch(overview, extra)
    render(<CertificatesDashboardClient />)
    await waitFor(() => expect(screen.getByTestId('list-collect')).toBeInTheDocument())
  }

  it('prefills a suggested quantity, capped at what IGI hold', async () => {
    await renderDash()
    expect(screen.getAllByTestId('collect-row')).toHaveLength(1)
    expect(screen.getByTestId('collect-ask')).toHaveValue(40)
    expect(screen.getByText('all they have')).toBeInTheDocument()
    expect(screen.getByTestId('collect-send')).toHaveTextContent('Ask IGI for 40')
  })

  it('sends what is in the boxes and opens the movement', async () => {
    const push = jest.fn()
    jest.spyOn(require('next/navigation'), 'useRouter').mockReturnValue({ push })
    let sent = null
    await renderDash(OVERVIEW, {
      onPost: async (body) => { sent = body; return { ok: true, json: async () => ({ visit: { id: 'v9' } }) } },
    })
    fireEvent.change(screen.getByTestId('collect-ask'), { target: { value: '30' } })
    fireEvent.click(screen.getByTestId('collect-send'))
    await waitFor(() => expect(sent).toEqual({ lines: [{ model_id: 'm2', qty: 30 }] }))
    expect(push).toHaveBeenCalledWith('/certificates/visits/v9')
  })

  it('lists a model below our level under Order at IGI, with the shortfall', async () => {
    await renderDash({
      ...OVERVIEW,
      models: [
        { ...MODELS[0], order_min: 20000, order_status: 'order' },
        { ...MODELS[1], order_status: 'fine' },
      ],
    })
    const list = screen.getByTestId('list-produce')
    expect(screen.getAllByTestId('produce-row')).toHaveLength(1)
    expect(list).toHaveTextContent('Cuty-Cubix')
    expect(list).toHaveTextContent('20 000')
    expect(list).toHaveTextContent('short by 8 980')
    expect(list).not.toHaveTextContent('Shapy Shine')
  })

  it('carries none of the old furniture', async () => {
    await renderDash()
    for (const gone of ['stat-shelf', 'stat-igi', 'gap-card', 'stat-reserved', 'facts', 'go-matching']) {
      expect(screen.queryByTestId(gone)).toBeNull()
    }
    expect(screen.queryByText(/no model attached/)).toBeNull()
    expect(screen.getByTestId('go-stock')).toBeInTheDocument()
  })

  it('says so when both lists are empty', async () => {
    await renderDash({
      ...OVERVIEW,
      models: [{ ...MODELS[0] }, { ...MODELS[1], shelf: 60, shelf_status: 'fine', order_status: 'fine' }],
    })
    expect(screen.getByText('Every model is above its shelf level.')).toBeInTheDocument()
    expect(screen.getByText('IGI hold enough of every model, by the level we set.')).toBeInTheDocument()
  })
})
