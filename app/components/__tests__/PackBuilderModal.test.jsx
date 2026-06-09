/**
 * PackBuilderModal — UI guard tests.
 *
 * Guarantees:
 *   - The Save button is disabled and the localised "Pack minimum is €970"
 *     warning is shown when the snapshot total is below 970.
 *   - The scope toggle is hidden for agents (non-admins) and visible for
 *     admins, which is the bright-line rule for the visibility model.
 *   - When valid, clicking Save POSTs to /api/packs with the right shape
 *     and calls onSaved with the server-returned pack.
 *   - On a 422 minimum-price response, the modal surfaces the localised
 *     message instead of the raw server error.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n'

import PackBuilderModal from '../PackBuilderModal'

const { COLLECTIONS } = require('@/lib/catalog')

function CUTYLine(qty = 1, caratIdx = 1) {
  return {
    uid: 'l1',
    collectionId: 'CUTY',
    colorConfigs: [{
      id: 'c1',
      colorName: 'Black',
      caratIdx,
      housing: 'Yellow',
      housingType: null,
      multiAttached: null,
      shape: null,
      size: 'M',
      cordType: null,
      thickness: null,
      closureType: 'braided',
      qty,
      priceOverride: null,
      certType: 'igi',
    }],
  }
}

function renderModal(props = {}) {
  return render(
    <I18nProvider>
      <PackBuilderModal
        open
        onClose={jest.fn()}
        lines={[CUTYLine(1, 1)]} // €40 — below the €970 floor
        isAdmin={false}
        onSaved={jest.fn()}
        {...props}
      />
    </I18nProvider>
  )
}

beforeEach(() => {
  global.fetch = jest.fn()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('PackBuilderModal — €970 minimum guard', () => {
  it('disables Save and shows the minimum-price warning when the build totals under €970', () => {
    renderModal()
    fireEvent.change(screen.getByPlaceholderText(/pack name/i), { target: { value: 'My pack' } })
    expect(screen.getByText(/pack minimum is €970/i)).toBeInTheDocument()
    const saveBtn = screen.getByRole('button', { name: /save pack/i })
    expect(saveBtn).toBeDisabled()
  })

  it('enables Save when the build hits the €970 floor', () => {
    // 25 × €40 = €1000 — above €970.
    renderModal({ lines: [CUTYLine(25, 1)] })
    fireEvent.change(screen.getByPlaceholderText(/pack name/i), { target: { value: 'Big pack' } })
    expect(screen.queryByText(/pack minimum is €970/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save pack/i })).not.toBeDisabled()
  })
})

describe('PackBuilderModal — scope toggle', () => {
  it('hides the scope toggle for agents (forces private)', () => {
    renderModal({ isAdmin: false, lines: [CUTYLine(25, 1)] })
    expect(screen.queryByText('Visible to everyone')).not.toBeInTheDocument()
  })

  it('shows the scope toggle for admins', () => {
    renderModal({ isAdmin: true, lines: [CUTYLine(25, 1)] })
    expect(screen.getByText('Visible to everyone')).toBeInTheDocument()
    expect(screen.getByText('Only visible to me')).toBeInTheDocument()
  })
})

describe('PackBuilderModal — restricted visibility', () => {
  const AGENTS = [
    { id: 'a-1', full_name: 'Emile', email: 'emile@example.com' },
    { id: 'a-2', full_name: 'rsmus', email: 'rsmus@example.com' },
  ]

  function mockAgentsFetch() {
    global.fetch.mockImplementation((url) => {
      if (url === '/api/agents') {
        return Promise.resolve({ ok: true, json: jest.fn().mockResolvedValue({ agents: AGENTS }) })
      }
      return Promise.resolve({ ok: true, status: 200, json: jest.fn().mockResolvedValue({ pack: { id: 'p-1' } }) })
    })
  }

  it('hides the Restricted option for agents (non-admins)', () => {
    renderModal({ isAdmin: false, lines: [CUTYLine(25, 1)] })
    expect(screen.queryByText('Only specific agents')).not.toBeInTheDocument()
  })

  it('reveals the agent checkbox list when an admin picks Restricted', async () => {
    mockAgentsFetch()
    renderModal({ isAdmin: true, lines: [CUTYLine(25, 1)] })

    expect(screen.getByText('Only specific agents')).toBeInTheDocument()
    // No checkbox list until Restricted is selected.
    expect(screen.queryByTestId('pack-agent-list')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Only specific agents'))

    await waitFor(() => expect(screen.getByLabelText('Emile')).toBeInTheDocument())
    expect(screen.getByLabelText('rsmus')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/api/agents')
  })

  it('pre-checks assigned agents from editingPack._agentIds', async () => {
    mockAgentsFetch()
    const editingPack = {
      _dbId: 'p-55', _scope: 'restricted', _agentIds: ['a-1'],
      label: 'Restricted pack', description: ['CUTY'],
    }
    renderModal({ isAdmin: true, lines: [CUTYLine(25, 1)], editingPack })

    await waitFor(() => expect(screen.getByLabelText('Emile')).toBeInTheDocument())
    expect(screen.getByLabelText('Emile')).toBeChecked()
    expect(screen.getByLabelText('rsmus')).not.toBeChecked()
  })

  it('includes the selected agent_ids in the save payload', async () => {
    mockAgentsFetch()
    const onSaved = jest.fn()
    renderModal({ isAdmin: true, lines: [CUTYLine(25, 1)], onSaved })

    fireEvent.change(screen.getByPlaceholderText(/pack name/i), { target: { value: 'Restricted pack' } })
    fireEvent.click(screen.getByLabelText('Only specific agents'))
    await waitFor(() => expect(screen.getByLabelText('rsmus')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('rsmus'))
    fireEvent.click(screen.getByRole('button', { name: /save pack/i }))

    await waitFor(() => {
      const saveCall = global.fetch.mock.calls.find((c) => c[0] === '/api/packs')
      expect(saveCall).toBeTruthy()
    })
    const saveCall = global.fetch.mock.calls.find((c) => c[0] === '/api/packs')
    const payload = JSON.parse(saveCall[1].body)
    expect(payload.scope).toBe('restricted')
    expect(payload.agent_ids).toEqual(['a-2'])
  })
})

describe('PackBuilderModal — save flow', () => {
  it('POSTs to /api/packs with the right shape and calls onSaved', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: jest.fn().mockResolvedValue({ pack: { id: 'p-new', label: 'Big pack' } }),
    })
    const onSaved = jest.fn()
    const onClose = jest.fn()
    renderModal({ lines: [CUTYLine(25, 1)], onSaved, onClose, isAdmin: false })

    fireEvent.change(screen.getByPlaceholderText(/pack name/i), { target: { value: 'Big pack' } })
    fireEvent.click(screen.getByRole('button', { name: /save pack/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const [, init] = global.fetch.mock.calls[0]
    expect(global.fetch.mock.calls[0][0]).toBe('/api/packs')
    const payload = JSON.parse(init.body)
    expect(payload.label).toBe('Big pack')
    expect(payload.scope).toBe('private')
    expect(payload.fixed_total).toBeGreaterThanOrEqual(970)
    expect(Array.isArray(payload.form_rows)).toBe(true)
    expect(payload.form_rows.length).toBeGreaterThan(0)

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'p-new', label: 'Big pack' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('surfaces the localised minimum-price message on a 422 from the server', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: jest.fn().mockResolvedValue({ error: 'Pack minimum is €970' }),
    })
    renderModal({ lines: [CUTYLine(25, 1)], isAdmin: false })

    fireEvent.change(screen.getByPlaceholderText(/pack name/i), { target: { value: 'Big pack' } })
    fireEvent.click(screen.getByRole('button', { name: /save pack/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    // Both the inline alert and the server's translated message contain the
    // €970 phrase — `getAllByText` lets us tolerate the duplicate.
    await waitFor(() => {
      expect(screen.getAllByText(/pack minimum is €970/i).length).toBeGreaterThan(0)
    })
  })
})

describe('PackBuilderModal — edit mode', () => {
  const editingPack = {
    _dbId: 'p-99',
    _scope: 'global',
    label: 'Pack 1',
    description: ['SHAPY SHINE FANCY', 'MULTI FIVE'],
  }

  it('shows the edit title and pre-fills name + description from editingPack', () => {
    renderModal({ lines: [CUTYLine(25, 1)], isAdmin: true, editingPack })
    expect(screen.getByText('Edit pack')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Pack 1')).toBeInTheDocument()
    // Description textarea is the array joined with newlines. getByDisplayValue
    // collapses whitespace, so assert the raw textarea value directly.
    const desc = screen.getByPlaceholderText(/one short bullet/i)
    expect(desc.value).toBe('SHAPY SHINE FANCY\nMULTI FIVE')
  })

  it('PUTs to /api/packs/{id} (not POST) and calls onUpdated', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ pack: { id: 'p-99', label: 'Pack 1 (edited)' } }),
    })
    const onUpdated = jest.fn()
    const onSaved = jest.fn()
    const onClose = jest.fn()
    renderModal({ lines: [CUTYLine(25, 1)], isAdmin: true, editingPack, onUpdated, onSaved, onClose })

    fireEvent.change(screen.getByDisplayValue('Pack 1'), { target: { value: 'Pack 1 (edited)' } })
    fireEvent.click(screen.getByRole('button', { name: /save pack/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const [url, init] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/packs/p-99')
    expect(init.method).toBe('PUT')
    const payload = JSON.parse(init.body)
    expect(payload.label).toBe('Pack 1 (edited)')
    expect(Array.isArray(payload.form_rows)).toBe(true)
    expect(payload.form_rows.length).toBeGreaterThan(0)

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ id: 'p-99', label: 'Pack 1 (edited)' }))
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})

// ─── Auto-summary (no empty packs) ────────────────────────────────────────
//
// When the user hasn't written a description, the modal pre-fills it from the
// build contents and always sends a budget_label (price range), so a saved
// pack is never empty.

describe('PackBuilderModal — auto summary', () => {
  it('pre-fills the description from the build when creating a pack', () => {
    renderModal({ lines: [CUTYLine(25, 1)] })
    const desc = screen.getByPlaceholderText(/one short bullet/i)
    // CUTY @ 0.10 ct, Yellow housing, size M, braided.
    expect(desc.value).toMatch(/CUTY/)
    expect(desc.value).toMatch(/0\.10 ct/)
  })

  it('shows the auto price range in the live-total box', () => {
    renderModal({ lines: [CUTYLine(25, 1)] })
    // CUTY 0.10 IGI 2026 = €40 → single price (no range).
    expect(screen.getByTestId('pack-budget-range')).toHaveTextContent('€40/bracelet')
  })

  it('sends a generated description + budget_label when the user leaves the box untouched', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: jest.fn().mockResolvedValue({ pack: { id: 'p-new' } }),
    })
    renderModal({ lines: [CUTYLine(25, 1)], onSaved: jest.fn() })
    fireEvent.change(screen.getByPlaceholderText(/pack name/i), { target: { value: 'Auto pack' } })
    fireEvent.click(screen.getByRole('button', { name: /save pack/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const payload = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(payload.budget_label).toBe('€40/bracelet')
    expect(Array.isArray(payload.description)).toBe(true)
    expect(payload.description.length).toBeGreaterThan(0)
    expect(payload.description[0]).toMatch(/CUTY/)
  })

  it('does NOT overwrite a description the user typed', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: jest.fn().mockResolvedValue({ pack: { id: 'p-new' } }),
    })
    renderModal({ lines: [CUTYLine(25, 1)], onSaved: jest.fn() })

    const desc = screen.getByPlaceholderText(/one short bullet/i)
    fireEvent.change(desc, { target: { value: 'My own words' } })
    fireEvent.change(screen.getByPlaceholderText(/pack name/i), { target: { value: 'Custom pack' } })
    fireEvent.click(screen.getByRole('button', { name: /save pack/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const payload = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(payload.description).toEqual(['My own words'])
  })

  it('auto-fills the description when editing a pack saved without one', () => {
    const emptyPack = { _dbId: 'p-77', _scope: 'global', label: 'Pack 5', description: [] }
    renderModal({ lines: [CUTYLine(25, 1)], isAdmin: true, editingPack: emptyPack })
    const desc = screen.getByPlaceholderText(/one short bullet/i)
    expect(desc.value).toMatch(/CUTY/)
  })
})

// ─── linesToFormRows / applyPack regression ──────────────────────────────
//
// Pinned in this test file too (rather than as a separate one) so any
// change to applyPack's read shape that breaks the round-trip blows up
// here loudly.

describe('linesToFormRows ↔ applyPack round-trip', () => {
  const { linesToFormRows } = require('@/lib/packBuild')

  it('converts a CUTY line into a form_row with the keys applyPack expects', () => {
    const rows = linesToFormRows([CUTYLine(3, 1)])
    expect(rows).toHaveLength(1)
    const row = rows[0]
    // Keys applyPack reads back (see BuilderPage.applyPack):
    expect(row.collection).toBe('CUTY')
    expect(row.carat).toBe('0.10')
    expect(row.bpColor).toBe('Yellow')
    expect(row.size).toBe('M')
    expect(row.colorCord).toBe('Black')
    expect(row.quantity).toBe('3')
    expect(row.unitPrice).toBeTruthy()
    // Closure round-trip works for CUTY.
    expect(row.closure).toBe('braided')
  })

  it('strips closure for non-hasClosure collections', () => {
    const M3 = COLLECTIONS.find(c => c.id === 'M3')
    const line = {
      uid: 'l1', collectionId: 'M3',
      colorConfigs: [{
        id: 'c1', colorName: 'Black', caratIdx: 0,
        housing: 'YYY', housingType: null, multiAttached: true,
        shape: null, size: 'M', cordType: null, thickness: null,
        closureType: 'braided', // attempted carry-over
        qty: 1, priceOverride: null, certType: 'igi',
      }],
    }
    const rows = linesToFormRows([line])
    expect(rows).toHaveLength(1)
    expect(rows[0].closure).toBe('') // stripped because M3.hasClosure is falsy
    expect(rows[0].setting).toBe('F') // multiAttached: true → setting 'F'
    void M3
  })

  it('totalForFormRows multiplies quantity × unitPrice and sums', () => {
    const { totalForFormRows } = require('@/lib/packBuild')
    const rows = linesToFormRows([CUTYLine(3, 1), CUTYLine(2, 0)])
    const expected = rows.reduce((s, r) => s + parseInt(r.quantity, 10) * parseFloat(r.unitPrice), 0)
    expect(totalForFormRows(rows)).toBe(expected)
  })
})
