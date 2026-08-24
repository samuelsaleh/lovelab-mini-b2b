/**
 * Visitor demo login must not print document totals.
 * Catalog prices in the builder stay on fmt() and are not covered here.
 */

import { render, screen } from '@testing-library/react'
import DocumentRow from '../DocumentRow'
import { setHideRevenue } from '@/lib/utils'

jest.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key) => key }) }))
jest.mock('@/lib/styles', () => ({
  colors: { inkPlum: '#5D3A5E', lineGray: '#eaeaea', luxeGold: '#c9a84c' },
  fonts: { body: 'inherit' },
}))

const doc = {
  id: 'doc-visitor',
  client_company: 'DEMO BOUTIQUE',
  document_type: 'order',
  status: 'sent',
  total_amount: 2585,
  created_at: '2026-07-07T10:00:00.000Z',
}

function renderRow() {
  return render(
    <DocumentRow
      doc={doc}
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

describe('DocumentRow visitor revenue hide', () => {
  afterEach(() => {
    setHideRevenue(false)
  })

  test('shows the real total for a normal admin', () => {
    renderRow()
    expect(screen.getByText(/2.?585/)).toBeInTheDocument()
  })

  test('replaces the total with a dash for the visitor demo account', () => {
    setHideRevenue(true)
    renderRow()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText(/2.?585/)).not.toBeInTheDocument()
  })
})
