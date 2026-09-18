import React from 'react'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import CertificatesModelsClient from '../CertificatesModelsClient'

/**
 * The models register: one flat list, LoveLab add a model here, IGI number it
 * on their side, and the two levels per model that drive Stock are set here
 * (Sam, 16 Sept 2026).
 */
const MODELS = [
  { id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', stones: '1', carat: 0.1, shape: 'Round', spec: null, state: 'in_use', qty_ordered: 12250, pool: 11020, shelf: 1006, shelf_min: 25, order_min: null },
  { id: 'm-wait', serial: null, name: 'Full Moonlight', stones: '1', carat: 0.5, shape: 'Round', spec: null, state: 'awaiting_serial', qty_ordered: null, pool: null, shelf: null, shelf_min: null, order_min: null },
  { id: 'm9', serial: 'LGAJ6588', name: '—', stones: '4', carat: 0.8, shape: 'Round', spec: null, state: 'reserved', qty_ordered: null, pool: null, shelf: null, shelf_min: null, order_min: null },
]

function mockFetch({ onPost, onAlert, onDelete } = {}) {
  global.fetch = jest.fn((url, init) => {
    const u = String(url)
    if (init?.method === 'POST') return onPost(JSON.parse(init.body))
    if (init?.method === 'DELETE') {
      return onDelete
        ? onDelete(JSON.parse(init.body))
        : Promise.resolve({ ok: true, json: async () => ({ deleted: { id: 'm-wait', name: 'Full Moonlight' } }) })
    }
    if (u.includes('/api/igi/alerts')) {
      onAlert?.(JSON.parse(init.body))
      return Promise.resolve({ ok: true, json: async () => ({ updated: [] }) })
    }
    return Promise.resolve({ ok: true, json: async () => ({ models: MODELS }) })
  })
}

async function renderModels(opts) {
  mockFetch(opts)
  render(<CertificatesModelsClient />)
  await waitFor(() => expect(screen.getAllByTestId('model-row')).toHaveLength(1))
}

beforeEach(() => jest.clearAllMocks())

describe('models & serials — one flat list', () => {
  it('shows the models in use and the one waiting for IGI on the same list', async () => {
    await renderModels()
    const waiting = screen.getByTestId('awaiting-row')
    expect(within(waiting).getByTestId('model-name')).toHaveValue('Full Moonlight')
    expect(waiting).toHaveTextContent('Waiting for IGI’s serial')
    // Reserved serials are nobody's daily work; they are not shown at all.
    expect(screen.queryByText('LGAJ6588')).toBeNull()
    expect(screen.queryByText(/reserved/i)).toBeNull()
  })

  it('has no matching table of its own any more — a link at the foot instead', async () => {
    await renderModels()
    expect(screen.getByTestId('go-matching')).toHaveAttribute('href', '/certificates/matching')
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/igi/descriptions'), expect.anything())
  })

  it('keeps the New model form behind a button until it is needed', async () => {
    await renderModels()
    expect(screen.queryByTestId('new-model-form')).toBeNull()
    fireEvent.click(screen.getByTestId('new-model-toggle'))
    expect(screen.getByTestId('new-model-form')).toBeInTheDocument()
  })

  it('adds a model and puts it on the list as waiting for IGI', async () => {
    const posted = []
    await renderModels({
      onPost: async (body) => {
        posted.push(body)
        return { ok: true, json: async () => ({ model: { id: 'm-2', ...body, spec: null, state: 'awaiting_serial', requested_at: '2026-09-10T09:00:00Z' } }) }
      },
    })
    fireEvent.click(screen.getByTestId('new-model-toggle'))

    fireEvent.change(screen.getByTestId('new-model-name'), { target: { value: 'Shapy Shine XL' } })
    fireEvent.change(screen.getByTestId('new-model-stones'), { target: { value: '6+1' } })
    fireEvent.change(screen.getByTestId('new-model-carat'), { target: { value: '1.2' } })
    fireEvent.change(screen.getByTestId('new-model-shape'), { target: { value: 'Oval' } })
    fireEvent.click(screen.getByTestId('new-model-submit'))

    await waitFor(() => expect(screen.getAllByTestId('awaiting-row')).toHaveLength(2))
    expect(posted[0]).toEqual({ name: 'Shapy Shine XL', stones: '6+1', carat: 1.2, shape: 'Oval' })
    expect(screen.getByTestId('notice')).toHaveTextContent("on IGI's To do")
    // The form closes once the model is in.
    expect(screen.queryByTestId('new-model-form')).toBeNull()
  })

  it('shows the reason when the server refuses', async () => {
    await renderModels({
      onPost: async () => ({ ok: false, json: async () => ({ error: 'How many stones? A number, or a sum like 6+1.' }) }),
    })
    fireEvent.click(screen.getByTestId('new-model-toggle'))
    fireEvent.change(screen.getByTestId('new-model-name'), { target: { value: 'X' } })
    fireEvent.change(screen.getByTestId('new-model-carat'), { target: { value: '1' } })
    fireEvent.click(screen.getByTestId('new-model-submit'))
    await waitFor(() => expect(screen.getByText(/How many stones/)).toBeInTheDocument())
    expect(screen.getAllByTestId('awaiting-row')).toHaveLength(1)
  })
})

describe('the two levels per model are set here, not on Stock', () => {
  it('saves the shelf level when the box loses focus', async () => {
    const onAlert = jest.fn()
    await renderModels({ onAlert })
    const input = screen.getAllByTestId('shelf-min')[0]
    fireEvent.change(input, { target: { value: '75' } })
    fireEvent.blur(input)
    await waitFor(() => expect(onAlert).toHaveBeenCalledWith({ model_ids: ['m1'], shelf_min: 75 }))
    expect(await screen.findByTestId('notice')).toHaveTextContent('Collect')
  })

  it('saves our level on IGI’s stock, and empty means none', async () => {
    const onAlert = jest.fn()
    await renderModels({ onAlert })
    const input = screen.getAllByTestId('order-min')[0]
    expect(input).toHaveAttribute('placeholder', 'none')
    fireEvent.change(input, { target: { value: '500' } })
    fireEvent.blur(input)
    await waitFor(() => expect(onAlert).toHaveBeenCalledWith({ model_ids: ['m1'], order_min: 500 }))
    expect(await screen.findByTestId('notice')).toHaveTextContent('IGI see this level')
  })

  it('does not save a level that is not a whole number', async () => {
    const onAlert = jest.fn()
    await renderModels({ onAlert })
    const input = screen.getAllByTestId('shelf-min')[0]
    fireEvent.change(input, { target: { value: '-5' } })
    fireEvent.blur(input)
    expect(onAlert).not.toHaveBeenCalled()
    expect(input).toHaveValue(25)
  })
})

describe('a model still waiting for its serial can be removed (Sam, 18 Sept 2026)', () => {
  it('offers Remove on the waiting row only', async () => {
    await renderModels()
    expect(within(screen.getByTestId('awaiting-row')).getByTestId('delete-model')).toBeInTheDocument()
    expect(within(screen.getByTestId('model-row')).queryByTestId('delete-model')).toBeNull()
  })

  it('asks once, then removes the row and says nothing else changed', async () => {
    let sent = null
    await renderModels({
      onDelete: async (body) => { sent = body; return { ok: true, json: async () => ({ deleted: { id: 'm-wait', name: 'Full Moonlight' } }) } },
    })
    fireEvent.click(screen.getByTestId('delete-model'))
    expect(sent).toBeNull()
    expect(screen.getByText('Remove this model?')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('delete-model-confirm'))
    await waitFor(() => expect(sent).toEqual({ model_id: 'm-wait' }))
    await waitFor(() => expect(screen.queryByTestId('awaiting-row')).toBeNull())
    expect(screen.getByTestId('notice')).toHaveTextContent('Full Moonlight removed')
    expect(screen.getAllByTestId('model-row')).toHaveLength(1)
  })

  it('can be kept after all', async () => {
    await renderModels()
    fireEvent.click(screen.getByTestId('delete-model'))
    fireEvent.click(screen.getByTestId('delete-model-keep'))
    expect(screen.queryByText('Remove this model?')).toBeNull()
    expect(screen.getByTestId('awaiting-row')).toBeInTheDocument()
  })

  it('shows the server’s reason when it refuses, and keeps the row', async () => {
    await renderModels({
      onDelete: async () => ({ ok: false, json: async () => ({ error: 'LGAJ6530 is in use. A numbered model is never deleted.' }) }),
    })
    fireEvent.click(screen.getByTestId('delete-model'))
    fireEvent.click(screen.getByTestId('delete-model-confirm'))
    await waitFor(() => expect(screen.getByText(/never deleted/)).toBeInTheDocument())
    expect(screen.getByTestId('awaiting-row')).toBeInTheDocument()
  })
})
