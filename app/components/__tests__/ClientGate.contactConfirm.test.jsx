/**
 * ClientGate — Start Quoting must pause when the API refuses to replace the
 * stored contact details of a saved client, so a browser autofill can never
 * rewrite the shared client record without someone agreeing to it.
 */

import React, { useState } from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key) => {
      const map = {
        'client.searchPlaceholder': 'Search…',
        'client.companyPlaceholder': 'Company',
        'client.startQuoting': 'Start Quoting',
        'client.skip': 'Skip for now',
        'client.contactName': 'Contact Name',
        'client.email': 'Email',
        'client.phone': 'Phone',
        'client.contactConflictTitle': 'This client already has saved contact details',
        'client.contactConflictIntro': 'Nothing was changed.',
        'client.contactConflictSaved': 'Saved',
        'client.contactConflictEntered': 'In the form',
        'client.contactConflictKeep': 'Keep saved',
        'client.contactConflictReplace': 'Replace',
      }
      return map[key] || key
    },
  }),
}))

jest.mock('../UserMenu', () => () => null)
jest.mock('@/lib/useIsMobile', () => ({ useResponsive: () => ({ isCompact: false }) }))

import ClientGate from '../ClientGate'

const LOADED_CLIENT = {
  name: 'Dionne Saleh',
  phone: '',
  email: 'dionnesaleh@gmail.com',
  company: 'SAS LITTLE FACTORY',
  country: 'France',
  address: 'Centre Commercial Le Forum',
  city: 'Saint-Paul',
  zip: '97460',
  vat: 'FR25822887832',
  vatValid: true,
  vatStatus: 'VALID',
  vatErrorCode: null,
  vatMessageKey: null,
  vatValidating: false,
  savedClientId: 'c1',
}

const CONFLICTS = [
  { field: 'name', stored: 'Marie Dupont', incoming: 'Dionne Saleh' },
  { field: 'email', stored: 'contact@littlefactory.re', incoming: 'dionnesaleh@gmail.com' },
]

function postBodies() {
  return global.fetch.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => JSON.parse(init.body))
}

function mockApi({ warnOnFirstPost = true } = {}) {
  let posts = 0
  global.fetch = jest.fn((url, init) => {
    if (init?.method === 'POST') {
      posts += 1
      const warn = warnOnFirstPost && posts === 1
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(
          warn
            ? { client: { id: 'c1' }, contact_warnings: CONFLICTS }
            : { client: { id: 'c1' } },
        ),
      })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ clients: [] }) })
  })
}

async function renderGate(onComplete) {
  function Harness() {
    const [client, setClient] = useState(LOADED_CLIENT)
    return <ClientGate client={client} setClient={setClient} onComplete={onComplete} />
  }
  const result = render(<Harness />)
  await act(async () => {})
  return result
}

describe('ClientGate — contact overwrite confirmation', () => {
  it('shows the conflict instead of starting the quote', async () => {
    mockApi()
    const onComplete = jest.fn()
    await renderGate(onComplete)

    fireEvent.click(screen.getByText('Start Quoting'))

    await waitFor(() => {
      expect(screen.getByText('This client already has saved contact details')).toBeInTheDocument()
    })
    expect(screen.getByText(/Saved: Marie Dupont/)).toBeInTheDocument()
    expect(screen.getByText(/In the form: Dionne Saleh/)).toBeInTheDocument()
    expect(screen.getByText(/Saved: contact@littlefactory.re/)).toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('does not ask the API to overwrite on the first attempt', async () => {
    mockApi()
    await renderGate(jest.fn())

    fireEvent.click(screen.getByText('Start Quoting'))
    await waitFor(() => expect(postBodies()).toHaveLength(1))

    expect(postBodies()[0].confirm_contact_overwrite).toBeUndefined()
  })

  it('Keep saved continues without a second save', async () => {
    mockApi()
    const onComplete = jest.fn()
    await renderGate(onComplete)

    fireEvent.click(screen.getByText('Start Quoting'))
    await waitFor(() => expect(screen.getByText('Keep saved')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Keep saved'))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(postBodies()).toHaveLength(1)
    expect(screen.queryByText('This client already has saved contact details')).not.toBeInTheDocument()
  })

  it('Replace re-saves with the confirmation flag', async () => {
    mockApi()
    const onComplete = jest.fn()
    await renderGate(onComplete)

    fireEvent.click(screen.getByText('Start Quoting'))
    await waitFor(() => expect(screen.getByText('Replace')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Replace'))

    await waitFor(() => {
      expect(screen.queryByText('This client already has saved contact details')).not.toBeInTheDocument()
    })
    expect(postBodies()).toHaveLength(2)
    expect(postBodies()[1].confirm_contact_overwrite).toBe(true)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('starts straight away when the API reports no conflict', async () => {
    mockApi({ warnOnFirstPost: false })
    const onComplete = jest.fn()
    await renderGate(onComplete)

    fireEvent.click(screen.getByText('Start Quoting'))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('This client already has saved contact details')).not.toBeInTheDocument()
  })

  it('a failing save never blocks the agent', async () => {
    global.fetch = jest.fn((url, init) => {
      if (init?.method === 'POST') return Promise.reject(new Error('offline'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ clients: [] }) })
    })
    const onComplete = jest.fn()
    await renderGate(onComplete)

    fireEvent.click(screen.getByText('Start Quoting'))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
  })
})
