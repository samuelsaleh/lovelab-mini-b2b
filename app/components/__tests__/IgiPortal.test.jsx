import React from 'react'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import IgiTodoClient from '../IgiTodoClient'
import IgiStockClient from '../IgiStockClient'
import IgiAddBatchClient from '../IgiAddBatchClient'
import IgiHistoryClient from '../IgiHistoryClient'
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
  { id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', stones: '1', carat: 0.1, shape: 'Round', spec: null, pool: 900, level: 1000, asked_now: 100 },
  { id: 'm2', serial: 'LGAJ6552', name: 'Shapy Shine', stones: '1', carat: 0.5, shape: 'Heart', spec: null, pool: 41, level: null, asked_now: 500 },
]

// m1 below the level LoveLab want, as the To do lists it.
const PRODUCE = [{ ...MODELS[0], short_by: 100 }]

function mockFetch(handlers = {}) {
  global.fetch = jest.fn((url, init) => {
    const u = String(url)
    for (const [key, fn] of Object.entries(handlers)) {
      if (u.includes(key)) return fn(init)
    }
    if (u.includes('/todo')) return Promise.resolve({ ok: true, json: async () => ({ visits: VISITS, produce: PRODUCE }) })
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
    expect(within(screen.getByTestId('todo-card')).getAllByText('You hold')).toHaveLength(2)
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

describe('IGI: new models to number', () => {
  const NEW_MODELS = [
    { id: 'm-new', name: 'Full Moonlight', stones: '1', carat: 0.5, shape: 'Round', spec: null, requested_at: '2026-09-10T09:00:00Z' },
  ]
  function withNewModels(onPatch) {
    mockFetch({
      '/serial': (init) => onPatch(JSON.parse(init.body)),
      '/todo': () => Promise.resolve({ ok: true, json: async () => ({ visits: VISITS, new_models: NEW_MODELS }) }),
    })
  }

  it('lists the models LoveLab added, with what they are', async () => {
    withNewModels()
    render(<IgiTodoClient />)
    await waitFor(() => expect(screen.getByTestId('new-models')).toBeInTheDocument())
    expect(screen.getAllByTestId('new-model-line')).toHaveLength(1)
    expect(screen.getByTestId('new-models')).toHaveTextContent('Full Moonlight')
    expect(screen.getByTestId('new-models')).toHaveTextContent('0,50 ct')
    expect(screen.getByTestId('confirm-serial')).toBeDisabled()
  })

  it('sends the serial and takes the model off the list', async () => {
    const sent = []
    withNewModels(async (body) => {
      sent.push(body)
      return { ok: true, json: async () => ({ model: { id: 'm-new', name: 'Full Moonlight', serial: 'LGAJ6600', state: 'in_use' } }) }
    })
    render(<IgiTodoClient />)
    await waitFor(() => expect(screen.getByTestId('serial-input')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('serial-input'), { target: { value: 'lgaj6600' } })
    expect(screen.getByTestId('confirm-serial')).not.toBeDisabled()
    fireEvent.click(screen.getByTestId('confirm-serial'))
    await waitFor(() => expect(screen.queryByTestId('new-models')).toBeNull())
    expect(sent).toEqual([{ serial: 'LGAJ6600' }])
    expect(screen.getByTestId('notice')).toHaveTextContent('Full Moonlight is now LGAJ6600')
  })

  it('shows the refusal and keeps the model on the list', async () => {
    withNewModels(async () => ({ ok: false, json: async () => ({ error: 'LGAJ6530 is already the serial of Cuty-Cubix.' }) }))
    render(<IgiTodoClient />)
    await waitFor(() => expect(screen.getByTestId('serial-input')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('serial-input'), { target: { value: 'LGAJ6530' } })
    fireEvent.click(screen.getByTestId('confirm-serial'))
    await waitFor(() => expect(screen.getByText(/already the serial of Cuty-Cubix/)).toBeInTheDocument())
    expect(screen.getAllByTestId('new-model-line')).toHaveLength(1)
  })

  it('still says nothing is waiting when both lists are empty', async () => {
    mockFetch({ '/todo': () => Promise.resolve({ ok: true, json: async () => ({ visits: [], new_models: [] }) }) })
    render(<IgiTodoClient />)
    await waitFor(() => expect(screen.getByTestId('empty')).toBeInTheDocument())
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

  it('flags a model below the level LoveLab want, and says how short beside their level', async () => {
    mockFetch()
    render(<IgiStockClient />)
    // m1 holds 900 against a level of 1000.
    await waitFor(() => expect(screen.getByText('Produce more')).toBeInTheDocument())
    const row = screen.getByText('Produce more').closest('tr')
    expect(row).toHaveClass('low')
    // Sam, 18 Sept 2026: he scanned the level column and saw nothing there.
    expect(within(within(row).getByTestId('level')).getByTestId('short-by')).toHaveTextContent('short by 100')
    expect(screen.getByTestId('low-count')).toHaveTextContent('1 below the level LoveLab want')
    expect(screen.getByText('LoveLab want at least')).toBeInTheDocument()
  })

  it('sorts the models below the level to the top', async () => {
    mockFetch({
      '/stock': () => Promise.resolve({ ok: true, json: async () => ({ models: [MODELS[1], MODELS[0]] }) }),
    })
    render(<IgiStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('stock-row')).toHaveLength(2))
    const rows = screen.getAllByTestId('stock-row')
    expect(rows[0]).toHaveTextContent('Cuty-Cubix')
    expect(rows[0]).toHaveClass('low')
    expect(rows[1]).not.toHaveClass('low')
  })

  it('never shows a figure below zero — it says what was over-issued instead, and cannot be corrected', async () => {
    // More certificates issued than batches recorded: 250 made, 252 issued.
    mockFetch({
      '/stock': () => Promise.resolve({ ok: true, json: async () => ({ models: [{ ...MODELS[0], pool: -2, level: 100 }] }) }),
      '/todo': () => Promise.resolve({ ok: true, json: async () => ({ visits: [], produce: [{ ...MODELS[0], pool: -2, level: 100, short_by: 102 }] }) }),
    })
    render(<IgiStockClient />)
    await waitFor(() => expect(screen.getByTestId('you-hold')).toBeInTheDocument())
    expect(screen.getByTestId('you-hold')).toHaveTextContent(/^0/)
    expect(screen.getByTestId('you-hold')).not.toHaveTextContent('-2')
    expect(screen.getByTestId('over-issued')).toHaveTextContent('2 over-issued')
    expect(screen.getByTestId('over-issued')).toHaveAttribute('title', expect.stringContaining('Add a batch'))
    expect(screen.queryByTestId('correct')).toBeNull()
    // The shortfall is still the real gap: 100 wanted, 2 in the hole.
    expect(screen.getByTestId('short-by')).toHaveTextContent('short by 102')

    render(<IgiTodoClient />)
    const line = await screen.findByTestId('produce-line')
    expect(line).toHaveTextContent('You hold0')
    expect(line).not.toHaveTextContent('-2')
    expect(line).toHaveTextContent('Short by102')
  })

  it('shows the level but offers nothing to edit — it is LoveLab\'s to set', async () => {
    // Sam, 16 Sept 2026: one level, set by the customer. "Warn me below" is gone.
    mockFetch()
    const { container } = render(<IgiStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('level')).toHaveLength(2))
    expect(screen.getAllByTestId('level')[0]).toHaveTextContent('1 000')
    expect(screen.getAllByTestId('level')[1]).toHaveTextContent('no level')
    expect(container.querySelector('input[type="number"]')).toBeNull()
    expect(screen.queryByText(/Warn me below/)).toBeNull()
  })
})

describe('IGI: correcting what they hold (Sam, 18 Sept 2026)', () => {
  it('turns the figure into a box, sends the count, and says what changed', async () => {
    let body = null
    mockFetch({
      '/counts': (init) => { body = JSON.parse(init.body); return Promise.resolve({ ok: true, json: async () => ({ count: { id: 'c1' }, pool: 850 }) }) },
    })
    render(<IgiStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('correct')).toHaveLength(2))

    fireEvent.click(screen.getAllByTestId('correct')[0])
    const box = screen.getByTestId('counted')
    expect(box).toHaveValue(900)
    fireEvent.change(box, { target: { value: '850' } })
    fireEvent.click(screen.getByTestId('counted-save'))

    await waitFor(() => expect(body).toEqual({ model_id: 'm1', counted: 850 }))
    expect(await screen.findByTestId('notice')).toHaveTextContent('Corrected: Cuty-Cubix now 850 (was 900)')
    expect(screen.queryByTestId('counted')).toBeNull()
  })

  it('sends nothing when the number is unchanged or the box is cancelled', async () => {
    const calls = []
    mockFetch({ '/counts': (init) => { calls.push(init); return Promise.resolve({ ok: true, json: async () => ({}) }) } })
    render(<IgiStockClient />)
    await waitFor(() => expect(screen.getAllByTestId('correct')).toHaveLength(2))
    fireEvent.click(screen.getAllByTestId('correct')[0])
    fireEvent.click(screen.getByTestId('counted-save'))
    expect(calls).toHaveLength(0)
    expect(screen.queryByTestId('counted')).toBeNull()

    fireEvent.click(screen.getAllByTestId('correct')[1])
    fireEvent.change(screen.getByTestId('counted'), { target: { value: '3' } })
    fireEvent.click(screen.getByTestId('counted-cancel'))
    expect(calls).toHaveLength(0)
    expect(screen.queryByTestId('counted')).toBeNull()
  })

  it('shows a count on History beside the batches, with the difference', async () => {
    mockFetch({
      '/history': () => Promise.resolve({ ok: true, json: async () => ({
        visits: [],
        batches: [{ id: 'b1', model_id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', qty: 1000, batch_date: '2026-08-27', reference: 'initial order' }],
        counts: [{ id: 'c1', model_id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', was: 1000, counted: 950, delta: -50, note: null, counted_at: '2026-09-18T10:00:00Z' }],
      }) }),
    })
    render(<IgiHistoryClient />)
    await waitFor(() => expect(screen.getByTestId('tab-batches')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('tab-batches'))
    const row = await screen.findByTestId('history-count')
    expect(row).toHaveTextContent('Count')
    expect(row).toHaveTextContent('1 000 → 950')
    expect(row).toHaveTextContent('-50')
    expect(screen.getByTestId('history-batch')).toBeInTheDocument()
  })
})

describe('IGI: produce more, on the To do', () => {
  it('lists every model below the level LoveLab want, with the shortfall', async () => {
    mockFetch()
    render(<IgiTodoClient />)
    await waitFor(() => expect(screen.getByTestId('produce-more')).toBeInTheDocument())
    const line = screen.getByTestId('produce-line')
    expect(line).toHaveTextContent('Cuty-Cubix')
    expect(line).toHaveTextContent('900')
    expect(line).toHaveTextContent('1 000')
    expect(line).toHaveTextContent('100')
    expect(screen.getByText(/1 model to produce/)).toBeInTheDocument()
  })

  it('shows no such list when nothing is below the level', async () => {
    mockFetch({ '/todo': () => Promise.resolve({ ok: true, json: async () => ({ visits: VISITS, produce: [] }) }) })
    render(<IgiTodoClient />)
    await waitFor(() => expect(screen.getAllByTestId('todo-card')).toHaveLength(1))
    expect(screen.queryByTestId('produce-more')).toBeNull()
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
