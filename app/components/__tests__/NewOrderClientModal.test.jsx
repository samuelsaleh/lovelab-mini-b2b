/**
 * "New order — for whom?" (Dionne, 15 Sept 2026)
 *
 * A new order used to keep whoever was loaded without saying so. This dialog
 * is the one question that stops the previous boutique riding along.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n'
import NewOrderClientModal from '../NewOrderClientModal'

const renderIt = (props = {}) => {
  const handlers = { onSameClient: jest.fn(), onOtherClient: jest.fn(), onCancel: jest.fn() }
  render(
    <I18nProvider>
      <NewOrderClientModal company="THEATRE O FEES" {...handlers} {...props} />
    </I18nProvider>,
  )
  return handlers
}

describe('NewOrderClientModal', () => {
  it('names the boutique already open, so the choice is concrete', () => {
    renderIt()
    expect(screen.getByRole('dialog', { name: 'Who is this order for?' })).toBeInTheDocument()
    expect(screen.getByTestId('new-order-same-client')).toHaveTextContent('THEATRE O FEES')
    expect(screen.getByTestId('new-order-other-client')).toHaveTextContent('Another boutique')
  })

  it('puts focus on "same boutique" — the common case at a fair', () => {
    renderIt()
    expect(screen.getByTestId('new-order-same-client')).toHaveFocus()
  })

  it('reports each choice to its own handler, and nothing else', () => {
    const h = renderIt()
    fireEvent.click(screen.getByTestId('new-order-same-client'))
    expect(h.onSameClient).toHaveBeenCalledTimes(1)
    expect(h.onOtherClient).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('new-order-other-client'))
    expect(h.onOtherClient).toHaveBeenCalledTimes(1)
  })

  it('cancels on Escape, on the backdrop and on the button', () => {
    const h = renderIt()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByText('Cancel'))
    expect(h.onCancel).toHaveBeenCalledTimes(2)
  })

  it('does not cancel when the card itself is clicked', () => {
    const h = renderIt()
    fireEvent.click(screen.getByTestId('new-order-client-modal'))
    expect(h.onCancel).not.toHaveBeenCalled()
  })

  it('speaks French when the app does', () => {
    localStorage.setItem('lovelab-lang', 'fr')
    renderIt()
    expect(screen.getByRole('dialog', { name: 'Cette commande est pour qui ?' })).toBeInTheDocument()
    expect(screen.getByTestId('new-order-other-client')).toHaveTextContent('Une autre boutique')
    localStorage.removeItem('lovelab-lang')
  })
})
