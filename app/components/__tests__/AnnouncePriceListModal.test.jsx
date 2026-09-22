/**
 * AnnouncePriceListModal — the admin can edit who receives the announcement
 * and fix an agent's language on the spot; English is always in play.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

jest.mock('@/lib/useIsMobile', () => ({ useIsMobile: () => false }))

import AnnouncePriceListModal from '../AnnouncePriceListModal'

const RECIPIENTS = {
  total: 3,
  counts: { it: 1, nl: 1, en: 1 },
  byLanguage: {
    it: [{ id: 'a-it', name: 'Anna Rossi', email: 'anna@x.com', status: 'active', language: 'it', languageSource: 'country' }],
    nl: [{ id: 'a-nl', name: 'Bart', email: 'bart@x.com', status: 'paused', language: 'nl', languageSource: 'stored' }],
    en: [{ id: 'a-en', name: 'Carl', email: 'carl@x.com', status: 'active', language: 'en', languageSource: 'default' }],
  },
  fallbackToEnglish: 1,
  derivedFromCountry: 1,
  missingEmail: [],
}

function jsonResponse(body, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body })
}

let calls
beforeEach(() => {
  calls = []
  global.fetch = jest.fn((url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({ url, method: init.method || 'GET', body })
    if (url === '/api/price-lists/announce/recipients') return jsonResponse(RECIPIENTS)
    if (url === '/api/price-lists/announce/translate') return jsonResponse({ lang: body.targetLang, text: `[${body.targetLang}] ${body.note}`, verified: true })
    if (url === '/api/price-lists/announce/send') {
      return jsonResponse({ ok: true, sent: body.recipientIds.length, failed: 0, skipped: 0, remaining: [], results: body.recipientIds.map((id) => ({ id, status: 'sent' })) })
    }
    if (url.startsWith('/api/agents/')) return jsonResponse({ agent: { id: url.split('/').pop() } })
    return jsonResponse({ error: `unexpected ${url}` }, 500)
  })
})

async function openWithRecipients() {
  render(<AnnouncePriceListModal open onClose={() => {}} />)
  await screen.findByText('3 of 3 selected')
  fireEvent.click(screen.getByText(/Edit recipients/))
  await screen.findByTestId('recipients-editor')
}

function compose() {
  fireEvent.click(screen.getByLabelText('CUTY'))
  fireEvent.change(screen.getByPlaceholderText(/e\.g\. Prices for CUTY/), { target: { value: 'Prices up 5%.' } })
}

describe('AnnouncePriceListModal — recipients', () => {
  test('lists every eligible agent grouped by language, all included by default', async () => {
    await openWithRecipients()
    const editor = screen.getByTestId('recipients-editor')
    expect(within(editor).getByText('Anna Rossi')).toBeInTheDocument()
    expect(within(editor).getByText('Bart')).toBeInTheDocument()
    expect(within(editor).getByText('Carl')).toBeInTheDocument()
    expect(within(editor).getByLabelText('Include Anna Rossi')).toBeChecked()
    expect(within(editor).getByText(/bart@x.com · paused/)).toBeInTheDocument()
  })

  test('unticking an agent drops them from the count and from the ids sent', async () => {
    await openWithRecipients()
    fireEvent.click(screen.getByLabelText('Include Anna Rossi'))
    expect(screen.getByText('2 of 3 selected')).toBeInTheDocument()

    compose()
    fireEvent.click(screen.getByText('Next: translate'))
    // Dutch is translated; Italian is not requested any more; English is the source.
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/price-lists/announce/translate').map((c) => c.body.targetLang)).toEqual(['nl']))
    expect(screen.queryByRole('button', { name: /Italiano/ })).not.toBeInTheDocument()

    const sendBtn = await screen.findByText('Send to 2 agents')
    await waitFor(() => expect(sendBtn).not.toBeDisabled())
    fireEvent.click(sendBtn)
    fireEvent.click(await screen.findByText('Send now'))

    await waitFor(() => expect(calls.some((c) => c.url === '/api/price-lists/announce/send')).toBe(true))
    const send = calls.find((c) => c.url === '/api/price-lists/announce/send')
    expect(send.body.recipientIds.sort()).toEqual(['a-en', 'a-nl'])
    expect(send.body.notes).toEqual({ en: 'Prices up 5%.', nl: '[nl] Prices up 5%.' })
    expect(send.body.collectionIds).toEqual(['CUTY'])
  })

  test('"None" on a language removes every agent of that language', async () => {
    await openWithRecipients()
    const editor = screen.getByTestId('recipients-editor')
    fireEvent.click(within(within(editor).getByTestId('recipients-it')).getByText('None'))
    expect(screen.getByText('2 of 3 selected')).toBeInTheDocument()
    expect(within(editor).getByLabelText('Include Anna Rossi')).not.toBeChecked()
  })

  test('English is always a tab, even when no agent is English', async () => {
    await openWithRecipients()
    fireEvent.click(screen.getByLabelText('Include Carl'))
    compose()
    fireEvent.change(screen.getByDisplayValue('English'), { target: { value: 'fr' } })
    fireEvent.click(screen.getByText('Next: translate'))
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/price-lists/announce/translate').map((c) => c.body.targetLang).sort()).toEqual(['en', 'it', 'nl']))
    expect(await screen.findByRole('button', { name: /English/ })).toBeInTheDocument()
  })

  test('changing an agent language saves it to the profile and reloads the list', async () => {
    await openWithRecipients()
    fireEvent.change(screen.getByLabelText('Language for Anna Rossi'), { target: { value: 'it' } })
    await waitFor(() => expect(calls.some((c) => c.url === '/api/agents/a-it' && c.method === 'PUT')).toBe(true))
    const put = calls.find((c) => c.url === '/api/agents/a-it')
    expect(put.body).toEqual({ agent_language: 'it' })
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/price-lists/announce/recipients').length).toBe(2))
  })

  test('search narrows the list to matching agents without changing the selection', async () => {
    await openWithRecipients()
    fireEvent.change(screen.getByLabelText('Search an agent by name or email…'), { target: { value: 'bart' } })
    const editor = screen.getByTestId('recipients-editor')
    expect(within(editor).getByText('Bart')).toBeInTheDocument()
    expect(within(editor).queryByText('Anna Rossi')).not.toBeInTheDocument()
    expect(screen.getByText('3 of 3 selected')).toBeInTheDocument()
  })

  test('nobody selected blocks the next step', async () => {
    await openWithRecipients()
    for (const name of ['Anna Rossi', 'Bart', 'Carl']) fireEvent.click(screen.getByLabelText(`Include ${name}`))
    compose()
    expect(screen.getByText('Nobody selected.')).toBeInTheDocument()
    expect(screen.getByText('Next: translate')).toBeDisabled()
  })
})
