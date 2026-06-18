/**
 * ResponsiveTable — the shared table/card primitive used to make wide data
 * tables usable on phones and iPad portrait.
 *
 * Guarantees:
 *   - Desktop (compact=false) renders a real <table>.
 *   - Compact (compact=true) renders a stacked CARD list, never a <table>.
 *   - Data (primary + field values) renders in both branches.
 *   - cardActions render in both branches.
 *   - Empty state renders when there are no rows.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import ResponsiveTable from '../ResponsiveTable'

const columns = [
  { key: 'name', label: 'Name', primary: true },
  { key: 'total', label: 'Total', align: 'right', render: (r) => `€${r.total}` },
  { key: 'status', label: 'Status' },
]

const rows = [
  { id: 'a', name: 'Acme', total: 1000, status: 'Paid' },
  { id: 'b', name: 'Globex', total: 250, status: 'Pending' },
]

describe('ResponsiveTable — layout branches', () => {
  it('renders a <table> on desktop', () => {
    const { container } = render(
      <ResponsiveTable columns={columns} rows={rows} rowKey={(r) => r.id} compact={false} />
    )
    expect(container.querySelector('table')).toBeInTheDocument()
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('€1000')).toBeInTheDocument()
  })

  it('renders cards (no <table>) when compact', () => {
    const { container } = render(
      <ResponsiveTable columns={columns} rows={rows} rowKey={(r) => r.id} compact />
    )
    expect(container.querySelector('table')).not.toBeInTheDocument()
    expect(container.querySelector('[data-variant="cards"]')).toBeInTheDocument()
    // Both rows' data still present in the card layout.
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('Globex')).toBeInTheDocument()
    expect(screen.getByText('€250')).toBeInTheDocument()
  })

  it('renders cardActions in both branches', () => {
    const actions = (r) => <button>open-{r.id}</button>
    const desktop = render(
      <ResponsiveTable columns={columns} rows={rows} rowKey={(r) => r.id} compact={false} cardActions={actions} />
    )
    expect(desktop.getAllByRole('button', { name: /open-/ })).toHaveLength(2)
    desktop.unmount()

    const compact = render(
      <ResponsiveTable columns={columns} rows={rows} rowKey={(r) => r.id} compact cardActions={actions} />
    )
    expect(compact.getAllByRole('button', { name: /open-/ })).toHaveLength(2)
  })

  it('shows the empty state when there are no rows', () => {
    render(<ResponsiveTable columns={columns} rows={[]} emptyText="Nothing here" compact />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })
})
