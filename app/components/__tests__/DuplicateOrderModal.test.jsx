/**
 * Duplicate an order (Sam, 15 Sep 2026): the dialog asks who the new order is
 * for before anything opens. A new shop by default, the same one on request,
 * and a boutique picked from the directory brings its own address and VAT.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n'
import DuplicateOrderModal from '../DuplicateOrderModal'

const DOC = {
  id: 'doc-1',
  client_company: 'SARL UNA STORIA DI MARE',
  client_name: 'Di Mare',
  metadata: {
    formState: {
      rows: [{ collection: 'Multi Three', quantity: 12 }, { collection: 'Cuty', quantity: 6 }, {}],
      companyName: 'SARL UNA STORIA DI MARE', vatNumber: 'FR123456', eventName: 'Bijorhca',
    },
  },
}

const CLAIRE = {
  id: 'c1', company: 'THEATRE O FEES', name: 'Claire Blanc', country: 'France',
  address: '3 place du Marché', zip: '69001', city: 'Lyon', vat: 'FR998877', email: 'claire@theatre.fr',
}

const renderIt = (props = {}) => {
  const onConfirm = jest.fn()
  const onCancel = jest.fn()
  render(
    <I18nProvider>
      <DuplicateOrderModal doc={DOC} onConfirm={onConfirm} onCancel={onCancel} {...props} />
    </I18nProvider>,
  )
  return { onConfirm, onCancel }
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ clients: [CLAIRE] }) })
})
afterEach(() => jest.restoreAllMocks())

describe('DuplicateOrderModal', () => {
  it('opens on the new-client choice and says what is being duplicated', () => {
    renderIt()
    expect(screen.getByTestId('duplicate-mode-new')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/The same 2 lines as the order for SARL UNA STORIA DI MARE/)).toBeInTheDocument()
    expect(screen.getByTestId('duplicate-confirm')).toBeDisabled()
  })

  it('a typed name is enough, and the old client’s details are not carried', () => {
    const { onConfirm } = renderIt()
    fireEvent.change(screen.getByTestId('duplicate-company'), { target: { value: '  THEATRE O FEES  ' } })
    fireEvent.change(screen.getByTestId('duplicate-contact'), { target: { value: 'Claire' } })
    fireEvent.click(screen.getByTestId('duplicate-confirm'))
    expect(onConfirm).toHaveBeenCalledWith({
      mode: 'new',
      clientFields: { companyName: 'THEATRE O FEES', contactName: 'Claire' },
      client: null,
      keepFair: true,
    })
  })

  it('picking a saved boutique brings its address and VAT along', async () => {
    const { onConfirm } = renderIt()
    fireEvent.change(screen.getByTestId('duplicate-company'), { target: { value: 'theatre' } })
    const list = await screen.findByTestId('duplicate-matches')
    expect(global.fetch).toHaveBeenCalledWith('/api/clients?search=theatre')
    fireEvent.click(within(list).getByText('THEATRE O FEES'))
    expect(screen.getByTestId('duplicate-picked')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('duplicate-confirm'))
    const call = onConfirm.mock.calls[0][0]
    expect(call.mode).toBe('new')
    expect(call.client).toBe(CLAIRE)
    expect(call.clientFields).toMatchObject({
      companyName: 'THEATRE O FEES', contactName: 'Claire Blanc',
      vatNumber: 'FR998877', addressLine1: '3 place du Marché', addressLine2: '69001 Lyon', country: 'France',
    })
  })

  it('the same-client choice needs no name and keeps the restock wording', () => {
    const { onConfirm } = renderIt()
    fireEvent.click(screen.getByTestId('duplicate-mode-same'))
    expect(screen.queryByTestId('duplicate-company')).not.toBeInTheDocument()
    expect(screen.getByText(/Their details are kept, so this is a repeat order/i)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('duplicate-confirm'))
    expect(onConfirm).toHaveBeenCalledWith({ mode: 'same', keepFair: true })
  })

  it('the fair is kept by default and can be dropped', () => {
    const { onConfirm } = renderIt()
    expect(screen.getByText(/File it in the same fair \(Bijorhca\)/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('duplicate-keep-fair'))
    fireEvent.change(screen.getByTestId('duplicate-company'), { target: { value: 'X' } })
    fireEvent.click(screen.getByTestId('duplicate-confirm'))
    expect(onConfirm.mock.calls[0][0].keepFair).toBe(false)
  })

  it('an order with no fair has no fair question', () => {
    renderIt({ doc: { ...DOC, metadata: { formState: { rows: [] } } } })
    expect(screen.queryByTestId('duplicate-keep-fair')).not.toBeInTheDocument()
  })

  it('cancels on Escape and on the backdrop', () => {
    const { onCancel } = renderIt()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('a directory that cannot be reached still lets the name be typed', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'))
    const { onConfirm } = renderIt()
    fireEvent.change(screen.getByTestId('duplicate-company'), { target: { value: 'NEW SHOP' } })
    await waitFor(() => expect(screen.queryByTestId('duplicate-matches')).not.toBeInTheDocument())
    fireEvent.click(screen.getByTestId('duplicate-confirm'))
    expect(onConfirm.mock.calls[0][0].clientFields.companyName).toBe('NEW SHOP')
  })

  it('speaks French when the app does', () => {
    localStorage.setItem('lovelab-lang', 'fr')
    renderIt()
    expect(screen.getByRole('dialog', { name: 'Dupliquer la commande' })).toBeInTheDocument()
    expect(screen.getByTestId('duplicate-confirm')).toHaveTextContent('Dupliquer')
    localStorage.removeItem('lovelab-lang')
  })
})
