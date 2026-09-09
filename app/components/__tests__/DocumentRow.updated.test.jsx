/**
 * DocumentRow — "updated <date>" beside the created date.
 *
 * Sam, 9 Sept 2026: an order re-saved a week after it was created showed
 * only its original date, so nobody could tell it had just been touched.
 * The row now says when it was last changed, but only when that is
 * meaningfully later than creation — every save nudges updated_at by a
 * few seconds and that is not news.
 */
import { render, screen } from '@testing-library/react'
import DocumentRow, { wasUpdatedLater } from '../DocumentRow'

jest.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key) => key }) }))
jest.mock('@/lib/styles', () => ({
  colors: { inkPlum: '#5D3A5E', lineGray: '#eaeaea', luxeGold: '#c9a84c' },
  fonts: { body: 'inherit' },
}))
jest.mock('@/lib/utils', () => ({ fmt: (value) => `€${value}`, fmtRevenue: (value) => `€${value}` }))

const baseDoc = {
  id: 'doc-1',
  client_company: 'Nanau Vertriebsgesellschaft mbH',
  document_type: 'order',
  status: 'sent',
  total_amount: 2497.5,
  created_at: '2026-09-02T10:00:00.000Z',
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

describe('wasUpdatedLater', () => {
  test('true when the last change is well after creation', () => {
    expect(wasUpdatedLater({ created_at: '2026-09-02T10:00:00Z', updated_at: '2026-09-09T09:28:00Z' })).toBe(true)
  })
  test('false within the grace window of a normal save', () => {
    expect(wasUpdatedLater({ created_at: '2026-09-02T10:00:00Z', updated_at: '2026-09-02T10:02:00Z' })).toBe(false)
  })
  test('false without an updated_at, or with garbage', () => {
    expect(wasUpdatedLater({ created_at: '2026-09-02T10:00:00Z' })).toBe(false)
    expect(wasUpdatedLater({ created_at: 'nope', updated_at: '2026-09-09T09:28:00Z' })).toBe(false)
    expect(wasUpdatedLater(null)).toBe(false)
  })
})

describe('DocumentRow updated label', () => {
  test('shows the updated date when the order was changed later', () => {
    renderRow({ updated_at: '2026-09-09T09:28:00.000Z' })
    const label = screen.getByTestId('document-updated')
    expect(label).toHaveTextContent('docs.updated 9 Sept 2026')
    expect(label.title).toContain('2 Sept 2026')
    expect(label.title).toContain('9 Sept 2026')
  })

  test('the created date is still shown alongside', () => {
    renderRow({ updated_at: '2026-09-09T09:28:00.000Z' })
    expect(screen.getByText('2 Sept 2026')).toBeInTheDocument()
  })

  test('no label when the only change was the save itself', () => {
    renderRow({ updated_at: '2026-09-02T10:00:40.000Z' })
    expect(screen.queryByTestId('document-updated')).toBeNull()
  })

  test('no label when updated_at is missing', () => {
    renderRow({})
    expect(screen.queryByTestId('document-updated')).toBeNull()
  })
})
