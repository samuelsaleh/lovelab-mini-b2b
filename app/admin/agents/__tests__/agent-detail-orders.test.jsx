/**
 * Admin agent detail — new Orders tab (view + search that agent’s orders).
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'agent-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}))

jest.mock('@/app/components/CommissionReportsCard', () => () => <div />)
jest.mock('@/app/components/AgentFolderBrowser', () => () => <div />)
jest.mock('@/app/components/ContractChatPanel', () => () => <div />)
jest.mock('@/app/components/SynaliaAgentTab', () => () => <div />)
jest.mock('@/app/components/AddBonusModal', () => () => <div />)
jest.mock('@/app/components/AddQuickOrderModal', () => () => <div />)
jest.mock('@/app/components/NewClientBonusModal', () => () => <div />)

import AdminAgentDetailsPage from '../[id]/page'

const AGENT = {
  id: 'agent-1',
  full_name: 'Silke Agent',
  email: 'silke@example.com',
  commission_rate: 15,
  organization_id: null,
  is_agent: true,
  agent_status: 'active',
  new_client_bonus_mode: 'off',
  new_client_bonus_enabled: false,
  new_client_bonus_amount: 0,
}

const DOCS = [
  {
    id: 'd-caprice',
    document_type: 'order',
    status: 'sent',
    created_at: '2026-07-16T10:00:00.000Z',
    client_company: 'SAS Caprice',
    client_name: 'Sophie',
    total_amount: 2006,
    events: { name: 'INHORGENTA' },
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
]

const json = (body) => Promise.resolve({ ok: true, json: async () => body })

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    const href = String(url)
    if (href.startsWith('/api/agents')) return json({ agents: [AGENT] })
    if (href.startsWith('/api/commissions?')) return json({ commissions: [], summary: {} })
    if (href.startsWith('/api/agent-payments')) return json({ payments: [] })
    if (href.startsWith('/api/commission-reports')) return json({ reports: [] })
    if (href.startsWith('/api/documents')) return json({ documents: DOCS, total_count: DOCS.length })
    return json({})
  })
})

describe('AdminAgentDetailsPage — Orders tab', () => {
  it('opens a searchable list of this agent’s orders without changing Financials', async () => {
    render(<AdminAgentDetailsPage />)
    expect(await screen.findByRole('button', { name: /^Orders/ })).toBeInTheDocument()
    expect(screen.getByText('Orders & Commission')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Orders/ }))
    expect(await screen.findByTestId('agent-orders-tab')).toBeInTheDocument()
    expect(screen.getByTestId('agent-order-row-d-caprice')).toBeInTheDocument()
    expect(screen.getByTestId('agent-order-row-d-farandole')).toBeInTheDocument()
    expect(screen.queryByText('Orders & Commission')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: /search this agent/i }), {
      target: { value: 'caprice' },
    })
    expect(screen.getByTestId('agent-order-row-d-caprice')).toBeInTheDocument()
    expect(screen.queryByTestId('agent-order-row-d-farandole')).not.toBeInTheDocument()
  })
})
