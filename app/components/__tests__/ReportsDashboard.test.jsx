/**
 * Admin → Reports: the city column and the event filter.
 *
 * Two things are load-bearing here. The city is never stored as a city — it's
 * typed into a free address line — so the table has to read it back out or
 * every row says "Unknown". And the event filter has to hold more than one
 * event, otherwise "how did the German fairs do together" can't be asked.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import ReportsDashboard, { filtersFromSavedConfig, matchesEventFilter } from '../ReportsDashboard';

const FAIR_A = 'evt-inhorgenta';
const FAIR_B = 'evt-nordstil';
const AGENT = 'evt-nicolas';
const ONLINE = 'evt-online';

const EVENTS = [
  { id: FAIR_A, name: 'INHORGENTA', type: 'fair' },
  { id: FAIR_B, name: 'Nordstil', type: 'fair' },
  { id: AGENT, name: 'Nicolas Husserl-Franck', type: 'agent' },
  { id: ONLINE, name: 'ONLINE B2C', type: 'other' },
];

const eventName = (id) => EVENTS.find((e) => e.id === id)?.name || null;

const makeDoc = (id, eventId, company, formState) => ({
  id,
  document_type: 'order',
  order_channel: 'b2b',
  status: 'sent',
  total_amount: 1000,
  created_at: '2026-03-21T09:00:00.000Z',
  client_company: company,
  client_name: company,
  event_id: eventId,
  events: eventId ? { name: eventName(eventId) } : null,
  metadata: { formState: { country: 'Germany', ...formState } },
});

const DOCUMENTS = [
  // No address at all — genuinely unknown.
  makeDoc('d1', FAIR_A, 'Timefactory', { addressLine1: 'Unterer Dammweg 16', addressLine2: '' }),
  // The everyday case: postcode + city on the second line.
  makeDoc('d2', FAIR_A, 'Marl Shop', { addressLine1: 'Hauptstrasse 3', addressLine2: '45772 Marl' }),
  // Same city, shouted.
  makeDoc('d3', FAIR_B, 'Bijoux Lyon', { addressLine2: '69000 LYON', country: 'France' }),
  makeDoc('d4', AGENT, 'Lyon Deux', { addressLine2: '69001 Lyon', country: 'France' }),
  // A postcode typed into the city field, with the real city on the line.
  makeDoc('d5', ONLINE, 'Perl Shop', { city: '66706', addressLine2: '66706 Perl' }),
];

let savedPayloads = [];
let savedReports = [];

beforeEach(() => {
  savedPayloads = [];
  savedReports = [];

  global.fetch = jest.fn((url, options) => {
    const href = String(url);
    const ok = (body) => Promise.resolve({ ok: true, status: 200, json: async () => body });

    if (href.startsWith('/api/events')) return ok({ events: EVENTS });
    if (href.startsWith('/api/clients')) return ok({ clients: [] });
    if (href.startsWith('/api/reports')) {
      if (options?.method === 'POST') {
        const payload = JSON.parse(options.body);
        savedPayloads.push(payload);
        return ok({ report: { id: 'new-preset', ...payload } });
      }
      return ok({ reports: savedReports });
    }
    if (href.startsWith('/api/documents')) {
      const page = Number(new URL(href, 'http://x').searchParams.get('page') || 1);
      return ok({ documents: page === 1 ? DOCUMENTS : [], total_count: DOCUMENTS.length });
    }
    return ok({});
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function renderReports() {
  render(<ReportsDashboard />);
  await screen.findByRole('button', { name: /all events/i });
}

const resultCount = () => {
  const text = screen.getByText(/\d+ results?/).textContent;
  return Number(text.match(/(\d+) results?/)[1]);
};

const citySelect = () => screen.getByDisplayValue('All cities');
const cityOptions = () => within(citySelect()).getAllByRole('option').map((o) => o.textContent);
// The only button carrying aria-expanded is the event picker's trigger.
const eventButton = () =>
  screen.queryByRole('button', { expanded: false }) || screen.getByRole('button', { expanded: true });

// ─── City ──────────────────────────────────────────────────────────────────

describe('the City column', () => {
  test('reads the city out of the address line', async () => {
    await renderReports();
    const row = screen.getByRole('cell', { name: 'Marl Shop' }).closest('tr');
    expect(within(row).getByRole('cell', { name: 'Marl' })).toBeInTheDocument();
  });

  test('says Unknown only when there really is no city', async () => {
    await renderReports();
    const row = screen.getByRole('cell', { name: 'Timefactory' }).closest('tr');
    expect(within(row).getByRole('cell', { name: 'Unknown' })).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: 'Unknown' })).toHaveLength(1);
  });

  test('does not show a postcode where the city belongs', async () => {
    await renderReports();
    const row = screen.getByRole('cell', { name: 'Perl Shop' }).closest('tr');
    expect(within(row).getByRole('cell', { name: 'Perl' })).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: '66706' })).not.toBeInTheDocument();
  });

  test('one city, one entry in the filter — whatever the capitalisation', async () => {
    await renderReports();
    const options = cityOptions();
    expect(options.filter((o) => o.toLowerCase() === 'lyon')).toEqual(['Lyon']);
  });

  test('Unknown sits at the bottom of the filter', async () => {
    await renderReports();
    expect(cityOptions().at(-1)).toBe('Unknown');
  });

  test('picking a city catches both spellings of it', async () => {
    await renderReports();
    fireEvent.change(citySelect(), { target: { value: 'Lyon' } });
    await waitFor(() => expect(resultCount()).toBe(2));
    expect(screen.getByText('Bijoux Lyon')).toBeInTheDocument();
    expect(screen.getByText('Lyon Deux')).toBeInTheDocument();
  });
});

// ─── Events ────────────────────────────────────────────────────────────────

describe('the event filter', () => {
  test('starts on every event', async () => {
    await renderReports();
    expect(resultCount()).toBe(5);
  });

  test('holds more than one event at a time', async () => {
    await renderReports();
    fireEvent.click(eventButton());
    fireEvent.click(screen.getByRole('checkbox', { name: 'INHORGENTA' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Nordstil' }));

    await waitFor(() => expect(resultCount()).toBe(3));
    expect(screen.getByText('Timefactory')).toBeInTheDocument();
    expect(screen.getByText('Bijoux Lyon')).toBeInTheDocument();
    expect(screen.queryByText('Lyon Deux')).not.toBeInTheDocument();
  });

  test('the button counts what is selected', async () => {
    await renderReports();
    fireEvent.click(eventButton());
    fireEvent.click(screen.getByRole('checkbox', { name: 'INHORGENTA' }));
    await waitFor(() => expect(eventButton()).toHaveTextContent('INHORGENTA'));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Nordstil' }));
    await waitFor(() => expect(eventButton()).toHaveTextContent('2 events'));
  });

  test('a whole kind of event can be picked without ticking anything', async () => {
    await renderReports();
    fireEvent.click(eventButton());
    fireEvent.click(screen.getByRole('button', { name: 'Fairs' }));

    await waitFor(() => expect(resultCount()).toBe(3));
    expect(screen.queryByText('Lyon Deux')).not.toBeInTheDocument();
    expect(screen.queryByText('Perl Shop')).not.toBeInTheDocument();
    expect(eventButton()).toHaveTextContent('Fairs');
  });

  test('two kinds can be combined', async () => {
    await renderReports();
    fireEvent.click(eventButton());
    fireEvent.click(screen.getByRole('button', { name: 'Fairs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));

    await waitFor(() => expect(resultCount()).toBe(4));
    expect(eventButton()).toHaveTextContent('Fairs + Agents');
  });

  test('the kind narrows the list you can tick', async () => {
    await renderReports();
    fireEvent.click(eventButton());
    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));

    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'INHORGENTA' })).not.toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Nicolas Husserl-Franck' })).toBeInTheDocument();
  });

  test('changing the kind drops ticks you can no longer see', async () => {
    await renderReports();
    fireEvent.click(eventButton());
    fireEvent.click(screen.getByRole('checkbox', { name: 'INHORGENTA' }));
    await waitFor(() => expect(resultCount()).toBe(2));

    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    await waitFor(() => expect(resultCount()).toBe(1));
    expect(screen.getByText('Lyon Deux')).toBeInTheDocument();
  });

  test('search narrows the list', async () => {
    await renderReports();
    fireEvent.click(eventButton());
    fireEvent.change(screen.getByPlaceholderText('Search events'), { target: { value: 'nord' } });

    expect(screen.getByRole('checkbox', { name: 'Nordstil' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'INHORGENTA' })).not.toBeInTheDocument();
  });

  test('"select all shown" ticks the searched-for events and keeps earlier ones', async () => {
    await renderReports();
    fireEvent.click(eventButton());
    fireEvent.click(screen.getByRole('checkbox', { name: 'INHORGENTA' }));
    fireEvent.change(screen.getByPlaceholderText('Search events'), { target: { value: 'nord' } });
    fireEvent.click(screen.getByRole('button', { name: /select all shown/i }));

    await waitFor(() => expect(resultCount()).toBe(3));
  });

  test('clear puts everything back', async () => {
    await renderReports();
    fireEvent.click(eventButton());
    fireEvent.click(screen.getByRole('button', { name: 'Fairs' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'INHORGENTA' }));
    await waitFor(() => expect(resultCount()).toBe(2));

    fireEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    await waitFor(() => expect(resultCount()).toBe(5));
    expect(eventButton()).toHaveTextContent('All events');
  });
});

// ─── Presets ───────────────────────────────────────────────────────────────

describe('saved presets', () => {
  test('a preset stores the whole event selection', async () => {
    await renderReports();
    fireEvent.click(eventButton());
    fireEvent.click(screen.getByRole('checkbox', { name: 'INHORGENTA' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Nordstil' }));
    fireEvent.change(screen.getByPlaceholderText('Preset name'), { target: { value: 'German fairs' } });
    fireEvent.click(screen.getByRole('button', { name: /save preset/i }));

    await waitFor(() => expect(savedPayloads).toHaveLength(1));
    expect(savedPayloads[0].config.eventIds).toEqual([FAIR_A, FAIR_B]);
  });

  test('a preset saved before multi-select still loads', async () => {
    savedReports = [{ id: 'old', name: 'Inhorgenta only', config: { eventId: FAIR_A, country: 'all', city: 'all' } }];
    await renderReports();

    fireEvent.change(screen.getByDisplayValue('Load saved report'), { target: { value: 'old' } });
    await waitFor(() => expect(resultCount()).toBe(2));
    expect(eventButton()).toHaveTextContent('INHORGENTA');
  });
});

// ─── The pure bits ─────────────────────────────────────────────────────────

describe('filtersFromSavedConfig', () => {
  test('turns a legacy single event into a selection of one', () => {
    expect(filtersFromSavedConfig({ eventId: 'evt-1' })).toMatchObject({ eventIds: ['evt-1'], eventTypes: [] });
  });

  test('keeps a multi-select selection as it is', () => {
    expect(filtersFromSavedConfig({ eventIds: ['a', 'b'], eventTypes: ['fair'] }))
      .toMatchObject({ eventIds: ['a', 'b'], eventTypes: ['fair'] });
  });

  test('a new selection wins over a stale legacy key', () => {
    expect(filtersFromSavedConfig({ eventId: 'old', eventIds: ['new'] }).eventIds).toEqual(['new']);
  });

  test('column visibility is not a filter', () => {
    expect(filtersFromSavedConfig({ visibleColumns: ['Date'] })).not.toHaveProperty('visibleColumns');
  });

  test('survives junk', () => {
    expect(filtersFromSavedConfig()).toMatchObject({ eventIds: [], eventTypes: [], country: 'all' });
    expect(filtersFromSavedConfig({ eventIds: 'nope', eventTypes: null }))
      .toMatchObject({ eventIds: [], eventTypes: [] });
    expect(filtersFromSavedConfig({ eventIds: ['a', null, ''] }).eventIds).toEqual(['a']);
  });

  test('other filters come through untouched', () => {
    expect(filtersFromSavedConfig({ country: 'Germany', minAmount: '500' }))
      .toMatchObject({ country: 'Germany', minAmount: '500' });
  });
});

describe('matchesEventFilter', () => {
  const fairRow = { event_id: 'a', eventType: 'fair' };
  const agentRow = { event_id: 'b', eventType: 'agent' };
  const looseRow = { event_id: null, eventType: 'none' };

  test('no selection lets everything through', () => {
    for (const row of [fairRow, agentRow, looseRow]) {
      expect(matchesEventFilter(row, {})).toBe(true);
      expect(matchesEventFilter(row, { eventIds: [], eventTypes: [] })).toBe(true);
    }
  });

  test('ticked events win over the kind', () => {
    const filters = { eventIds: ['b'], eventTypes: ['fair'] };
    expect(matchesEventFilter(agentRow, filters)).toBe(true);
    expect(matchesEventFilter(fairRow, filters)).toBe(false);
  });

  test('a kind on its own selects every event of that kind', () => {
    expect(matchesEventFilter(fairRow, { eventTypes: ['fair'] })).toBe(true);
    expect(matchesEventFilter(agentRow, { eventTypes: ['fair'] })).toBe(false);
  });

  test('rows without an event drop out once anything is selected', () => {
    expect(matchesEventFilter(looseRow, { eventTypes: ['fair'] })).toBe(false);
    expect(matchesEventFilter(looseRow, { eventIds: ['a'] })).toBe(false);
  });
});
