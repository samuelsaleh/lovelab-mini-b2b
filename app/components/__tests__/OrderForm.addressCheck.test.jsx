/**
 * The last check before an order is filed: the address against the directory.
 *
 * Only a genuine difference interrupts — a different town, or a different
 * street in the same one. Spelling variants pass straight through, or the
 * warning would train everyone to click past it.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n'

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
jest.mock('../PackshotThumb', () => ({ __esModule: true, default: () => <div data-testid="packshot-thumb" /> }))
// The save modal is replaced by a marker, so "did we reach the save?" is one query.
jest.mock('../SaveDocumentModal', () => ({
  __esModule: true,
  default: ({ isOpen }) => (isOpen ? <div data-testid="save-modal-open" /> : null),
}))

const OrderForm = require('../OrderForm').default

const THEATRE_ROW = {
  id: 'theatre-1', company: 'THEATRE O FEES', name: 'Laetitia CHASTELLIER',
  address: '7 rue de Stassart', zip: '84100', city: 'ORANGE', country: 'France',
}

/** Théâtrophil, as loaded — but carrying DI MARE's address from Roscoff. */
const LEAKED = {
  name: 'Laetitia CHASTELLIER', phone: '', email: 'theatreofees@sfr.fr',
  company: 'THEATRE O FEES', country: 'France',
  address: '19 Place Lacaze Duthiers', city: 'Roscoff', zip: '29680',
  vat: '', vatValid: null, vatValidating: false, vatStatus: null, vatErrorCode: null, vatMessageKey: null,
  savedClientId: 'theatre-1', dzb_client_number: '', jeweler_group: null,
  shipping_same_as_billing: true, shipping_address: '', shipping_address_line2: '', shipping_country: '',
}

const directoryReturns = (rows) => {
  global.fetch = jest.fn(async (url) => {
    if (String(url).startsWith('/api/clients')) return { ok: true, json: async () => ({ clients: rows }) }
    return { ok: true, json: async () => ({}) }
  })
}

const QUOTE = { lines: [{ collection: 'Cuty', quantity: 6, unitPrice: 100, total: 600 }], total: 600, totalPieces: 6 }

const renderForm = (client) => render(
  <I18nProvider>
    <OrderForm quote={QUOTE} client={client} onClose={() => {}} currentUser={{ full_name: 'Dionne' }} />
  </I18nProvider>,
)

/**
 * Save first asks about prepayment and parks the action; "Confirm & Continue"
 * is what actually runs it. The address check sits after that, so this is the
 * real click path, not a shortcut around it.
 */
const clickSave = async () => {
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
  fireEvent.click(await screen.findByRole('button', { name: /confirm & continue/i }))
}

afterEach(() => jest.restoreAllMocks())

describe('saving an order whose address differs from the directory', () => {
  it('stops and shows both addresses', async () => {
    directoryReturns([THEATRE_ROW])
    renderForm(LEAKED)
    await clickSave()

    const dialog = await screen.findByTestId('address-mismatch-dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByTestId('address-mismatch-typed')).toHaveTextContent('19 Place Lacaze Duthiers, 29680 Roscoff')
    expect(screen.getByTestId('address-mismatch-stored')).toHaveTextContent('7 rue de Stassart, 84100 ORANGE')
    expect(screen.queryByTestId('save-modal-open')).not.toBeInTheDocument()
  })

  it('"use the one on file" replaces the address, then saves', async () => {
    directoryReturns([THEATRE_ROW])
    renderForm(LEAKED)
    await clickSave()
    await screen.findByTestId('address-mismatch-dialog')

    fireEvent.click(screen.getByTestId('address-mismatch-use-stored'))

    await waitFor(() => expect(screen.getByTestId('save-modal-open')).toBeInTheDocument())
    expect(screen.getByPlaceholderText('Street address')).toHaveValue('7 rue de Stassart')
    expect(screen.getByPlaceholderText('Postal code, City')).toHaveValue('84100 ORANGE')
    expect(screen.queryByTestId('address-mismatch-dialog')).not.toBeInTheDocument()
  })

  it('"keep what I typed" saves as is — the person is right and the file is stale', async () => {
    directoryReturns([THEATRE_ROW])
    renderForm(LEAKED)
    await clickSave()
    await screen.findByTestId('address-mismatch-dialog')

    fireEvent.click(screen.getByTestId('address-mismatch-keep'))

    await waitFor(() => expect(screen.getByTestId('save-modal-open')).toBeInTheDocument())
    expect(screen.getByPlaceholderText('Street address')).toHaveValue('19 Place Lacaze Duthiers')
  })
})

describe('saving an order the directory agrees with', () => {
  it('goes straight to the save when the address is the same', async () => {
    directoryReturns([THEATRE_ROW])
    renderForm({ ...LEAKED, address: '7 rue de Stassart', city: 'ORANGE', zip: '84100' })
    await clickSave()

    await waitFor(() => expect(screen.getByTestId('save-modal-open')).toBeInTheDocument())
    expect(screen.queryByTestId('address-mismatch-dialog')).not.toBeInTheDocument()
  })

  it('does not stop over a spelling variant', async () => {
    directoryReturns([{ ...THEATRE_ROW, address: '7, Rue de Stassart' }])
    renderForm({ ...LEAKED, address: '7 rue Stassart', city: 'Orange', zip: '84100' })
    await clickSave()

    await waitFor(() => expect(screen.getByTestId('save-modal-open')).toBeInTheDocument())
    expect(screen.queryByTestId('address-mismatch-dialog')).not.toBeInTheDocument()
  })

  it('does not stop when the directory has no address for this boutique', async () => {
    directoryReturns([{ ...THEATRE_ROW, address: null, zip: null, city: null }])
    renderForm(LEAKED)
    await clickSave()

    await waitFor(() => expect(screen.getByTestId('save-modal-open')).toBeInTheDocument())
  })

  it('does not stop when the boutique is not in the directory at all', async () => {
    directoryReturns([])
    renderForm(LEAKED)
    await clickSave()

    await waitFor(() => expect(screen.getByTestId('save-modal-open')).toBeInTheDocument())
  })

  it('does not hold the order up when the directory is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'))
    renderForm(LEAKED)
    await clickSave()

    await waitFor(() => expect(screen.getByTestId('save-modal-open')).toBeInTheDocument())
  })
})
