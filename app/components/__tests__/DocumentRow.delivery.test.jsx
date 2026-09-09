/**
 * DocumentRow — the client email's delivery outcome on the order row.
 *
 * Sam, 9 Sept 2026: an order confirmation bounced for the client and nobody
 * knew. The row now shows what Resend reported (emailed / delivered /
 * delayed / bounced), with the reason and what to do in the tooltip.
 */
import { render, screen } from '@testing-library/react'
import DocumentRow, { clientEmailDelivery, deliveryPill } from '../DocumentRow'

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
  created_at: '2026-09-09T09:28:00.000Z',
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

describe('deliveryPill', () => {
  test('maps each status to a label and tone', () => {
    expect(deliveryPill({ status: 'delivered' }).label).toMatch(/delivered/)
    expect(deliveryPill({ status: 'bounced' }).label).toMatch(/bounced/)
    expect(deliveryPill({ status: 'complained' }).label).toMatch(/spam/)
    expect(deliveryPill({ status: 'delivery_delayed' }).label).toMatch(/delayed/)
    expect(deliveryPill({ status: 'sent' }).label).toMatch(/emailed/)
    expect(deliveryPill(null)).toBeNull()
  })
})

describe('clientEmailDelivery', () => {
  test('prefers the newest embedded order-confirmation row over metadata', () => {
    const doc = {
      metadata: { client_email: { status: 'sent' } },
      email_deliveries: [
        { kind: 'order_confirmation', status: 'delivered', sent_at: '2026-09-09T09:28:00Z' },
        { kind: 'internal_notice', status: 'bounced', sent_at: '2026-09-09T09:29:00Z' },
      ],
    }
    expect(clientEmailDelivery(doc).status).toBe('delivered')
  })
  test('falls back to the mirrored metadata', () => {
    expect(clientEmailDelivery({ metadata: { client_email: { status: 'bounced' } } }).status).toBe('bounced')
  })
})

describe('DocumentRow delivery badge', () => {
  test('shows a bounce with the reason and advice in the tooltip', () => {
    renderRow({
      metadata: {
        client_email: {
          status: 'bounced', recipient: 'hej@hejskat.com',
          detail: '550 5.1.1 user unknown', advice: 'The address does not exist. Check the spelling with the client and send again.',
        },
      },
    })
    const badge = screen.getByTestId('document-delivery')
    expect(badge).toHaveTextContent('✗ email bounced')
    expect(badge.dataset.status).toBe('bounced')
    expect(badge.title).toContain('hej@hejskat.com')
    expect(badge.title).toContain('Check the spelling')
  })

  test('shows delivered from the embedded tracking rows', () => {
    renderRow({ email_deliveries: [{ kind: 'order_confirmation', status: 'delivered', recipient: 'hej@hejskat.com', sent_at: '2026-09-09T09:28:00Z' }] })
    expect(screen.getByTestId('document-delivery')).toHaveTextContent('✓ email delivered')
  })

  test('shows nothing when no client email was ever sent', () => {
    renderRow({})
    expect(screen.queryByTestId('document-delivery')).toBeNull()
  })
})
