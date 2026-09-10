import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import CertificatesModelsClient from '../CertificatesModelsClient'

/**
 * The models register: LoveLab add a model here, IGI number it on their side.
 */
const MODELS = [
  { id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', stones: '1', carat: 0.1, shape: 'Round', spec: null, state: 'in_use', qty_ordered: 12250, pool: 11020, shelf: 1006 },
  { id: 'm-wait', serial: null, name: 'Full Moonlight', stones: '1', carat: 0.5, shape: 'Round', spec: null, state: 'awaiting_serial', qty_ordered: null, pool: null, shelf: null },
  { id: 'm9', serial: 'LGAJ6588', name: '—', stones: '4', carat: 0.8, shape: 'Round', spec: null, state: 'reserved', qty_ordered: null, pool: null, shelf: null },
]

function mockFetch(onPost) {
  global.fetch = jest.fn((url, init) => {
    if (init?.method === 'POST') return onPost(JSON.parse(init.body))
    return Promise.resolve({ ok: true, json: async () => ({ models: MODELS }) })
  })
}

beforeEach(() => jest.clearAllMocks())

describe('models & serials', () => {
  it('shows the models in use and the one waiting for IGI', async () => {
    mockFetch()
    render(<CertificatesModelsClient />)
    await waitFor(() => expect(screen.getAllByTestId('model-row')).toHaveLength(1))
    expect(screen.getByTestId('awaiting-serial')).toHaveTextContent('Full Moonlight')
    expect(screen.getByTestId('awaiting-serial')).toHaveTextContent('Waiting for IGI')
    expect(screen.queryByText(/agreed with IGI directly/)).toBeNull()
  })

  it('adds a model and puts it under "waiting for IGI"', async () => {
    const posted = []
    mockFetch(async (body) => {
      posted.push(body)
      return { ok: true, json: async () => ({ model: { id: 'm-2', ...body, spec: null, state: 'awaiting_serial', requested_at: '2026-09-10T09:00:00Z' } }) }
    })
    render(<CertificatesModelsClient />)
    await waitFor(() => expect(screen.getByTestId('new-model-form')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('new-model-name'), { target: { value: 'Shapy Shine XL' } })
    fireEvent.change(screen.getByTestId('new-model-stones'), { target: { value: '6+1' } })
    fireEvent.change(screen.getByTestId('new-model-carat'), { target: { value: '1.2' } })
    fireEvent.change(screen.getByTestId('new-model-shape'), { target: { value: 'Oval' } })
    fireEvent.click(screen.getByTestId('new-model-submit'))

    await waitFor(() => expect(screen.getAllByTestId('awaiting-row')).toHaveLength(2))
    expect(posted[0]).toEqual({ name: 'Shapy Shine XL', stones: '6+1', carat: 1.2, shape: 'Oval' })
    expect(screen.getByTestId('notice')).toHaveTextContent("on IGI's To do")
    expect(screen.getByTestId('new-model-name')).toHaveValue('')
  })

  it('shows the reason when the server refuses', async () => {
    mockFetch(async () => ({ ok: false, json: async () => ({ error: 'How many stones? A number, or a sum like 6+1.' }) }))
    render(<CertificatesModelsClient />)
    await waitFor(() => expect(screen.getByTestId('new-model-form')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('new-model-name'), { target: { value: 'X' } })
    fireEvent.change(screen.getByTestId('new-model-carat'), { target: { value: '1' } })
    fireEvent.click(screen.getByTestId('new-model-submit'))
    await waitFor(() => expect(screen.getByText(/How many stones/)).toBeInTheDocument())
    expect(screen.getAllByTestId('awaiting-row')).toHaveLength(1)
  })
})
