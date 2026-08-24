import { render, screen } from '@testing-library/react'
import DocumentsAnalytics from '../DocumentsAnalytics'
import { setHideRevenue } from '@/lib/utils'

jest.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key) => key }) }))
jest.mock('@/lib/styles', () => ({
  colors: { inkPlum: '#5D3A5E', lineGray: '#eaeaea', lovelabMuted: '#999' },
}))

const docs = [
  {
    id: 'a',
    status: 'sent',
    total_amount: 1500,
    created_at: '2026-05-04T09:00:00Z',
  },
  {
    id: 'b',
    status: 'sent',
    total_amount: 1085,
    created_at: '2026-05-04T11:00:00Z',
  },
]

describe('DocumentsAnalytics visitor hide', () => {
  afterEach(() => {
    setHideRevenue(false)
  })

  test('shows the folder total for a normal admin', () => {
    render(<DocumentsAnalytics filteredDocs={docs} currentEventName="Milano" mobile={false} />)
    expect(screen.getAllByText(/2.?585/).length).toBeGreaterThan(0)
    expect(screen.getByText(/2 documents/)).toBeInTheDocument()
    expect(screen.getByText(/2 orders/)).toBeInTheDocument()
  })

  test('hides the folder total and order counts for the visitor', () => {
    setHideRevenue(true)
    render(<DocumentsAnalytics filteredDocs={docs} currentEventName="Milano" mobile={false} />)
    expect(screen.getByText('Milano')).toBeInTheDocument()
    expect(screen.queryByText(/2.?585/)).not.toBeInTheDocument()
    expect(screen.queryByText(/2 documents/)).not.toBeInTheDocument()
    expect(screen.queryByText(/2 orders/)).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
