/**
 * The Order Form as it opens after an existing order was edited in the
 * Builder and Finalized.
 *
 * This is the hand-off finalizeTransition (lib/editFlow.js) produces: the
 * Builder's quote for the rows, the saved form state for everything else, and
 * the document id kept. Before that helper, Finalize passed null for both and
 * the form fell back to the App-level client — the previous boutique — with
 * blank shipping notes, and offered a stale draft.
 *
 * The App-level `client` prop here is deliberately the WRONG boutique, to
 * prove the saved state wins.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n'
import { finalizeTransition } from '@/lib/editFlow'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))
jest.mock('@/lib/pdf', () => ({
  generatePDF: jest.fn(),
  downloadPDF: jest.fn(),
  formatDocumentFilename: jest.fn(() => 'order.pdf'),
}))
jest.mock('@/lib/vat', () => ({ validateVAT: jest.fn() }))
jest.mock('@/lib/packshot-lookup', () => ({ findPackshot: () => null }))
jest.mock('../PackshotThumb', () => ({
  __esModule: true,
  default: () => <div data-testid="packshot-thumb" />,
}))
jest.mock('../SaveDocumentModal', () => ({
  __esModule: true,
  default: () => null,
}))

const OrderForm = require('../OrderForm').default

const PREVIOUS_BOUTIQUE = { company: 'Previous Boutique', name: 'Someone Else', country: 'FR' }

// What the document had saved, before the client came back to change colours.
const SAVED = {
  companyName: 'Cerise',
  contactName: 'Janina Mummert',
  country: 'DE',
  remarks: 'Ship after the 15th. Pay by bank transfer.',
  shippingAmount: 25,
  hasPrepayment: true,
  prepaymentAmount: '200',
  prepaymentMethod: 'Bank transfer',
  rows: [{ no: '1', quantity: '3', collection: 'CUTY', carat: '0.05', colorCord: 'Red', size: 'M', unitPrice: '24', total: '72' }],
}

// What the Builder produced after the edit: the same CUTY line, now in Black.
const BUILDER_QUOTE = {
  lines: [{ product: 'CUTY', carat: '0.05', colorName: 'Black', qty: 5, unitB2B: 24, size: 'M', certType: 'inhouse' }],
  total: 120,
  totalPieces: 5,
}

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ draft: null }) }))
})
afterEach(() => { delete global.fetch })

function renderAfterFinalize(overrides = {}) {
  const next = finalizeTransition({
    editingDocumentId: 'doc-cerise',
    savedFormState: SAVED,
    initialOrderChannel: 'b2b',
  })
  return render(
    <I18nProvider>
      <OrderForm
        quote={BUILDER_QUOTE}
        client={PREVIOUS_BOUTIQUE}
        onClose={jest.fn()}
        currentUser={{ role: 'admin', email: 'admin@test.com' }}
        savedFormState={next.savedFormState}
        editingDocumentId={next.editingDocumentId}
        onEditInBuilder={jest.fn()}
        initialOrderChannel={next.initialOrderChannel}
        {...overrides}
      />
    </I18nProvider>,
  )
}

describe('Order Form after Finalize on an edited order', () => {
  test('shows the document\'s boutique, not the previously selected client', () => {
    renderAfterFinalize()
    expect(screen.getByDisplayValue('Cerise')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Previous Boutique')).not.toBeInTheDocument()
  })

  test('keeps the shipping and payment notes', () => {
    renderAfterFinalize()
    expect(screen.getByDisplayValue(SAVED.remarks)).toBeInTheDocument()
  })

  test('takes the rows from the Builder — the edit wins over the saved rows', () => {
    renderAfterFinalize()
    // The Builder changed Red ×3 into Black ×5.
    expect(screen.getAllByDisplayValue('Black').length).toBeGreaterThan(0)
    expect(screen.queryByDisplayValue('Red')).not.toBeInTheDocument()
    expect(screen.getAllByDisplayValue('5').length).toBeGreaterThan(0)
  })

  test('does not go looking for a draft — it is not a new order', async () => {
    renderAfterFinalize()
    await waitFor(() => expect(screen.queryByText(/Start Fresh/i)).not.toBeInTheDocument())
    const draftCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('/api/drafts'))
    expect(draftCalls).toHaveLength(0)
  })
})

describe('the same hand-off with the OLD Finalize (regression shape)', () => {
  // What the form received before the fix: nothing saved, no document id.
  // Kept as a living record of the failure — if this stops behaving this way,
  // the Order Form's own fallbacks changed and the fix above should be re-read.
  function renderOldWay() {
    return render(
      <I18nProvider>
        <OrderForm
          quote={BUILDER_QUOTE}
          client={PREVIOUS_BOUTIQUE}
          onClose={jest.fn()}
          currentUser={{ role: 'admin', email: 'admin@test.com' }}
          savedFormState={null}
          editingDocumentId={null}
          onEditInBuilder={jest.fn()}
          initialOrderChannel="b2b"
        />
      </I18nProvider>,
    )
  }

  test('fell back to the previous boutique and lost the notes', async () => {
    renderOldWay()
    expect(screen.getByDisplayValue('Previous Boutique')).toBeInTheDocument()
    expect(screen.queryByDisplayValue(SAVED.remarks)).not.toBeInTheDocument()
    // …and, thinking it was a new order, went to check for a draft.
    await waitFor(() => {
      const draftCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('/api/drafts'))
      expect(draftCalls.length).toBeGreaterThan(0)
    })
  })
})
