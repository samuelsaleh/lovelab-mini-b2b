import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import IgiTodoClient from '../IgiTodoClient'
import IgiStockClient from '../IgiStockClient'
import IgiAddBatchClient from '../IgiAddBatchClient'
import { IgiPortalProvider } from '../certificates/IgiPortalContext'

// Numbers group with a narrow no-break space; Testing Library normalises
// whitespace, so assertions below use a plain space.

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const LINES = [
  { id: 'l1', model_id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', stones: '1', carat: 0.1, shape: 'Round', qty_requested: 100, qty_issued: null, held: 900, short_by: 0 },
  { id: 'l2', model_id: 'm2', serial: 'LGAJ6552', name: 'Shapy Shine', stones: '1', carat: 0.5, shape: 'Heart', qty_requested: 500, qty_issued: null, held: 41, short_by: 459 },
]
const VISITS = [{ id: 'v1', visit_no: 24, visit_date: '2026-08-28', status: 'requested', date_suspect: false, unattributed_total: null, lines: LINES }]
const MODELS = [
  { id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', stones: '1', carat: 0.1, shape: 'Round', spec: null, pool: 900, pool_min: 1000, asked_now: 100 },
  { id: 'm2', serial: 'LGAJ6552', name: 'Shapy Shine', stones: '1', carat: 0.5, shape: 'Heart', spec: null, pool: 41, pool_min: null, asked_now: 500 },
]

function mockFetch(handlers = {}) {
  global.fetch = jest.fn((url, init) => {
    const u = String(url)
    for (const [key, fn] of Object.entries(handlers)) {
      if (u.includes(key)) return fn(init)
    }
    if (u.includes('/todo')) return Promise.resolve({ ok: true, json: async () => ({ visits: VISITS }) })
    if (u.includes('/stock')) return Promise.resolve({ ok: true, json: async () => ({ models: MODELS }) })
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
}

beforeEach(() => { jest.clearAllMocks() })

describe('IGI: to do', () => {
  it('shows one card per request, not a table of them', async () => {
    mockFetch()
    render(<IgiTodoClient />)
    await waitFor(() => expect(screen.getAllByTestId('todo-card')).toHaveLength(1))
    expect(screen.getAllByTestId('todo-line')).toHaveLength(2)
  })

  it('puts what they hold beside what was asked', async () => {
    mockFetch()
    render(<IgiTodoClient />)
    await waitFor(() => expect(screen.getAllByTestId('todo-line')).toHaveLength(2))
    expect(screen.getAllByText('They asked for')).toHaveLength(2)
    expect(screen.getAllByText('You hold')).toHaveLength(2)
  })

  it('names the shortage rather than blocking the work', async () => {
    mockFetch()
    render(<IgiTodoClient />)
    await waitFor(() => expect(screen.getByTestId('shortage')).toBeInTheDocument())
    expect(screen.getByTestId('shortage')).toHaveTextContent('You hold fewer than they asked for on 1 model')
    expect(screen.getByText('short by 459')).toBeInTheDocument()
    expect(screen.getByTestId('send-to-lovelab')).not.toBeDisabled()
  })

  it('sends only what was typed, leaving the rest as asked', async () => {
    let body = null
    mockFetch({
      '/produce': (init) => {
        body = JSON.parse(init.body)
        return Promise.resolve({ ok: true, json: async () => ({ visit_no: 24, made: 141 }) })
      },
    })
    render(<IgiTodoClient />)
    await waitFor(() => expect(screen.getAllByTestId('made-qty')).toHaveLength(2))

    fireEvent.change(screen.getAllByTestId('made-qty')[1], { target: { value: '41' } })
    fireEvent.click(screen.getByTestId('send-to-lovelab'))

    await waitFor(() => expect(body).toEqual({ made: { m2: '41' } }))
    expect(await screen.findByTestId('notice')).toHaveTextContent('141')
  })

  it('says plainly when there is nothing to do', async () => {
    mockFetch({ '/todo': () => Promise.resolve({ ok: true, json: async () => ({ visits: [] }) }) })
    render(<IgiTodoClient />)
    await waitFor(() => expect(screen.getByTestId('empty')).toBeInTheDocument())
  })

  it('shows no LoveLab shelf figure anywhere', async () => {
    mockFetch()
    const { container } = render(<IgiTodoClient />)
    await waitFor(() => expect(screen.getAllByTestId('todo-card')).toHaveLength(1))
    expect(container.textContent.toLowerCase()).not.toContain('shelf')
  })
})

describe('IGI: my stock', () => {
  it('shows their stock and what is asked right now, and nothing of LoveLab\'s', async () => {
    mockFetch()
    const { container } = render(<IgiStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))
    expect(screen.getByText('Asked right now')).toBeInTheDocument()
    expect(container.textContent.toLowerCase()).not.toContain('shelf')
  })

  it('flags a model below the level they set', async () => {
    mockFetch()
    render(<IgiStockClient />)
    // m1 holds 900 against a level of 1000.
    await waitFor(() => expect(screen.getByText('Produce more')).toBeInTheDocument())
  })

  it('saves their own level, not LoveLab\'s', async () => {
    let body = null
    mockFetch({
      '/alerts': (init) => {
        body = JSON.parse(init.body)
        return Promise.resolve({ ok: true, json: async () => ({ updated: [] }) })
      },
    })
    render(<IgiStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('pool-min')).toHaveLength(2))

    const input = screen.getAllByTestId('pool-min')[1]
    fireEvent.change(input, { target: { value: '250' } })
    fireEvent.blur(input)

    await waitFor(() => expect(body).toEqual({ model_ids: ['m2'], pool_min: 250 }))
    expect(body).not.toHaveProperty('shelf_min')
  })

  it('treats an empty level as no warning at all', async () => {
    let body = null
    mockFetch({
      '/alerts': (init) => { body = JSON.parse(init.body); return Promise.resolve({ ok: true, json: async () => ({ updated: [] }) }) },
    })
    render(<IgiStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('pool-min')).toHaveLength(2))

    const input = screen.getAllByTestId('pool-min')[0]
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    await waitFor(() => expect(body).toEqual({ model_ids: ['m1'], pool_min: null }))
  })
})

describe('IGI: add a batch', () => {
  it('will not save until it has a model and a quantity', async () => {
    mockFetch()
    render(<IgiAddBatchClient />)
    await waitFor(() => expect(screen.getByTestId('model')).toBeInTheDocument())
    expect(screen.getByTestId('save-batch')).toBeDisabled()

    fireEvent.change(screen.getByTestId('model'), { target: { value: 'm1' } })
    expect(screen.getByTestId('save-batch')).toBeDisabled()

    fireEvent.change(screen.getByTestId('qty'), { target: { value: '500' } })
    await waitFor(() => expect(screen.getByTestId('save-batch')).not.toBeDisabled())
  })

  it('tells them what they currently hold once a model is chosen', async () => {
    mockFetch()
    render(<IgiAddBatchClient />)
    await waitFor(() => expect(screen.getByTestId('model')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('model'), { target: { value: 'm1' } })
    expect(await screen.findByText(/You currently hold 900/)).toBeInTheDocument()
  })

  it('saves the batch and confirms the stock went up', async () => {
    let body = null
    mockFetch({
      '/batches': (init) => {
        body = JSON.parse(init.body)
        return Promise.resolve({ ok: true, json: async () => ({ batch: { id: 'b1' } }) })
      },
    })
    render(<IgiAddBatchClient />)
    await waitFor(() => expect(screen.getByTestId('model')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('model'), { target: { value: 'm1' } })
    fireEvent.change(screen.getByTestId('qty'), { target: { value: '500' } })
    fireEvent.change(screen.getByTestId('batch-date'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByTestId('reference'), { target: { value: 'ATW/26/SC/02896' } })
    fireEvent.click(screen.getByTestId('save-batch'))

    await waitFor(() => expect(body).toEqual({
      model_id: 'm1', qty: 500, batch_date: '2026-09-01', reference: 'ATW/26/SC/02896',
    }))
    expect(await screen.findByTestId('notice')).toHaveTextContent(/stock has gone up/)
  })

  it('says batches are never edited, so a mistake is corrected by another', async () => {
    mockFetch()
    render(<IgiAddBatchClient />)
    await waitFor(() => expect(screen.getByTestId('model')).toBeInTheDocument())
    expect(screen.getByText(/never edited or removed/)).toBeInTheDocument()
  })
})

describe('a LoveLab admin previewing IGI’s portal', () => {
  // Reading their screens is fair — Sam needs to know what he is asking of
  // another company. Typing on their behalf is not: the record is only worth
  // something to both sides while each enters its own half.
  function preview(ui) {
    return render(
      <IgiPortalProvider base="/api/igi/preview" readOnly>{ui}</IgiPortalProvider>,
    )
  }

  it('reads their screens from the preview route, not their own', async () => {
    const seen = []
    global.fetch = jest.fn((url) => {
      seen.push(String(url))
      return Promise.resolve({ ok: true, json: async () => ({ visits: VISITS }) })
    })
    preview(<IgiTodoClient />)
    await waitFor(() => expect(screen.getAllByTestId('todo-line')).toHaveLength(2))
    expect(seen).toEqual(['/api/igi/preview/todo'])
  })

  it('shows everything and lets none of it be typed', async () => {
    mockFetch()
    preview(<IgiTodoClient />)
    await waitFor(() => expect(screen.getAllByTestId('todo-line')).toHaveLength(2))

    // The figures are all there — that is the point of looking.
    expect(screen.getByText('900')).toBeInTheDocument()
    expect(screen.getByText('short by 459')).toBeInTheDocument()
    // The controls are not.
    expect(screen.getByTestId('send-to-lovelab')).toBeDisabled()
    for (const input of screen.getAllByTestId('made-qty')) expect(input).toBeDisabled()
    expect(screen.getByText(/only igi can record what they made/i)).toBeInTheDocument()
  })

  it('will not let LoveLab set IGI’s own alert level', async () => {
    mockFetch()
    preview(<IgiStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))
    expect(screen.getByTestId('bulk-apply')).toBeDisabled()
    expect(screen.getByTestId('bulk-value')).toBeDisabled()
    for (const input of screen.getAllByTestId('pool-min')) expect(input).toBeDisabled()
  })

  it('will not let LoveLab record production for them', async () => {
    mockFetch()
    preview(<IgiAddBatchClient />)
    await waitFor(() => expect(screen.getByTestId('model')).toBeInTheDocument())
    expect(screen.getByTestId('model')).toBeDisabled()
    expect(screen.getByTestId('qty')).toBeDisabled()
    expect(screen.getByTestId('save-batch')).toBeDisabled()
  })

  it('leaves IGI’s own visit alone — same components, their route, their buttons', async () => {
    const seen = []
    global.fetch = jest.fn((url) => {
      seen.push(String(url))
      return Promise.resolve({ ok: true, json: async () => ({ visits: VISITS }) })
    })
    render(<IgiTodoClient />)
    await waitFor(() => expect(screen.getAllByTestId('todo-line')).toHaveLength(2))
    expect(seen).toEqual(['/api/igi-portal/todo'])
    expect(screen.getByTestId('send-to-lovelab')).not.toBeDisabled()
  })
})
