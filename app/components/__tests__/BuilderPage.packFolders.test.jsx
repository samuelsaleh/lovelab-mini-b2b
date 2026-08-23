/**
 * BuilderPage — pack fair folders + personal hiding (Phase 34).
 *
 * The pack strip used to be one flat row of every pack anyone could see. It is
 * now a folder browser: each trade fair is a folder tile at the front of the
 * strip, opening one narrows the strip to the packs filed under it, and you file
 * a pack by dragging its card onto a tile the way you drop a file on a Drive
 * folder. A drop bar also appears while dragging so the folders stay reachable
 * when the strip is scrolled past them.
 *
 * Two different scopes are at play and the tests keep them apart:
 *   - Fair membership is SHARED. Everyone sees the same folder contents and
 *     anyone — admin or agent — can drag a pack in or out.
 *   - Hiding is PERSONAL. It takes the card out of your own strip only, and is
 *     always reversible via "Show hidden".
 *
 * Reordering the strip (dropping a card on another card) stays admin-only, so
 * these tests also pin that the two drag gestures don't bleed into each other.
 */

import React from 'react'
import { screen, fireEvent, act, waitFor, within } from '@testing-library/react'
import { renderWithI18n } from './testUtils'

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))

jest.mock('@/lib/api', () => ({ sendBuilderChat: jest.fn() }))

const BuilderPage = require('../BuilderPage').default

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FRANKFURT = { id: 'f-1', name: 'Ambiente Frankfurt', start_date: null, end_date: null, pack_count: 1, doc_count: 4, can_delete: true }
const PARIS = { id: 'f-2', name: 'Les Journe\u0301es d\u2019Achats Paris', start_date: null, end_date: null, pack_count: 0, doc_count: 0, can_delete: true }

function pack(overrides) {
  return {
    id: 'p-x',
    label: 'Pack X',
    description: ['SHAPY'],
    budget_label: '€55',
    fixed_total: 970,
    scope: 'global',
    is_seed: true,
    fair_ids: [],
    hidden: false,
    pinned: false,
    form_rows: [{
      collection: 'CUTY', carat: '0.10', colorCord: 'Black', quantity: '1',
      size: 'M', bpColor: 'Yellow', setting: '', shape: '', cert: 'In-house',
    }],
    ...overrides,
  }
}

// Filed under Frankfurt.
const PACK_ONE = pack({ id: 'p-1', label: 'Pack One', fair_ids: ['f-1'] })
// Unfiled.
const PACK_TWO = pack({ id: 'p-2', label: 'Pack Two', fair_ids: [] })
// The Synalia case: still restricted-visible to its agents, but hidden for us.
const PACK_SYN = pack({ id: 'p-3', label: 'PACK 6-RB-SYN', fair_ids: [], hidden: true })

const DEFAULT_PACKS = [PACK_ONE, PACK_TWO, PACK_SYN]
const DEFAULT_FAIRS = [FRANKFURT, PARIS]

// ─── Harness ─────────────────────────────────────────────────────────────────

let originalFetch

function installFetch({
  packs = DEFAULT_PACKS,
  fairs = DEFAULT_FAIRS,
  failWrites = false,
  failCreate = false,
  failDelete = false,
  notInstalled = false,
} = {}) {
  global.fetch = jest.fn().mockImplementation((url, opts = {}) => {
    const u = String(url)
    const method = String(opts.method || 'GET').toUpperCase()
    if (u.endsWith('/fairs') || u.endsWith('/hidden') || u.endsWith('/pinned')) {
      // The pre-migration state: the tables don't exist, so every write 503s.
      if (notInstalled) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({
            error: 'Pack folders are not set up in this database yet.',
            code: 'PACK_FOLDERS_NOT_INSTALLED',
          }),
        })
      }
      return Promise.resolve({
        ok: !failWrites,
        json: () => Promise.resolve(failWrites ? { error: 'nope' } : { ok: true }),
      })
    }
    if (u.includes('/api/pack-fairs')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ fairs }) })
    }
    if (u.includes('/api/events/') && method === 'DELETE') {
      return Promise.resolve({
        ok: !failDelete,
        json: () => Promise.resolve(failDelete ? { error: 'nope' } : { success: true }),
      })
    }
    if (u.includes('/api/events')) {
      return Promise.resolve({
        ok: !failCreate,
        json: () => Promise.resolve(failCreate
          ? { error: 'nope' }
          : { event: { id: 'f-new', name: 'Basel 2027', type: 'fair' } }),
      })
    }
    if (u.includes('/api/packs')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ packs }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
  return global.fetch
}

beforeEach(() => { originalFetch = global.fetch })
afterEach(() => { global.fetch = originalFetch })

function renderBuilder({ isAdmin = true } = {}) {
  return renderWithI18n(
    <BuilderPage
      lines={[]}
      setLines={jest.fn()}
      onGenerateQuote={jest.fn()}
      budget=""
      setBudget={jest.fn()}
      budgetRecommendations={null}
      showRecommendations={false}
      setShowRecommendations={jest.fn()}
      onRequestRecommendations={jest.fn()}
      isAdmin={isAdmin}
    />,
  )
}

async function openPacks() {
  fireEvent.click(screen.getByText('Packs').closest('button'))
  await screen.findByTestId('pack-folder-bar')
}

// Folders live in their own row above the pack strip and are always present, so
// the open one is simply the highlighted tile and "All packs" is how you clear
// the filter — there is no breadcrumb.
function tile(id) {
  return screen.getByTestId(`pack-folder-tile-${id}`)
}

function openFolder(id) {
  fireEvent.click(tile(id))
}

function backToRoot() {
  fireEvent.click(tile('all'))
}

function bar() {
  return screen.getByTestId('pack-folder-bar')
}

// The pack count is the last element on a folder tile. Read that element rather
// than parsing the tile's text, which would mangle a name ending in digits
// ("Basel 2027" + "0" reads as "20270").
function folderCount(id) {
  return tile(id).lastElementChild.textContent.trim()
}

// Empty folders are collapsed behind "+N empty" until asked for.
function revealEmptyFolders() {
  const toggle = screen.queryByTestId('pack-folder-show-all')
  if (toggle) fireEvent.click(toggle)
}

// A minimal DataTransfer stand-in: the handlers set effectAllowed/dropEffect
// and call setData, none of which jsdom provides on synthetic events.
function dataTransfer() {
  return { effectAllowed: '', dropEffect: '', setData: jest.fn(), getData: jest.fn() }
}

// Drag `packId`'s card onto the folder `fairId`, the Drive-style file gesture.
//
// Each fireEvent must be its own call, NOT batched inside one act(): the drop
// handler reads the dragged pack id from state, and batching would leave it
// stale. Real browsers fire dragStart and drop in separate turns, so a re-render
// always happens in between. The tile is also resolved after dragStart, since a
// drag is what reveals the empty folders.
function dragPackOntoFair(packId, fairId, { admin = true } = {}) {
  const dt = dataTransfer()
  const card = screen.getByTestId(admin ? `pack-card-draggable-${packId}` : `pack-card-${packId}`)
  fireEvent.dragStart(card, { dataTransfer: dt })
  fireEvent.dragOver(tile(fairId), { dataTransfer: dt })
  fireEvent.drop(tile(fairId), { dataTransfer: dt })
}

function writeCalls(suffix) {
  return global.fetch.mock.calls.filter(([url]) => String(url).endsWith(suffix))
}

function bodyOf(call) {
  return JSON.parse(call[1].body)
}

// ─── Folder row ──────────────────────────────────────────────────────────────

describe('BuilderPage — folder row', () => {
  it('renders All packs plus every non-empty folder, each with a count', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    // Counts come from the packs the caller can actually see, hidden included,
    // so a folder never promises cards that aren't there.
    expect(tile('all')).toHaveTextContent('All packs')
    expect(folderCount('all')).toBe('3')
    expect(tile('f-1')).toHaveTextContent('Ambiente Frankfurt')
    expect(folderCount('f-1')).toBe('1')
    expect(folderCount('__unsorted__')).toBe('2')
  })

  it('collapses folders with no packs behind a "+N empty" toggle', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    // Paris holds nothing, so it stays out of the way by default — with a dozen
    // fairs, mostly-empty folders were the bulk of the row.
    expect(screen.queryByTestId('pack-folder-tile-f-2')).not.toBeInTheDocument()
    expect(screen.getByTestId('pack-folder-show-all')).toHaveTextContent('+1 empty')

    revealEmptyFolders()
    expect(tile('f-2')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('pack-folder-show-fewer'))
    expect(screen.queryByTestId('pack-folder-tile-f-2')).not.toBeInTheDocument()
  })

  it('reveals every folder automatically while a pack is being dragged', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack Two')

    expect(screen.queryByTestId('pack-folder-tile-f-2')).not.toBeInTheDocument()

    // Filing into an empty folder is the whole reason it exists, so starting a
    // drag has to expose it without a detour through the toggle.
    fireEvent.dragStart(screen.getByTestId('pack-card-draggable-p-2'), { dataTransfer: dataTransfer() })
    expect(tile('f-2')).toBeInTheDocument()

    fireEvent.dragEnd(screen.getByTestId('pack-card-draggable-p-2'))
    expect(screen.queryByTestId('pack-folder-tile-f-2')).not.toBeInTheDocument()
  })

  it('keeps the open folder visible even after it becomes empty', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    openFolder('f-1')
    act(() => { fireEvent.click(screen.getByTestId('pack-unfile-p-1')) })

    // Otherwise unfiling the last pack would make the folder you are standing
    // in vanish out from under you.
    await waitFor(() => expect(tile('f-1')).toBeInTheDocument())
  })

  it('loads the fair list from /api/pack-fairs, not /api/events', async () => {
    const fetchMock = installFetch()
    renderBuilder()
    await openPacks()
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/pack-fairs')).toBe(true)
    })
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/events'))).toBe(false)
  })

  it('renders no fair tiles when there are no fairs yet', async () => {
    installFetch({ fairs: [] })
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    expect(tile('all')).toBeInTheDocument()
    expect(screen.queryByTestId('pack-folder-tile-f-1')).not.toBeInTheDocument()
    // Unsorted is still offered, so unfiled packs remain groupable.
    expect(tile('__unsorted__')).toBeInTheDocument()
  })

  it('stays visible inside a folder, so navigating is always one click', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    openFolder('f-1')

    // No breadcrumb: the row itself is the navigation and the open folder is
    // simply the highlighted tile.
    expect(tile('all')).toBeInTheDocument()
    expect(tile('f-1')).toBeInTheDocument()
    expect(screen.queryByTestId('pack-folder-up')).not.toBeInTheDocument()
  })

  it('does not push the pack cards out of the strip', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    // The regression this row exists to fix: with a dozen fairs, folder tiles
    // inside the strip meant scrolling past all of them to reach a pack.
    const strip = screen.getByTestId('pack-card-draggable-p-1').parentElement
    expect(within(strip).queryByTestId('pack-folder-tile-f-1')).not.toBeInTheDocument()
    expect(within(strip).queryByTestId('pack-folder-tile-all')).not.toBeInTheDocument()
  })
})

// ─── Creating a folder ───────────────────────────────────────────────────────

describe('BuilderPage — creating a folder from the strip', () => {
  function createCalls() {
    return global.fetch.mock.calls.filter(([url]) => String(url).includes('/api/events'))
  }

  async function typeNewFolder(name) {
    fireEvent.click(screen.getByTestId('pack-folder-new'))
    fireEvent.change(await screen.findByTestId('pack-folder-new-input'), { target: { value: name } })
  }

  it('creates a type=fair event and adds the tile without a refetch', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    await typeNewFolder('Basel 2027')
    act(() => { fireEvent.click(screen.getByTestId('pack-folder-new-save')) })

    await waitFor(() => expect(createCalls()).toHaveLength(1))
    const call = createCalls()[0]
    expect(call[1].method).toBe('POST')
    // type must be 'fair' or the folder would never show in the pack strip.
    expect(JSON.parse(call[1].body)).toEqual({ name: 'Basel 2027', type: 'fair' })

    // The new tile is there, empty, and ready to be dropped into.
    const created = await screen.findByTestId('pack-folder-tile-f-new')
    expect(created).toHaveTextContent('Basel 2027')
    expect(folderCount('f-new')).toBe('0')
    // Form closed again.
    expect(screen.queryByTestId('pack-folder-new-form')).not.toBeInTheDocument()
  })

  it('lets an agent create one too — folders are shared, not admin-owned', async () => {
    installFetch()
    renderBuilder({ isAdmin: false })
    await openPacks()
    await screen.findByText('Pack One')

    await typeNewFolder('Basel 2027')
    act(() => { fireEvent.click(screen.getByTestId('pack-folder-new-save')) })

    await waitFor(() => expect(createCalls()).toHaveLength(1))
    expect(await screen.findByTestId('pack-folder-tile-f-new')).toBeInTheDocument()
  })

  it('can be filed into straight away, without reloading', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack Two')

    await typeNewFolder('Basel 2027')
    act(() => { fireEvent.click(screen.getByTestId('pack-folder-new-save')) })
    await screen.findByTestId('pack-folder-tile-f-new')

    dragPackOntoFair('p-2', 'f-new')

    await waitFor(() => expect(writeCalls('/p-2/fairs')).toHaveLength(1))
    expect(bodyOf(writeCalls('/p-2/fairs')[0])).toEqual({ event_ids: ['f-new'] })
  })

  it('refuses a name that already exists, without calling the API', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    // Same name in a different case — still a duplicate tile.
    await typeNewFolder('  ambiente frankfurt ')
    act(() => { fireEvent.click(screen.getByTestId('pack-folder-new-save')) })

    expect(await screen.findByTestId('pack-folder-new-error')).toHaveTextContent(/already exists/i)
    expect(createCalls()).toHaveLength(0)
  })

  it('reports a failed create and keeps what you typed', async () => {
    installFetch({ failCreate: true })
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    await typeNewFolder('Basel 2027')
    act(() => { fireEvent.click(screen.getByTestId('pack-folder-new-save')) })

    expect(await screen.findByTestId('pack-folder-new-error')).toHaveTextContent(/could not create/i)
    // No phantom tile, and the name survives so it can be retried.
    expect(screen.queryByTestId('pack-folder-tile-f-new')).not.toBeInTheDocument()
    expect(screen.getByTestId('pack-folder-new-input')).toHaveValue('Basel 2027')
  })

  it('will not submit an empty or whitespace-only name', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    await typeNewFolder('   ')
    expect(screen.getByTestId('pack-folder-new-save')).toBeDisabled()
    act(() => { fireEvent.click(screen.getByTestId('pack-folder-new-save')) })
    expect(createCalls()).toHaveLength(0)
  })

  it('Enter creates, Escape abandons the form', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    await typeNewFolder('Basel 2027')
    act(() => { fireEvent.keyDown(screen.getByTestId('pack-folder-new-input'), { key: 'Enter' }) })
    await waitFor(() => expect(createCalls()).toHaveLength(1))
    // The form closes on success, which is what puts the tile back.
    await screen.findByTestId('pack-folder-tile-f-new')

    await typeNewFolder('Thrown away')
    act(() => { fireEvent.keyDown(screen.getByTestId('pack-folder-new-input'), { key: 'Escape' }) })
    expect(screen.queryByTestId('pack-folder-new-form')).not.toBeInTheDocument()
    expect(createCalls()).toHaveLength(1)
  })

  it('stays available from inside a folder too, since the row never moves', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    expect(screen.getByTestId('pack-folder-new')).toBeInTheDocument()
    openFolder('f-1')
    expect(screen.getByTestId('pack-folder-new')).toBeInTheDocument()
  })

  it('keeps the new folder on screen even though it is empty', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    await typeNewFolder('Basel 2027')
    act(() => { fireEvent.click(screen.getByTestId('pack-folder-new-save')) })

    // Empty folders are normally collapsed; the one you just made must not be,
    // or it would appear to do nothing.
    expect(await screen.findByTestId('pack-folder-tile-f-new')).toBeInTheDocument()
    expect(folderCount('f-new')).toBe('0')
  })
})

// ─── Deleting a folder ───────────────────────────────────────────────────────
//
// Only empty folders (no packs AND no documents) can be deleted from here.
// These events are also document folders — deleting INHORGENTA would unfile
// every order in it. The × is offered only when that cannot happen.

describe('BuilderPage — deleting a folder', () => {
  const originalConfirm = window.confirm
  beforeEach(() => { window.confirm = jest.fn(() => true) })
  afterEach(() => { window.confirm = originalConfirm })

  function deleteCalls() {
    return global.fetch.mock.calls.filter(([url, opts]) => (
      String(url).includes('/api/events/') && String(opts?.method || '').toUpperCase() === 'DELETE'
    ))
  }

  it('offers delete on an empty folder you are allowed to remove', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    revealEmptyFolders()
    expect(screen.getByTestId('pack-folder-delete-f-2')).toBeInTheDocument()
  })

  it('does not offer delete on a folder that still holds packs or documents', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    // Frankfurt has a pack and documents.
    expect(screen.queryByTestId('pack-folder-delete-f-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pack-folder-delete-all')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pack-folder-delete-__unsorted__')).not.toBeInTheDocument()
  })

  it('does not offer delete when the folder holds documents even if it has no packs', async () => {
    installFetch({
      fairs: [{ ...PARIS, doc_count: 3 }],
    })
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    revealEmptyFolders()
    expect(screen.queryByTestId('pack-folder-delete-f-2')).not.toBeInTheDocument()
  })

  it('lets you delete a folder you just created', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    fireEvent.click(screen.getByTestId('pack-folder-new'))
    fireEvent.change(await screen.findByTestId('pack-folder-new-input'), { target: { value: 'Basel 2027' } })
    act(() => { fireEvent.click(screen.getByTestId('pack-folder-new-save')) })
    await screen.findByTestId('pack-folder-tile-f-new')

    act(() => { fireEvent.click(screen.getByTestId('pack-folder-delete-f-new')) })
    await waitFor(() => expect(deleteCalls()).toHaveLength(1))
    expect(deleteCalls()[0][0]).toBe('/api/events/f-new')
    await waitFor(() => {
      expect(screen.queryByTestId('pack-folder-tile-f-new')).not.toBeInTheDocument()
    })
  })

  it('does nothing if you cancel the confirm', async () => {
    window.confirm = jest.fn(() => false)
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    revealEmptyFolders()
    act(() => { fireEvent.click(screen.getByTestId('pack-folder-delete-f-2')) })
    expect(deleteCalls()).toHaveLength(0)
    expect(tile('f-2')).toBeInTheDocument()
  })

  it('puts the folder back when the delete fails', async () => {
    installFetch({ failDelete: true })
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    revealEmptyFolders()
    act(() => { fireEvent.click(screen.getByTestId('pack-folder-delete-f-2')) })
    await waitFor(() => expect(deleteCalls()).toHaveLength(1))
    await waitFor(() => expect(tile('f-2')).toBeInTheDocument())
    expect(screen.getByTestId('pack-sync-error')).toBeInTheDocument()
  })
})

// ─── Pinning a pack above the folders ────────────────────────────────────────
//
// A pinned pack leaves the folder strip and sits in its own row above the
// folder tiles, and it stays there whichever fair you open. That is how Pack 1
// and the folders coexist.

describe('BuilderPage — pinning a pack above the folders', () => {
  it('has no pinned row until something is pinned', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    expect(screen.queryByTestId('pack-pinned-row')).not.toBeInTheDocument()
  })

  it('moves the pack into a row above the folders and persists the pin', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack Two')

    act(() => { fireEvent.click(screen.getByTestId('pack-pin-toggle-p-2')) })

    await waitFor(() => expect(writeCalls('/p-2/pinned')).toHaveLength(1))
    expect(writeCalls('/p-2/pinned')[0][1].method).toBe('PUT')
    expect(bodyOf(writeCalls('/p-2/pinned')[0])).toEqual({ pinned: true })

    const pinnedRow = screen.getByTestId('pack-pinned-row')
    expect(within(pinnedRow).getByText('Pack Two')).toBeInTheDocument()
    // No longer in the folder strip under the folders.
    const strip = screen.getByText('Save current build').parentElement
    expect(within(strip).queryByText('Pack Two')).not.toBeInTheDocument()
    // Folders sit between the pinned row and the rest of the packs.
    const pinnedIndex = pinnedRow.compareDocumentPosition(screen.getByTestId('pack-folder-bar'))
    expect(pinnedIndex & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps a pinned pack visible when you open a folder it is not filed in', async () => {
    installFetch({ packs: [PACK_ONE, pack({ id: 'p-2', label: 'Pack Two', pinned: true })] })
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack Two')

    openFolder('f-1')

    // Pack Two is unfiled, so without the pin it would vanish inside Frankfurt.
    const pinnedRow = screen.getByTestId('pack-pinned-row')
    expect(within(pinnedRow).getByText('Pack Two')).toBeInTheDocument()
    expect(screen.getByText('Pack One')).toBeInTheDocument()
  })

  it('unpins and puts the pack back under the folders', async () => {
    installFetch({ packs: [pack({ id: 'p-2', label: 'Pack Two', pinned: true })] })
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack Two')

    expect(screen.getByTestId('pack-pinned-row')).toBeInTheDocument()
    act(() => { fireEvent.click(screen.getByTestId('pack-pin-toggle-p-2')) })

    await waitFor(() => expect(writeCalls('/p-2/pinned')).toHaveLength(1))
    expect(bodyOf(writeCalls('/p-2/pinned')[0])).toEqual({ pinned: false })
    await waitFor(() => {
      expect(screen.queryByTestId('pack-pinned-row')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Pack Two')).toBeInTheDocument()
  })
})

// ─── Filtering ───────────────────────────────────────────────────────────────

describe('BuilderPage — folder filtering', () => {
  it('selecting a fair narrows the strip to the packs filed under it', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    // All packs → both visible packs (the hidden one is out by default).
    expect(screen.getByText('Pack One')).toBeInTheDocument()
    expect(screen.getByText('Pack Two')).toBeInTheDocument()

    openFolder('f-1')

    expect(screen.getByText('Pack One')).toBeInTheDocument()
    expect(screen.queryByText('Pack Two')).not.toBeInTheDocument()
  })

  it('Unsorted shows only the packs in no fair', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    openFolder('__unsorted__')

    expect(screen.getByText('Pack Two')).toBeInTheDocument()
    expect(screen.queryByText('Pack One')).not.toBeInTheDocument()
  })

  it('shows a prompt in an empty fair folder instead of a blank strip', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    revealEmptyFolders()
    openFolder('f-2')

    expect(screen.getByTestId('pack-folder-empty')).toHaveTextContent(/drag a pack/i)
  })

  it('going back to All packs restores the full strip', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    openFolder('f-1')
    expect(screen.queryByText('Pack Two')).not.toBeInTheDocument()
    backToRoot()
    expect(screen.getByText('Pack Two')).toBeInTheDocument()
  })
})

// ─── Drag a pack into a fair ─────────────────────────────────────────────────

describe('BuilderPage — filing a pack into a fair by dragging', () => {
  it('dropping a card on a folder tile files it there and persists the merged set', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack Two')

    dragPackOntoFair('p-2', 'f-1')

    // The new set is the union, so a pack keeps the fairs it was already in.
    await waitFor(() => expect(writeCalls('/p-2/fairs')).toHaveLength(1))
    const call = writeCalls('/p-2/fairs')[0]
    expect(call[1].method).toBe('PUT')
    expect(bodyOf(call)).toEqual({ event_ids: ['f-1'] })

    // The tile count grows and the card now shows up inside that folder.
    await waitFor(() => expect(folderCount('f-1')).toBe('2'))
    openFolder('f-1')
    expect(screen.getByText('Pack Two')).toBeInTheDocument()
  })

  it('files a pack into an empty folder, which the drag itself reveals', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack Two')

    // Paris is collapsed at rest; dragging exposes it so it can be filled.
    expect(screen.queryByTestId('pack-folder-tile-f-2')).not.toBeInTheDocument()
    dragPackOntoFair('p-2', 'f-2')

    await waitFor(() => expect(writeCalls('/p-2/fairs')).toHaveLength(1))
    expect(bodyOf(writeCalls('/p-2/fairs')[0])).toEqual({ event_ids: ['f-2'] })
    // It now has a pack, so it stays in the row without being expanded.
    await waitFor(() => expect(folderCount('f-2')).toBe('1'))
  })

  it('moves a pack between folders from inside one, without going back to root', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    // The folder row stays put inside a folder, so the target is right there.
    openFolder('f-1')
    dragPackOntoFair('p-1', 'f-2')

    await waitFor(() => expect(writeCalls('/p-1/fairs')).toHaveLength(1))
    expect(bodyOf(writeCalls('/p-1/fairs')[0])).toEqual({ event_ids: ['f-1', 'f-2'] })
  })

  it('keeps the fairs a pack is already in when filing it into another', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    // Pack One is already in Frankfurt; file it into Paris too.
    dragPackOntoFair('p-1', 'f-2')

    await waitFor(() => expect(writeCalls('/p-1/fairs')).toHaveLength(1))
    expect(bodyOf(writeCalls('/p-1/fairs')[0])).toEqual({ event_ids: ['f-1', 'f-2'] })

    // It is now in both folders at once.
    openFolder('f-1')
    expect(screen.getByText('Pack One')).toBeInTheDocument()
    backToRoot()
    openFolder('f-2')
    expect(screen.getByText('Pack One')).toBeInTheDocument()
  })

  it('does nothing when the pack is already in that fair', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    dragPackOntoFair('p-1', 'f-1')

    await waitFor(() => expect(folderCount('f-1')).toBe('1'))
    expect(writeCalls('/p-1/fairs')).toHaveLength(0)
  })

  it('lets a NON-admin file a pack, even though they cannot reorder the strip', async () => {
    installFetch()
    renderBuilder({ isAdmin: false })
    await openPacks()
    await screen.findByText('Pack Two')

    // No reorder handle for an agent...
    expect(screen.queryByTestId('pack-card-draggable-p-2')).not.toBeInTheDocument()
    // ...but the card is still draggable into a folder.
    const card = screen.getByTestId('pack-card-p-2')
    expect(card).toHaveAttribute('draggable', 'true')

    dragPackOntoFair('p-2', 'f-1', { admin: false })

    await waitFor(() => expect(writeCalls('/p-2/fairs')).toHaveLength(1))
    expect(bodyOf(writeCalls('/p-2/fairs')[0])).toEqual({ event_ids: ['f-1'] })
  })

  it('rolls the card back to its old folders when the write fails', async () => {
    installFetch({ failWrites: true })
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack Two')

    dragPackOntoFair('p-2', 'f-1')

    await waitFor(() => expect(writeCalls('/p-2/fairs')).toHaveLength(1))
    // Count is back to 1 and the folder does not contain Pack Two.
    await waitFor(() => expect(folderCount('f-1')).toBe('1'))
    openFolder('f-1')
    expect(screen.queryByText('Pack Two')).not.toBeInTheDocument()
  })
})

// ─── Remove from a fair ──────────────────────────────────────────────────────

describe('BuilderPage — removing a pack from a fair', () => {
  it('offers the unfile control only inside a fair folder', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    // Not in All packs (which fair would it leave?) …
    expect(screen.queryByTestId('pack-unfile-p-1')).not.toBeInTheDocument()
    // … but yes once you're looking at Frankfurt.
    openFolder('f-1')
    expect(screen.getByTestId('pack-unfile-p-1')).toBeInTheDocument()
  })

  it('unfiling drops just that fair and keeps the pack alive', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    openFolder('f-1')
    act(() => { fireEvent.click(screen.getByTestId('pack-unfile-p-1')) })

    await waitFor(() => expect(writeCalls('/p-1/fairs')).toHaveLength(1))
    expect(bodyOf(writeCalls('/p-1/fairs')[0])).toEqual({ event_ids: [] })

    // Gone from the folder, still there in All packs.
    expect(screen.queryByText('Pack One')).not.toBeInTheDocument()
    backToRoot()
    expect(screen.getByText('Pack One')).toBeInTheDocument()
    expect(folderCount('__unsorted__')).toBe('3')
  })
})

// ─── Personal hiding ─────────────────────────────────────────────────────────

describe('BuilderPage — hiding a pack for yourself only', () => {
  it('leaves an already-hidden pack out of the strip and offers to show it', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    // This is the Synalia case: the pack still exists and still counts, it just
    // isn't in our way.
    expect(screen.queryByText('PACK 6-RB-SYN')).not.toBeInTheDocument()
    expect(screen.getByTestId('pack-show-hidden-toggle')).toHaveTextContent('Show hidden (1)')
  })

  it('"Show hidden" reveals the pack, and the toggle flips back', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    fireEvent.click(screen.getByTestId('pack-show-hidden-toggle'))
    expect(screen.getByText('PACK 6-RB-SYN')).toBeInTheDocument()
    expect(screen.getByTestId('pack-show-hidden-toggle')).toHaveTextContent('Hide hidden (1)')

    fireEvent.click(screen.getByTestId('pack-show-hidden-toggle'))
    expect(screen.queryByText('PACK 6-RB-SYN')).not.toBeInTheDocument()
  })

  it('hiding a pack removes it from the strip and persists the choice', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack Two')

    act(() => { fireEvent.click(screen.getByTestId('pack-hide-toggle-p-2')) })

    await waitFor(() => expect(writeCalls('/p-2/hidden')).toHaveLength(1))
    const call = writeCalls('/p-2/hidden')[0]
    expect(call[1].method).toBe('PUT')
    expect(bodyOf(call)).toEqual({ hidden: true })

    expect(screen.queryByText('Pack Two')).not.toBeInTheDocument()
    expect(screen.getByTestId('pack-show-hidden-toggle')).toHaveTextContent('Show hidden (2)')
  })

  it('unhiding restores the pack and persists hidden: false', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    fireEvent.click(screen.getByTestId('pack-show-hidden-toggle'))
    act(() => { fireEvent.click(screen.getByTestId('pack-hide-toggle-p-3')) })

    await waitFor(() => expect(writeCalls('/p-3/hidden')).toHaveLength(1))
    expect(bodyOf(writeCalls('/p-3/hidden')[0])).toEqual({ hidden: false })

    // No hidden packs left, so the toggle disappears and the card stays.
    await waitFor(() => {
      expect(screen.queryByTestId('pack-show-hidden-toggle')).not.toBeInTheDocument()
    })
    expect(screen.getByText('PACK 6-RB-SYN')).toBeInTheDocument()
  })

  it('rolls back when the hide request fails', async () => {
    installFetch({ failWrites: true })
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack Two')

    act(() => { fireEvent.click(screen.getByTestId('pack-hide-toggle-p-2')) })

    await waitFor(() => expect(writeCalls('/p-2/hidden')).toHaveLength(1))
    await waitFor(() => expect(screen.getByText('Pack Two')).toBeInTheDocument())
  })

  it('offers the hide toggle to agents too — it is a personal preference', async () => {
    installFetch()
    renderBuilder({ isAdmin: false })
    await openPacks()
    await screen.findByText('Pack Two')

    expect(screen.getByTestId('pack-hide-toggle-p-2')).toBeInTheDocument()
  })

  it('counts hidden packs per folder, not globally', async () => {
    // The hidden pack is unfiled, so Frankfurt has nothing hidden.
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    openFolder('f-1')
    expect(screen.queryByTestId('pack-show-hidden-toggle')).not.toBeInTheDocument()

    backToRoot()
    openFolder('__unsorted__')
    expect(screen.getByTestId('pack-show-hidden-toggle')).toHaveTextContent('Show hidden (1)')
  })
})

// ─── Explaining a bounced change ─────────────────────────────────────────────
//
// Both filing and hiding update the card first and undo it if the write fails.
// Silently, that reads as the pack un-hiding itself a split second after you
// click — the exact confusion reported against the first build. The reason must
// always be shown.

describe('BuilderPage — a change that could not be saved says why', () => {
  it('names the missing migration when hiding is not installed yet', async () => {
    installFetch({ notInstalled: true })
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack Two')

    act(() => { fireEvent.click(screen.getByTestId('pack-hide-toggle-p-2')) })

    const notice = await screen.findByTestId('pack-sync-error')
    expect(notice).toHaveTextContent(/aren.t set up in the database yet/i)
    expect(notice).toHaveTextContent(/migration/i)
    // The card is back, which is why the message matters.
    await waitFor(() => expect(screen.getByText('Pack Two')).toBeInTheDocument())
  })

  it('names the missing migration when filing is not installed yet', async () => {
    installFetch({ notInstalled: true })
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack Two')

    dragPackOntoFair('p-2', 'f-1')

    expect(await screen.findByTestId('pack-sync-error')).toHaveTextContent(/migration/i)
    await waitFor(() => expect(folderCount('f-1')).toBe('1'))
  })

  it('falls back to a generic explanation for an ordinary failure', async () => {
    installFetch({ failWrites: true })
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack Two')

    act(() => { fireEvent.click(screen.getByTestId('pack-hide-toggle-p-2')) })

    const notice = await screen.findByTestId('pack-sync-error')
    expect(notice).toHaveTextContent(/nope|undone|try again/i)
    expect(notice).not.toHaveTextContent(/migration/i)
  })

  it('can be dismissed, and clears itself on the next attempt', async () => {
    installFetch({ notInstalled: true })
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack Two')

    act(() => { fireEvent.click(screen.getByTestId('pack-hide-toggle-p-2')) })
    await screen.findByTestId('pack-sync-error')

    act(() => { fireEvent.click(screen.getByLabelText('Dismiss')) })
    expect(screen.queryByTestId('pack-sync-error')).not.toBeInTheDocument()
  })

  it('stays quiet when the write succeeds', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack Two')

    act(() => { fireEvent.click(screen.getByTestId('pack-hide-toggle-p-2')) })

    await waitFor(() => expect(writeCalls('/p-2/hidden')).toHaveLength(1))
    expect(screen.queryByTestId('pack-sync-error')).not.toBeInTheDocument()
  })
})

// ─── Reorder still works and stays admin-only ────────────────────────────────

describe('BuilderPage — reordering is unaffected', () => {
  it('dropping a card on another card still reorders for an admin', async () => {
    installFetch()
    renderBuilder()
    await openPacks()
    await screen.findByText('Pack One')

    const dt = dataTransfer()
    fireEvent.dragStart(screen.getByTestId('pack-card-draggable-p-1'), { dataTransfer: dt })
    fireEvent.dragOver(screen.getByTestId('pack-card-draggable-p-2'), { dataTransfer: dt })
    fireEvent.drop(screen.getByTestId('pack-card-draggable-p-2'), { dataTransfer: dt })

    await waitFor(() => {
      expect(global.fetch.mock.calls.some(([u]) => String(u) === '/api/packs/reorder')).toBe(true)
    })
    // No fair write leaked out of a card-to-card drop.
    expect(writeCalls('/fairs')).toHaveLength(0)
  })

  it('does not reorder for an agent dropping on another card', async () => {
    installFetch()
    renderBuilder({ isAdmin: false })
    await openPacks()
    await screen.findByText('Pack One')

    const dt = dataTransfer()
    fireEvent.dragStart(screen.getByTestId('pack-card-p-1'), { dataTransfer: dt })
    fireEvent.drop(screen.getByTestId('pack-card-p-2'), { dataTransfer: dt })

    await waitFor(() => {
      expect(global.fetch.mock.calls.some(([u]) => String(u) === '/api/packs/reorder')).toBe(false)
    })
  })
})

// ─── Applying a pack still works from inside a folder ────────────────────────

describe('BuilderPage — applying a pack from a folder', () => {
  it('adds the pack to the order while a fair folder is selected', async () => {
    installFetch()
    const setLines = jest.fn()
    renderWithI18n(
      <BuilderPage
        lines={[]}
        setLines={setLines}
        onGenerateQuote={jest.fn()}
        budget=""
        setBudget={jest.fn()}
        budgetRecommendations={null}
        showRecommendations={false}
        setShowRecommendations={jest.fn()}
        onRequestRecommendations={jest.fn()}
        isAdmin
      />,
    )
    await openPacks()
    await screen.findByText('Pack One')

    openFolder('f-1')
    const card = screen.getByTestId('pack-card-draggable-p-1')
    act(() => { fireEvent.click(within(card).getByText('+ Add pack')) })

    expect(setLines).toHaveBeenCalled()
  })
})
