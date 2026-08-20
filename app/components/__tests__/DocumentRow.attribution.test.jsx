/**
 * DocumentRow — the creator/agent name on every row.
 *
 * Sam Aug 2026: an order arriving from a team member was indistinguishable from
 * anyone else's; the row showed client, type, amount, date and fair only. The
 * API already embedded creator and agent — the UI dropped them.
 */

import { render, screen, within } from '@testing-library/react'
import DocumentRow from '../DocumentRow'

jest.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key) => key }) }))
jest.mock('@/lib/styles', () => ({
  colors: { inkPlum: '#5D3A5E', lineGray: '#eaeaea', luxeGold: '#c9a84c' },
  fonts: { body: 'inherit' },
}))
jest.mock('@/lib/utils', () => ({ fmt: (value) => `€${value}` }))

const baseDoc = {
  id: 'doc-1',
  client_company: 'BIJOUTERIE CURIOZA',
  document_type: 'order',
  status: 'sent',
  total_amount: 2585,
  created_at: '2026-07-07T10:00:00.000Z',
}

function renderRow(doc) {
  return render(
    <DocumentRow
      doc={{ ...baseDoc, ...doc }}
      mobile={false}
      isAdmin
      canEdit={false}
      onDownload={jest.fn()}
      onDelete={jest.fn()}
      onRequestInternal={jest.fn()}
      renamingDocId={null}
      docRenameValue=""
      setDocRenameValue={jest.fn()}
      commitDocRename={jest.fn()}
      startDocRename={jest.fn()}
      docRenameLoading={false}
    />,
  )
}

describe('DocumentRow attribution', () => {
  test('names the agent who made the order', () => {
    renderRow({
      creator: { full_name: 'Wassila Mekidiche', email: 'wassila@example.com' },
      agent: { full_name: 'Wassila Mekidiche', email: 'wassila@example.com' },
    })
    expect(screen.getByTestId('document-attribution')).toHaveTextContent('by Wassila Mekidiche')
  })

  test('credits the agent and names the person who typed it when they differ', () => {
    renderRow({
      creator: { full_name: 'Sam Saleh', email: 'sam@example.com' },
      agent: { full_name: 'Ruby Robin', email: 'ruby@example.com' },
    })
    const label = screen.getByTestId('document-attribution')
    expect(label).toHaveTextContent('by Ruby Robin (via Sam Saleh)')
    expect(label).toHaveAttribute('title', 'Sold by Ruby Robin, entered by Sam Saleh')
  })

  test('works with only a creator embedded', () => {
    renderRow({ creator: { full_name: 'Caren Melkonian' } })
    expect(screen.getByTestId('document-attribution')).toHaveTextContent('by Caren Melkonian')
  })

  test('does not repeat the name that the assistant badge already shows', () => {
    renderRow({
      creator_is_assistant: true,
      creator: { full_name: 'Hannah Hinet', email: 'hannah@example.com' },
    })
    expect(screen.getByText('Assistant · Hannah Hinet')).toBeInTheDocument()
    expect(screen.queryByTestId('document-attribution')).not.toBeInTheDocument()
  })

  test('an assistant typing for an agent still shows who owns the sale', () => {
    renderRow({
      creator_is_assistant: true,
      creator: { full_name: 'Hannah Hinet', email: 'hannah@example.com' },
      agent: { full_name: 'Wassila Mekidiche', email: 'wassila@example.com' },
    })
    expect(screen.getByText('Assistant · Hannah Hinet')).toBeInTheDocument()
    expect(screen.getByTestId('document-attribution'))
      .toHaveTextContent('by Wassila Mekidiche (via Hannah Hinet)')
  })

  test('a document without embedded people renders without the label and without crashing', () => {
    renderRow({})
    expect(screen.getByText('BIJOUTERIE CURIOZA')).toBeInTheDocument()
    expect(screen.queryByTestId('document-attribution')).not.toBeInTheDocument()
  })

  test('the existing amount, date and fair metadata stay on the row', () => {
    renderRow({
      creator: { full_name: 'Ruby Robin' },
      events: { name: 'Bijorhca 2026' },
    })
    const row = screen.getByText('BIJOUTERIE CURIOZA').closest('div').parentElement
    expect(within(row).getByText('€2585')).toBeInTheDocument()
    expect(within(row).getByText('7 Jul 2026')).toBeInTheDocument()
    expect(within(row).getByText('@ Bijorhca 2026')).toBeInTheDocument()
  })
})
