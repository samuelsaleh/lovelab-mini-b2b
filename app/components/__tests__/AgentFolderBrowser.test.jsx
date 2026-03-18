/**
 * AgentFolderBrowser B2B/B2C virtual folder tests
 *
 * Covers:
 *   - B2B Orders virtual folder renders with correct count
 *   - B2C Orders virtual folder renders with correct count
 *   - Expanding B2B folder shows B2B documents
 *   - Expanding B2C folder shows B2C documents
 *   - Empty state shown when no documents in a channel
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock folder/file API calls (return empty)
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ folders: [], files: [] }),
  })
)

import AgentFolderBrowser from '../AgentFolderBrowser'

const B2B_DOC = {
  id: 'doc-b2b-1',
  document_type: 'order',
  order_channel: 'b2b',
  client_company: 'Boutique Paris',
  total_amount: 1500,
  created_at: '2025-01-15T10:00:00Z',
}

const B2C_DOC = {
  id: 'doc-b2c-1',
  document_type: 'order',
  order_channel: 'b2c',
  client_company: 'Online Store',
  total_amount: 300,
  created_at: '2025-02-20T12:00:00Z',
}

const DOCS = [B2B_DOC, B2C_DOC]

describe('AgentFolderBrowser — B2B/B2C virtual folders', () => {
  it('renders B2B Orders virtual folder with count', async () => {
    render(<AgentFolderBrowser agentId="agent-1" orderDocuments={DOCS} />)
    await waitFor(() => {
      expect(screen.getByTestId('virtual-folder-b2b')).toBeInTheDocument()
    })
    expect(screen.getByTestId('virtual-folder-b2b').textContent).toContain('B2B Orders')
    expect(screen.getByTestId('virtual-folder-b2b').textContent).toContain('(1)')
  })

  it('renders B2C Orders virtual folder with count', async () => {
    render(<AgentFolderBrowser agentId="agent-1" orderDocuments={DOCS} />)
    await waitFor(() => {
      expect(screen.getByTestId('virtual-folder-b2c')).toBeInTheDocument()
    })
    expect(screen.getByTestId('virtual-folder-b2c').textContent).toContain('B2C Orders')
    expect(screen.getByTestId('virtual-folder-b2c').textContent).toContain('(1)')
  })

  it('expands B2B folder and shows B2B document', async () => {
    render(<AgentFolderBrowser agentId="agent-1" orderDocuments={DOCS} />)
    await waitFor(() => expect(screen.getByTestId('virtual-folder-b2b')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('virtual-folder-b2b'))
    expect(screen.getByText(/Boutique Paris/i)).toBeInTheDocument()
    expect(screen.queryByText(/Online Store/i)).not.toBeInTheDocument()
  })

  it('expands B2C folder and shows B2C document', async () => {
    render(<AgentFolderBrowser agentId="agent-1" orderDocuments={DOCS} />)
    await waitFor(() => expect(screen.getByTestId('virtual-folder-b2c')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('virtual-folder-b2c'))
    expect(screen.getByText(/Online Store/i)).toBeInTheDocument()
    expect(screen.queryByText(/Boutique Paris/i)).not.toBeInTheDocument()
  })

  it('shows empty state when B2C folder has no docs', async () => {
    render(<AgentFolderBrowser agentId="agent-1" orderDocuments={[B2B_DOC]} />)
    await waitFor(() => expect(screen.getByTestId('virtual-folder-b2c')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('virtual-folder-b2c'))
    expect(screen.getByText(/no b2c orders yet/i)).toBeInTheDocument()
  })

  it('docs without order_channel default to B2B', async () => {
    const noChannelDoc = { ...B2B_DOC, id: 'doc-noc', order_channel: undefined, client_company: 'Legacy Corp' }
    render(<AgentFolderBrowser agentId="agent-1" orderDocuments={[noChannelDoc]} />)
    await waitFor(() => expect(screen.getByTestId('virtual-folder-b2b')).toBeInTheDocument())
    expect(screen.getByTestId('virtual-folder-b2b').textContent).toContain('(1)')
    expect(screen.getByTestId('virtual-folder-b2c').textContent).toContain('(0)')
  })
})
