/**
 * Outreach tab after the clean-up (Sam, 15 Sep 2026): Send is the one action;
 * "Preview one email" and "Write drafts to review" sit under a fold; presets
 * live inside the content card; a bad AI key shows a banner and turns Send
 * off; the Follow-up tab exists.
 */
import { render, screen, fireEvent, within } from '@testing-library/react'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const chan = { on: () => chan, subscribe: () => chan }
    return { channel: () => chan, removeChannel: () => {} }
  },
}))
jest.mock('@/app/components/FairOutreachChatPanel', () => () => null)

import FairAssistantClient from '../FairAssistantClient'

const BATCH = { id: 'b1', name: 'Bijorcha', fair_name: 'Bijorcha Sept 2026', status: 'complete', total_leads: 2, total_sent: 1, created_at: '2026-09-15T08:00:00Z', template_id: 'generic', subject: 'Hi', headline: 'Great meeting you', paragraph1: 'p1', paragraph2: 'p2', signoff: 'Sam', attached_files: [] }
const LEADS = [
  { id: 'l1', first_name: 'Marie', last_name: 'Dupont', company: 'Maison Dupont', email: 'm@d.fr', language: 'fr', language_label: 'Français', lead_type: 'shop', status: 'extracted' },
  { id: 'l2', first_name: 'Anna', last_name: 'de Vries', company: 'De Vries', email: 'a@v.nl', language: 'nl', language_label: 'Nederlands', lead_type: 'shop', status: 'extracted' },
]
const DRAFTS = [{ id: 'd1', lead_id: 'l1', status: 'sent', sent_at: '2026-09-15T08:05:00Z', delivery_status: 'delivered', opened_at: '2026-09-15T09:00:00Z' }]

let anthropic = 'ok'
function mockFetch() {
  return jest.fn((url) => {
    const u = String(url)
    let body = {}
    if (u === '/api/fair-assistant/batches') body = { batches: [BATCH] }
    else if (u.startsWith('/api/fair-assistant/batches/b1/refresh')) body = { checked: 1, updated: 0 }
    else if (u.startsWith('/api/fair-assistant/batches/b1')) body = { batch: BATCH, leads: LEADS, images: [{ id: 'i1', status: 'processed' }, { id: 'i2', status: 'processed' }], drafts: DRAFTS }
    else if (u.startsWith('/api/fair-assistant/diagnose')) body = { anthropic, anthropicDetail: anthropic === 'ok' ? null : "Anthropic rejected the server's ANTHROPIC_API_KEY." }
    else if (u.startsWith('/api/fair-assistant/preview')) body = { preview: { bodyHtml: '<p>hi</p>' } }
    else body = { templates: [] }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
  })
}

beforeAll(() => {
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
})
beforeEach(() => { anthropic = 'ok'; global.fetch = mockFetch() })
afterEach(() => jest.restoreAllMocks())

async function openOutreach() {
  render(<FairAssistantClient />)
  fireEvent.click(await screen.findByTestId('fair-tab-outreach'))
  return screen.findByRole('button', { name: /Write and send to 2 leads/ })
}

describe('Outreach tab layout', () => {
  test('Send is the action; the checks sit under a fold; presets are inside the content card', async () => {
    const send = await openOutreach()
    expect(send).not.toBeDisabled()
    const fold = screen.getByTestId('fair-check-first')
    expect(fold.tagName).toBe('DETAILS')
    expect(within(fold).getByText('Check before sending (optional)')).toBeInTheDocument()
    expect(within(fold).getByRole('button', { name: 'Preview one email' })).toBeInTheDocument()
    expect(within(fold).getByRole('button', { name: 'Write drafts to review' })).toBeInTheDocument()
    expect(screen.queryByText('Check first:')).not.toBeInTheDocument()
    expect(screen.queryByText(/Describe what you want/)).not.toBeInTheDocument()
    expect(screen.getByTestId('fair-build-with-claude')).toBeInTheDocument()
    const presets = screen.getByTestId('fair-preset-block')
    expect(within(presets).getByText('Generic fair follow-up (shops)')).toBeInTheDocument()
    expect(screen.queryByTestId('fair-ai-banner')).not.toBeInTheDocument()
  })

  test('a rejected AI key shows the banner and turns Send off', async () => {
    anthropic = 'invalid'
    render(<FairAssistantClient />)
    fireEvent.click(await screen.findByTestId('fair-tab-outreach'))
    const send = await screen.findByRole('button', { name: /AI key missing/ })
    expect(send).toBeDisabled()
    expect(screen.getByTestId('fair-ai-banner')).toHaveTextContent(/ANTHROPIC_API_KEY/)
  })

  test('the Follow-up tab shows the batch summary', async () => {
    render(<FairAssistantClient />)
    fireEvent.click(await screen.findByTestId('fair-tab-followup'))
    expect(await screen.findByRole('heading', { name: 'Fair follow-up' })).toBeInTheDocument()
    expect(screen.getByTestId('fair-tile-leads')).toHaveTextContent('2Leads created')
    expect(screen.getByTestId('fair-tile-opened')).toHaveTextContent('1Opened')
    expect(screen.getByText('Marie Dupont')).toBeInTheDocument()
  })
})
