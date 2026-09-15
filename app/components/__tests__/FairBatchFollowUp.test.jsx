/**
 * Fair follow-up screen (Sam, 15 Sep 2026): what one batch produced —
 * cards, leads, emails sent, delivered, opened, bounced, duration, leads per
 * language and per segment, and every lead with the answer Resend gave.
 */
import { render, screen, fireEvent, within } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n'
import FairBatchFollowUp from '../FairBatchFollowUp'
import { summarizeBatch, formatDuration } from '@/lib/fair-assistant/emailStatus'

const batch = { id: 'b1', fair_name: 'Bijorcha Sept 2026', status: 'complete', created_at: '2026-09-15T08:00:00Z', total_sent: 6 }
const images = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: `img-${n}`, status: n === 8 ? 'failed' : 'processed' }))
const leads = [
  { id: 'l1', first_name: 'Marie', last_name: 'Dupont', company: 'Maison Dupont', email: 'm@d.fr', language: 'fr', language_label: 'Français', lead_type: 'shop' },
  { id: 'l2', first_name: 'Pierre', last_name: 'Martin', company: 'Bijoux Martin', email: 'p@m.fr', language: 'fr', language_label: 'Français', lead_type: 'shop' },
  { id: 'l3', first_name: 'Anna', last_name: 'de Vries', company: 'Juwelier de Vries', email: 'a@v.nl', language: 'nl', language_label: 'Nederlands', lead_type: 'shop' },
  { id: 'l4', first_name: 'Nikos', last_name: 'P.', company: 'Athens Gold', email: 'n@a.gr', language: 'el', language_label: 'Ελληνικά', lead_type: 'agent' },
  { id: 'l5', first_name: 'Sofia', last_name: 'R.', company: 'Porto Joias', email: 's@p.pt', language: 'pt', language_label: 'Português', lead_type: 'agent' },
  { id: 'l6', first_name: 'No', last_name: 'Email', company: 'Card only', email: null, language: 'fr', language_label: 'Français', lead_type: 'shop' },
  { id: 'l7', first_name: 'Bounce', last_name: 'Guy', company: 'Old Address', email: 'x@y.be', language: 'nl', language_label: 'Nederlands', lead_type: 'shop' },
]
const drafts = [
  { id: 'd1', lead_id: 'l1', status: 'sent', sent_at: '2026-09-15T08:07:00Z', delivery_status: 'delivered', opened_at: '2026-09-15T09:10:00Z', clicked_at: null },
  { id: 'd2', lead_id: 'l2', status: 'sent', sent_at: '2026-09-15T08:07:00Z', delivery_status: 'delivered', opened_at: '2026-09-15T09:30:00Z', clicked_at: '2026-09-15T09:31:00Z' },
  { id: 'd3', lead_id: 'l3', status: 'sent', sent_at: '2026-09-15T08:07:00Z', delivery_status: 'delivered', opened_at: null, clicked_at: null },
  { id: 'd4', lead_id: 'l4', status: 'sent', sent_at: '2026-09-15T08:07:00Z', delivery_status: null, opened_at: null, clicked_at: null },
  { id: 'd5', lead_id: 'l5', status: 'sent', sent_at: '2026-09-15T08:07:00Z', delivery_status: 'delivered', opened_at: '2026-09-15T12:00:00Z', clicked_at: null },
  { id: 'd6', lead_id: 'l6', status: 'failed', error: 'Lead has no email address', sent_at: null },
  { id: 'd7', lead_id: 'l7', status: 'sent', sent_at: '2026-09-15T08:07:00Z', delivery_status: 'bounced', delivery_error: 'The address does not exist. Check the spelling with the client and send again.' },
]

const renderIt = (props = {}) => render(
  <I18nProvider>
    <FairBatchFollowUp batch={batch} images={images} leads={leads} drafts={drafts} onRefreshDeliveries={jest.fn().mockResolvedValue({ checked: 6, updated: 2 })} {...props} />
  </I18nProvider>,
)

describe('summarizeBatch', () => {
  test('counts what the batch produced', () => {
    const s = summarizeBatch({ batch, images, leads, drafts })
    expect(s).toMatchObject({ cards: 7, cardsTotal: 8, leads: 7, sent: 6, delivered: 4, opened: 3, bad: 2, hasDeliveryData: true })
    expect(formatDuration(s.durationMs)).toBe('7 min')
    expect(s.byLanguage.map((g) => [g.key, g.leads, g.opened])).toEqual([['Français', 3, 2], ['Nederlands', 2, 0], ['Ελληνικά', 1, 0], ['Português', 1, 1]])
    expect(s.bySegment.map((g) => [g.key, g.leads, g.opened])).toEqual([['shop', 5, 2], ['agent', 2, 1]])
  })

  test('formatDuration speaks in minutes, hours and days', () => {
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(80 * 60000)).toBe('1 h 20')
    expect(formatDuration(27 * 3600000)).toBe('1 d 3 h')
  })
})

describe('FairBatchFollowUp', () => {
  beforeAll(() => { try { localStorage.removeItem('lovelab-lang') } catch {} })

  test('shows the tiles, the bars and every lead with its email answer', () => {
    renderIt()
    expect(screen.getByRole('heading', { name: 'Fair follow-up' })).toBeInTheDocument()
    expect(screen.getByTestId('fair-tile-cards')).toHaveTextContent('7Cards processed')
    expect(screen.getByTestId('fair-tile-leads')).toHaveTextContent('7Leads created')
    expect(screen.getByTestId('fair-tile-sent')).toHaveTextContent('6Emails sent')
    expect(screen.getByTestId('fair-tile-delivered')).toHaveTextContent('4Delivered')
    expect(screen.getByTestId('fair-tile-opened')).toHaveTextContent('3Opened')
    expect(screen.getByTestId('fair-tile-bad')).toHaveTextContent('2Bounced or failed')
    expect(screen.getByTestId('fair-tile-duration')).toHaveTextContent('7 minBatch duration')
    expect(within(screen.getByTestId('fair-bars-language')).getByText('Français')).toBeInTheDocument()
    expect(within(screen.getByTestId('fair-bars-segment')).getByText('Shops')).toBeInTheDocument()
    expect(screen.getAllByTestId('fair-followup-row')).toHaveLength(7)
    const bounce = screen.getByText('Bounce Guy').closest('tr')
    expect(within(bounce).getByText('✗ bounced')).toBeInTheDocument()
    expect(within(bounce).getByText(/does not exist/)).toBeInTheDocument()
    expect(within(screen.getByText('Pierre Martin').closest('tr')).getByText('✓ clicked')).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  test('filters: opened, not opened, bounced; search narrows', () => {
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: 'Not opened' }))
    expect(screen.getAllByTestId('fair-followup-row')).toHaveLength(3) // de Vries, Nikos, Bounce Guy
    fireEvent.click(screen.getByRole('button', { name: 'Bounced / failed' }))
    expect(screen.getAllByTestId('fair-followup-row')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'porto' } })
    expect(screen.getAllByTestId('fair-followup-row')).toHaveLength(1)
    expect(screen.getByText('Sofia R.')).toBeInTheDocument()
  })

  test('"Check deliveries now" asks the parent and reports the result', async () => {
    const onRefreshDeliveries = jest.fn().mockResolvedValue({ checked: 6, updated: 2 })
    renderIt({ onRefreshDeliveries })
    fireEvent.click(screen.getByTestId('fair-followup-check'))
    expect(onRefreshDeliveries).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('status')).toHaveTextContent('Checked 6 emails · 2 updated')
  })

  test('says when no delivery answer has arrived yet', () => {
    const silent = drafts.map((d) => ({ ...d, delivery_status: null, opened_at: null, clicked_at: null, delivery_error: null }))
    renderIt({ drafts: silent })
    expect(screen.getByRole('note')).toHaveTextContent(/app.lovelab-antwerp.com/)
  })

  test('speaks French when the app does', () => {
    localStorage.setItem('lovelab-lang', 'fr')
    renderIt()
    expect(screen.getByRole('heading', { name: 'Suivi du salon' })).toBeInTheDocument()
    expect(screen.getByTestId('fair-tile-cards')).toHaveTextContent('Cartes traitées')
    expect(within(screen.getByTestId('fair-bars-segment')).getByText('Boutiques')).toBeInTheDocument()
    expect(within(screen.getByText('Pierre Martin').closest('tr')).getByText('✓ cliqué')).toBeInTheDocument()
    localStorage.removeItem('lovelab-lang')
  })
})
