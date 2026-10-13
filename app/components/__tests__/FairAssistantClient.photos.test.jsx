/**
 * Upload tab and Send button after the UI pass (Rafi, 13 Oct 2026): the photo
 * list says in plain words what happened to each card and what to do, one
 * step bar instead of two, and Send shows how fast mails are going out.
 */
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const chan = { on: () => chan, subscribe: () => chan }
    return { channel: () => chan, removeChannel: () => {} }
  },
}))
jest.mock('@/app/components/FairOutreachChatPanel', () => () => null)

import FairAssistantClient from '../FairAssistantClient'

const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString()
const BATCH = { id: 'b1', name: 'Paris fair', status: 'extracting', total_leads: 2, total_sent: 0, template_id: 'generic', subject: 'Hi', headline: 'Great meeting you', paragraph1: 'p1', paragraph2: 'p2', signoff: 'Sam', attached_files: [] }
const LEADS = [
  { id: 'l1', first_name: 'Marie', last_name: 'Dupont', company: 'Maison Dupont', email: 'm@d.fr', language: 'fr', lead_type: 'shop', status: 'extracted' },
  { id: 'l2', first_name: 'Anna', last_name: 'de Vries', company: 'De Vries', email: 'a@v.nl', language: 'nl', lead_type: 'shop', status: 'extracted' },
]
let images = []
let sendHandler = null

function mockFetch() {
  return jest.fn((url) => {
    const u = String(url)
    let body = {}
    if (u === '/api/fair-assistant/batches') body = { batches: [BATCH] }
    else if (u.startsWith('/api/fair-assistant/batches/b1/refresh')) body = { checked: 0, updated: 0 }
    else if (u.startsWith('/api/fair-assistant/batches/b1')) body = { batch: BATCH, leads: LEADS, images, drafts: [] }
    else if (u.startsWith('/api/fair-assistant/diagnose')) body = { anthropic: 'ok' }
    else if (u.startsWith('/api/fair-assistant/generate-all')) body = { ok: true, generated: 2, failed: 0, total: 2 }
    else if (u.startsWith('/api/fair-assistant/send') && sendHandler) return sendHandler()
    else body = { templates: [] }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
  })
}

beforeAll(() => {
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
})
beforeEach(() => { images = []; sendHandler = null; global.fetch = mockFetch() })
afterEach(() => jest.restoreAllMocks())

async function openUpload() {
  render(<FairAssistantClient />)
  return screen.findByText('Photos in this batch')
}

describe('Upload tab — photo list', () => {
  test('a stuck photo gets a banner, its age, and two clear choices', async () => {
    images = [{ id: 'i1', file_name: 'card_lyon_03.jpg', status: 'processing', created_at: minutesAgo(18) }]
    await openUpload()
    const banner = screen.getByTestId('fair-photos-banner')
    expect(banner).toHaveTextContent('1 photo got no answer from the card reader')
    expect(banner).toHaveTextContent(/18 minutes/)
    const row = screen.getByTestId('fair-photo-stuck')
    expect(within(row).getByText(/no answer \(18 min\)/)).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Already in Salesforce' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Delete and upload again' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  test('"Try again" sends the photo to the card reader again, no confirm needed', async () => {
    images = [{ id: 'i1', file_name: 'card_lyon_03.jpg', status: 'processing', created_at: minutesAgo(18) }]
    await openUpload()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/fair-assistant/images/i1/retry', { method: 'POST' }))
  })

  test('a failed photo that still has its file offers "Try again"; a retry restarts the stuck clock', async () => {
    images = [{ id: 'i1', file_name: 'a.jpg', drive_file_id: 'drv1', status: 'failed', error: 'OCR failed', created_at: minutesAgo(40) }]
    await openUpload()
    expect(within(screen.getByTestId('fair-photo-failed')).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  test('a photo retried a minute ago is "reading", not stuck, even if uploaded long ago', async () => {
    images = [{ id: 'i1', file_name: 'a.jpg', status: 'processing', created_at: minutesAgo(60), updated_at: minutesAgo(1) }]
    await openUpload()
    expect(screen.getByTestId('fair-photo-processing')).toBeInTheDocument()
    expect(screen.queryByTestId('fair-photo-stuck')).not.toBeInTheDocument()
  })

  test('a photo being read shows a calm notice and no action buttons', async () => {
    images = [{ id: 'i1', file_name: 'card_milan_02.jpg', status: 'processing', created_at: minutesAgo(1) }]
    await openUpload()
    expect(screen.getByTestId('fair-photos-banner')).toHaveTextContent('Reading 1 card… usually under 30 seconds.')
    const row = screen.getByTestId('fair-photo-processing')
    expect(within(row).queryByRole('button', { name: 'Already in Salesforce' })).not.toBeInTheDocument()
  })

  test('a duplicate says it is already in Salesforce and that no lead is added here', async () => {
    images = [{ id: 'i1', file_name: 'card_ghent_04.jpg', status: 'processed', error: 'Duplicate — already in Salesforce (00Q1)', created_at: minutesAgo(30) }]
    await openUpload()
    const row = screen.getByTestId('fair-photo-duplicate')
    expect(within(row).getByText('✓ already in Salesforce')).toBeInTheDocument()
    expect(row).toHaveTextContent(/no lead is added here/i)
    expect(screen.queryByTestId('fair-photos-banner')).not.toBeInTheDocument()
  })

  test('a failed photo shows its reason; a done photo says lead created', async () => {
    images = [
      { id: 'i1', file_name: 'notes.pdf', status: 'failed', error: 'Not an image', created_at: minutesAgo(30) },
      { id: 'i2', file_name: 'ok.jpg', status: 'processed', created_at: minutesAgo(30) },
    ]
    await openUpload()
    expect(within(screen.getByTestId('fair-photo-failed')).getByText('Not an image')).toBeInTheDocument()
    expect(within(screen.getByTestId('fair-photo-done')).getByText('Lead created.')).toBeInTheDocument()
  })

  test('"Already in Salesforce" asks first and explains that no lead is created', async () => {
    images = [{ id: 'i1', file_name: 'card_lyon_03.jpg', status: 'processing', created_at: minutesAgo(18) }]
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
    await openUpload()
    fireEvent.click(screen.getByRole('button', { name: 'Already in Salesforce' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0]).toMatch(/no lead is added/i)
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('mark-duplicate'), expect.anything())
  })
})

describe('Upload — weak connection', () => {
  test('a dropped connection is retried and the photo still goes in once', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] })
    try {
      let uploads = 0
      const base = global.fetch
      global.fetch = jest.fn((url, init) => {
        if (String(url) === '/api/fair-assistant/upload') {
          uploads += 1
          if (uploads === 1) return Promise.reject(new TypeError('Failed to fetch'))
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ image: { id: 'i1' } }) })
        }
        return base(url, init)
      })
      images = [{ id: 'x', file_name: 'old.jpg', status: 'processed', created_at: minutesAgo(30) }]
      const { container } = render(<FairAssistantClient />)
      await screen.findByText('Photos in this batch')
      const input = container.querySelector('input[type="file"]')
      const file = new File(['x'], 'card.jpg', { type: 'image/jpeg' })
      fireEvent.change(input, { target: { files: [file] } })
      await waitFor(() => expect(uploads).toBe(1))
      await jest.advanceTimersByTimeAsync(2100)
      await waitFor(() => expect(uploads).toBe(2))
      expect(screen.queryByText(/failed —/)).not.toBeInTheDocument()
    } finally {
      jest.useRealTimers()
    }
  })

  test('a refused file (4xx) is reported at once and not retried', async () => {
    let uploads = 0
    const base = global.fetch
    global.fetch = jest.fn((url, init) => {
      if (String(url) === '/api/fair-assistant/upload') {
        uploads += 1
        return Promise.resolve({ ok: false, status: 415, json: () => Promise.resolve({ error: '"notes.pdf" is not a photo.' }) })
      }
      return base(url, init)
    })
    images = [{ id: 'x', file_name: 'old.jpg', status: 'processed', created_at: minutesAgo(30) }]
    const { container } = render(<FairAssistantClient />)
    await screen.findByText('Photos in this batch')
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [new File(['x'], 'notes.pdf', { type: 'image/jpeg' })] } })
    expect(await screen.findByText(/is not a photo/)).toBeInTheDocument()
    expect(uploads).toBe(1)
  })
})

describe('Test batches', () => {
  test('a [TEST] batch says on the Outreach tab that emails go only to the admin', async () => {
    const orig = BATCH.name
    BATCH.name = '[TEST] Paris dry run'
    try {
      images = [{ id: 'i1', status: 'processed', created_at: minutesAgo(30) }]
      await openUpload()
      fireEvent.click(screen.getByTestId('fair-tab-outreach'))
      expect(await screen.findByTestId('fair-test-banner')).toHaveTextContent(/your own address only/i)
    } finally { BATCH.name = orig }
  })
  test('a normal batch shows no test banner', async () => {
    images = [{ id: 'i1', status: 'processed', created_at: minutesAgo(30) }]
    await openUpload()
    fireEvent.click(screen.getByTestId('fair-tab-outreach'))
    await waitFor(() => expect(screen.getByTestId('fair-tab-outreach')).toBeInTheDocument())
    expect(screen.queryByTestId('fair-test-banner')).not.toBeInTheDocument()
  })
})

describe('Navigation', () => {
  test('one step bar: the four tabs keep their test ids and show counts; no second stepper row', async () => {
    images = [{ id: 'i1', status: 'processed', created_at: minutesAgo(30) }, { id: 'i2', status: 'processed', created_at: minutesAgo(30) }]
    await openUpload()
    for (const id of ['upload', 'leads', 'outreach', 'followup']) expect(screen.getByTestId(`fair-tab-${id}`)).toBeInTheDocument()
    expect(within(screen.getByTestId('fair-tab-upload')).getByText('2')).toBeInTheDocument()   // 2 photos
    expect(within(screen.getByTestId('fair-tab-leads')).getByText('2')).toBeInTheDocument()    // 2 leads
    expect(screen.queryByText('Upload cards')).not.toBeInTheDocument()
    expect(screen.queryByText('Review leads')).not.toBeInTheDocument()
  })

  test('batch status is in plain words', async () => {
    render(<FairAssistantClient />)
    await screen.findByTestId('fair-tab-upload')
    expect(screen.getByRole('option', { name: 'Paris fair (Reading cards)' })).toBeInTheDocument()
    expect(await screen.findByText(/2 leads · 0 sent · Reading cards/)).toBeInTheDocument()
  })
})

describe('Send button — how fast it is sending', () => {
  test('shows the measured rate after the first pass, then a Done summary with the rate', async () => {
    let t = 1_000_000
    jest.spyOn(Date, 'now').mockImplementation(() => t)
    let pass = 0
    let releaseSecond
    sendHandler = () => {
      pass += 1
      if (pass === 1) {
        t += 10_000   // the first pass sent 30 mails in 10 seconds
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, sent: 30, failed: 0, skipped: 0, remaining: 30 }) })
      }
      return new Promise((resolve) => {
        releaseSecond = () => { t += 10_000; resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, sent: 30, failed: 0, skipped: 0, remaining: 0 }) }) }
      })
    }
    render(<FairAssistantClient />)
    fireEvent.click(await screen.findByTestId('fair-tab-outreach'))
    fireEvent.click(await screen.findByRole('button', { name: /Write and send to 2 leads/ }))

    expect(await screen.findByRole('button', { name: 'Sending… 30 to go · 3 per second' })).toBeDisabled()
    expect(screen.getByText(/Keep this page open until it says Done/)).toBeInTheDocument()
    const bar = screen.getByTestId('fair-send-progress')
    expect(within(bar).getByText(/of 2 sent/)).toBeInTheDocument()          // 2 leads have an email
    expect(within(bar).getByRole('progressbar', { name: 'Emails sent' })).toHaveAttribute('aria-valuemax', '2')

    await waitFor(() => expect(releaseSecond).toBeDefined())
    releaseSecond()
    const done = await screen.findByRole('status', { name: '' }, { timeout: 3000 }).catch(() => null)
    await waitFor(() => expect(screen.getByText(/Done — 60 sent, 0 failed, 0 skipped/)).toBeInTheDocument())
    expect(screen.getByText(/Sent at about 3 per second/)).toBeInTheDocument()
    void done
  })

  test('a success summary is styled as a status, not as an error', async () => {
    let t = 5_000_000
    jest.spyOn(Date, 'now').mockImplementation(() => t)
    sendHandler = () => { t += 5_000; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, sent: 2, failed: 0, skipped: 0, remaining: 0 }) }) }
    render(<FairAssistantClient />)
    fireEvent.click(await screen.findByTestId('fair-tab-outreach'))
    fireEvent.click(await screen.findByRole('button', { name: /Write and send to 2 leads/ }))
    const msg = await screen.findByText(/Done — 2 sent/)
    expect(msg.closest('[role="status"]')).not.toBeNull()
    expect(msg.closest('[role="alert"]')).toBeNull()
  })
})

describe('Review button and Max view', () => {
  test('"Done — review 1 lead" switches to Leads and scrolls the page to the top so the click is visible', async () => {
    images = [{ id: 'i1', file_name: 'a.jpg', status: 'processed', created_at: minutesAgo(30) }]
    const scrollTo = jest.fn()
    window.HTMLElement.prototype.scrollTo = scrollTo
    global.requestAnimationFrame = (cb) => { cb(0); return 0 }
    render(<FairAssistantClient />)
    const btn = await screen.findByRole('button', { name: /Done — review 2 leads/ })
    fireEvent.click(btn)
    expect(await screen.findByText(/This batch will send|Marie Dupont/)).toBeInTheDocument()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    expect(screen.getByTestId('fair-tab-leads')).toHaveAttribute('aria-current', 'step')
  })

  test('clicking a tab also brings the page to the top', async () => {
    const scrollTo = jest.fn()
    window.HTMLElement.prototype.scrollTo = scrollTo
    global.requestAnimationFrame = (cb) => { cb(0); return 0 }
    render(<FairAssistantClient />)
    fireEvent.click(await screen.findByTestId('fair-tab-outreach'))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  test('Max view removes the width cap, is remembered, and can be switched back', async () => {
    window.localStorage.removeItem('fairAssistantMaxView')
    render(<FairAssistantClient />)
    const box = await screen.findByTestId('fair-container')
    expect(box.style.maxWidth).toBe('1100px')
    fireEvent.click(screen.getByRole('button', { name: 'Max view' }))
    expect(box.style.maxWidth).toBe('none')
    expect(window.localStorage.getItem('fairAssistantMaxView')).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Normal view' }))
    expect(box.style.maxWidth).toBe('1100px')
    expect(window.localStorage.getItem('fairAssistantMaxView')).toBe('0')
  })

  test('a remembered Max view is applied on load', async () => {
    window.localStorage.setItem('fairAssistantMaxView', '1')
    render(<FairAssistantClient />)
    await waitFor(async () => expect((await screen.findByTestId('fair-container')).style.maxWidth).toBe('none'))
    window.localStorage.removeItem('fairAssistantMaxView')
  })
})

describe('Sent bar and the per-second cap', () => {
  test('the bar shows "X of N sent" and the cap the server reports ("max 3 per second")', async () => {
    let t = 1_000_000
    jest.spyOn(Date, 'now').mockImplementation(() => t)
    let pass = 0
    let release
    sendHandler = () => {
      pass += 1
      if (pass === 1) { t += 4_000; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, sent: 12, failed: 0, skipped: 0, remaining: 8, perSecond: 3 }) }) }
      return new Promise((resolve) => { release = () => resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, sent: 8, failed: 0, skipped: 0, remaining: 0, perSecond: 3 }) }) })
    }
    render(<FairAssistantClient />)
    fireEvent.click(await screen.findByTestId('fair-tab-outreach'))
    fireEvent.click(await screen.findByRole('button', { name: /Write and send to 2 leads/ }))
    const bar = await screen.findByTestId('fair-send-progress')
    await waitFor(() => expect(bar).toHaveTextContent('3 per second · max 3 per second'))
    await waitFor(() => expect(release).toBeDefined())
    release()
    await waitFor(() => expect(screen.getByText(/Done — 20 sent/)).toBeInTheDocument())
  })

  test('without a server cap the bar shows no "max" claim, only the measured rate', async () => {
    let t = 2_000_000
    jest.spyOn(Date, 'now').mockImplementation(() => t)
    let pass = 0
    let release
    sendHandler = () => {
      pass += 1
      if (pass === 1) { t += 10_000; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, sent: 30, failed: 0, skipped: 0, remaining: 5 }) }) }
      return new Promise((resolve) => { release = () => resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, sent: 5, failed: 0, skipped: 0, remaining: 0 }) }) })
    }
    render(<FairAssistantClient />)
    fireEvent.click(await screen.findByTestId('fair-tab-outreach'))
    fireEvent.click(await screen.findByRole('button', { name: /Write and send to 2 leads/ }))
    const bar = await screen.findByTestId('fair-send-progress')
    await waitFor(() => expect(bar).toHaveTextContent('3 per second'))
    expect(bar).not.toHaveTextContent(/max/)
    await waitFor(() => expect(release).toBeDefined()); release()
  })
})

describe('Send loop: no fixed pass limit, rate-limit waits, quota stop', () => {
  const json = (o) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(o) })
  const start = async () => {
    render(<FairAssistantClient />)
    fireEvent.click(await screen.findByTestId('fair-tab-outreach'))
    fireEvent.click(await screen.findByRole('button', { name: /Write and send to 2 leads/ }))
  }

  test('keeps going past 20 passes while mails are moving (a 340+ lead batch is not cut off)', async () => {
    let pass = 0
    sendHandler = () => { pass += 1; return json({ ok: true, sent: 10, failed: 0, skipped: 0, remaining: pass < 25 ? 100 : 0, perSecond: 3 }) }
    await start()
    await waitFor(() => expect(screen.getByText(/Done — 250 sent/)).toBeInTheDocument(), { timeout: 8000 })
    expect(pass).toBe(25)
  })

  test('when Resend asks to slow down it waits, says so, then continues and finishes', async () => {
    let pass = 0
    sendHandler = () => {
      pass += 1
      if (pass === 1) return json({ ok: true, sent: 0, failed: 0, skipped: 0, deferred: 3, remaining: 5, retryAfterMs: 600, perSecond: 3 })
      return json({ ok: true, sent: 5, failed: 0, skipped: 0, remaining: 0, perSecond: 3 })
    }
    await start()
    expect(await screen.findByText(/Resend asked us to slow down\. Continuing in 1 s\./)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Done — 5 sent/)).toBeInTheDocument(), { timeout: 4000 })
    expect(pass).toBe(2)
  })

  test('a quota stop ends the loop with a clear message and no Done summary', async () => {
    let pass = 0
    sendHandler = () => { pass += 1; return json({ ok: true, sent: 3, failed: 0, skipped: 0, remaining: 4, blocked: 'quota', perSecond: 3 }) }
    await start()
    expect(await screen.findByText(/sending limit is reached\. Nothing was lost: 4 emails are waiting/)).toBeInTheDocument()
    expect(screen.queryByText(/Done —/)).not.toBeInTheDocument()
    expect(pass).toBe(1)
  })

  test('stops with an error only when nothing moves for 6 passes in a row', async () => {
    let pass = 0
    sendHandler = () => { pass += 1; return json({ ok: true, sent: 0, failed: 0, skipped: 0, remaining: 5 }) }
    await start()
    expect(await screen.findByText(/Sending is not moving/)).toBeInTheDocument()
    expect(pass).toBe(6)
  })
})
