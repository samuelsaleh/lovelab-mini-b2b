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

describe('a LoveLab admin driving IGI’s portal', () => {
  // Sam has to be able to test IGI's half before IGI have a login. An earlier
  // version disabled every write here, which left their half untestable — the
  // rule that each company enters its own half still holds, and is kept by
  // recording who acted rather than by a dead button.
  function preview(ui) {
    return render(
      <IgiPortalProvider base="/api/igi/preview" preview>{ui}</IgiPortalProvider>,
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

  it('records what was made, through the preview and not through IGI’s route', async () => {
    const calls = []
    global.fetch = jest.fn((url, init) => {
      calls.push({ url: String(url), method: init?.method })
      return Promise.resolve({ ok: true, json: async () => ({ visits: VISITS, made: 620 }) })
    })
    preview(<IgiTodoClient />)
    await waitFor(() => expect(screen.getByTestId('send-to-lovelab')).toBeInTheDocument())
    expect(screen.getByTestId('send-to-lovelab')).not.toBeDisabled()

    fireEvent.click(screen.getByTestId('send-to-lovelab'))
    await waitFor(() => expect(calls).toContainEqual({
      url: '/api/igi/preview/todo/v1/produce', method: 'PATCH',
    }))
    expect(calls.some((c) => c.url.includes('/api/igi-portal'))).toBe(false)
  })

  it('says whose name the work goes under', async () => {
    mockFetch()
    preview(<IgiTodoClient />)
    await waitFor(() => expect(screen.getAllByTestId('todo-line')).toHaveLength(2))
    expect(screen.getByText(/recorded against your name/i)).toBeInTheDocument()
  })

  it('sets IGI’s alert level through the preview', async () => {
    const calls = []
    global.fetch = jest.fn((url, init) => {
      calls.push({ url: String(url), method: init?.method })
      return Promise.resolve({ ok: true, json: async () => ({ models: MODELS, updated: [] }) })
    })
    preview(<IgiStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))

    fireEvent.change(screen.getByTestId('bulk-value'), { target: { value: '250' } })
    fireEvent.click(screen.getByTestId('bulk-apply'))
    await waitFor(() => expect(calls).toContainEqual({
      url: '/api/igi/preview/alerts', method: 'PATCH',
    }))
  })

  it('records a batch through the preview', async () => {
    const calls = []
    global.fetch = jest.fn((url, init) => {
      calls.push({ url: String(url), method: init?.method })
      return Promise.resolve({ ok: true, json: async () => ({ models: MODELS, batch: { id: 'b1' } }) })
    })
    preview(<IgiAddBatchClient />)
    await waitFor(() => expect(screen.getByTestId('model')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('model'), { target: { value: 'm1' } })
    fireEvent.change(screen.getByTestId('qty'), { target: { value: '500' } })
    fireEvent.click(screen.getByTestId('save-batch'))

    await waitFor(() => expect(calls).toContainEqual({
      url: '/api/igi/preview/batches', method: 'POST',
    }))
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
    expect(screen.queryByText(/recorded against your name/i)).not.toBeInTheDocument()
  })
})
