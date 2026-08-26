/**
 * Agent Orders tab — view and search that agent’s orders.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import AgentOrdersTab from '../AgentOrdersTab'

const docs = [
  {
    id: 'd-caprice',
    document_type: 'order',
    status: 'sent',
    created_at: '2026-07-16T10:00:00.000Z',
    client_company: '',
    client_name: 'Sophie',
    total_amount: 2006,
    events: { name: 'INHORGENTA' },
    metadata: { formState: { companyName: 'SAS Caprice' } },
  },
  {
    id: 'd-farandole',
    document_type: 'order',
    status: 'sent',
    created_at: '2026-07-10T10:00:00.000Z',
    client_company: 'FARANDOLE',
    client_name: 'Valerie',
    total_amount: 1841,
    events: { name: 'Direct' },
  },
  {
    id: 'd-draft',
    document_type: 'order',
    status: 'draft',
    client_company: 'HIDDEN DRAFT',
    total_amount: 10,
  },
]

describe('AgentOrdersTab', () => {
  it('lists sent orders and hides drafts', () => {
    render(<AgentOrdersTab documents={docs} />)
    expect(screen.getByTestId('agent-order-row-d-caprice')).toHaveTextContent('SAS Caprice')
    expect(screen.getByTestId('agent-order-row-d-farandole')).toHaveTextContent('FARANDOLE')
    expect(screen.queryByText('HIDDEN DRAFT')).not.toBeInTheDocument()
    expect(screen.getByText('2 orders')).toBeInTheDocument()
  })

  it('filters to one company when you type', () => {
    render(<AgentOrdersTab documents={docs} />)
    fireEvent.change(screen.getByRole('searchbox', { name: /search this agent/i }), {
      target: { value: 'caprice' },
    })
    expect(screen.getByTestId('agent-order-row-d-caprice')).toBeInTheDocument()
    expect(screen.queryByTestId('agent-order-row-d-farandole')).not.toBeInTheDocument()
    expect(screen.getByText(/1 order matching your search/)).toBeInTheDocument()
  })

  it('says when nothing matches', () => {
    render(<AgentOrdersTab documents={docs} />)
    fireEvent.change(screen.getByRole('searchbox', { name: /search this agent/i }), {
      target: { value: 'nobody' },
    })
    expect(screen.getByText('No orders match your search.')).toBeInTheDocument()
  })

  it('says when the agent has no orders', () => {
    render(<AgentOrdersTab documents={[]} />)
    expect(screen.getByText('No orders yet.')).toBeInTheDocument()
  })
})
