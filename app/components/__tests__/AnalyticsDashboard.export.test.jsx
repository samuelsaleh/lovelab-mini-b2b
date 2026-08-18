/**
 * AnalyticsDashboard — Export Excel button.
 *
 * The export must mirror the dashboard exactly: whatever the channel pills
 * and the Event dropdown are showing is what lands in the file. Getting that
 * wrong would hand Sam a fair follow-up list containing other fairs' clients.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('recharts', () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return new Proxy({}, { get: () => Stub });
});
jest.mock('../AnalyticsChatPanel', () => () => <div />);

let capturedWorkbookCalls = [];
jest.mock('@/lib/analyticsExport', () => {
  const actual = jest.requireActual('@/lib/analyticsExport');
  return {
    ...actual,
    generateAnalyticsWorkbookBuffer: jest.fn(async (args) => {
      capturedWorkbookCalls.push(args);
      return new ArrayBuffer(8);
    }),
  };
});

import AnalyticsDashboard from '../AnalyticsDashboard';

const FAIR_A = 'event-inhorgenta';
const FAIR_B = 'event-nordstil';

const EVENTS = [
  { id: FAIR_A, name: 'INHORGENTA', type: 'fair' },
  { id: FAIR_B, name: 'Nordstil', type: 'fair' },
];

const makeDoc = (id, eventId, eventName, company, channel = 'b2b', extra = {}) => ({
  id,
  document_type: 'order',
  order_channel: channel,
  status: 'sent',
  total_amount: 1000,
  created_at: '2026-03-21T09:00:00.000Z',
  client_company: company,
  client_name: `${company} contact`,
  event_id: eventId,
  events: eventName ? { name: eventName } : null,
  metadata: {
    formState: {
      contactName: `${company} contact`,
      email: `${company.toLowerCase().replace(/\s+/g, '')}@example.com`,
      phone: '+3212345678',
      country: 'Germany',
      ...extra,
    },
  },
});

const DOCUMENTS = [
  makeDoc('d1', FAIR_A, 'INHORGENTA', 'ACME JEWELS'),
  makeDoc('d2', FAIR_A, 'INHORGENTA', 'BIJOUX LYON'),
  makeDoc('d3', FAIR_B, 'Nordstil', 'NORD SHOP'),
  makeDoc('d4', null, null, 'WEB BUYER', 'b2c'),
];

let downloads = [];
let originalCreateElement;

beforeEach(() => {
  capturedWorkbookCalls = [];
  downloads = [];

  global.fetch = jest.fn((url) => {
    const href = String(url);
    if (href.startsWith('/api/events')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ events: EVENTS }) });
    }
    if (href.startsWith('/api/documents')) {
      const page = Number(new URL(href, 'http://x').searchParams.get('page') || 1);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ documents: page === 1 ? DOCUMENTS : [] }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });

  global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = jest.fn();

  // Capture the anchor the export creates instead of letting jsdom navigate.
  originalCreateElement = document.createElement.bind(document);
  jest.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = originalCreateElement(tag);
    if (tag === 'a') {
      el.click = jest.fn(() => downloads.push(el.download));
    }
    return el;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function renderDashboard(props = {}) {
  render(<AnalyticsDashboard {...props} />);
  await screen.findByRole('button', { name: /export excel/i });
  // Wait for the document fetch to settle so `docs` is populated.
  await waitFor(() => expect(screen.getByRole('button', { name: /export excel/i })).toBeEnabled());
}

const exportButton = () => screen.getByRole('button', { name: /export excel|building/i });
const companiesInLastExport = () => capturedWorkbookCalls.at(-1).rows.map((r) => r.company);

describe('Export Excel button', () => {
  test('sits in the toolbar next to Ask AI', async () => {
    await renderDashboard();
    expect(screen.getByRole('button', { name: /export excel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ask ai/i })).toBeInTheDocument();
  });

  test('exports every visible row when no filter is applied', async () => {
    await renderDashboard();
    fireEvent.click(exportButton());
    await waitFor(() => expect(capturedWorkbookCalls).toHaveLength(1));
    expect(companiesInLastExport()).toEqual(['ACME JEWELS', 'BIJOUX LYON', 'NORD SHOP', 'WEB BUYER']);
  });

  test('triggers a download with a dated filename', async () => {
    await renderDashboard();
    fireEvent.click(exportButton());
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]).toMatch(/^LoveLab_Analytics_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
  });

  test('rows carry the contact details, not just the revenue columns', async () => {
    await renderDashboard();
    fireEvent.click(exportButton());
    await waitFor(() => expect(capturedWorkbookCalls).toHaveLength(1));
    const row = capturedWorkbookCalls[0].rows[0];
    expect(row).toMatchObject({
      company: 'ACME JEWELS',
      contact: 'ACME JEWELS contact',
      email: 'acmejewels@example.com',
      phone: '+3212345678',
      country: 'Germany',
      event: 'INHORGENTA',
    });
  });
});

describe('the export follows the dashboard filters', () => {
  test('selecting a fair exports only that fair', async () => {
    await renderDashboard();
    fireEvent.change(screen.getByDisplayValue('All Events & Agents'), { target: { value: FAIR_A } });
    fireEvent.click(exportButton());
    await waitFor(() => expect(capturedWorkbookCalls).toHaveLength(1));
    expect(companiesInLastExport()).toEqual(['ACME JEWELS', 'BIJOUX LYON']);
  });

  test('the filename carries the fair name', async () => {
    await renderDashboard();
    fireEvent.change(screen.getByDisplayValue('All Events & Agents'), { target: { value: FAIR_B } });
    fireEvent.click(exportButton());
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]).toMatch(/^LoveLab_Analytics_Nordstil_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  test('the B2C pill narrows the export to website sales', async () => {
    await renderDashboard();
    fireEvent.click(screen.getByText('B2C'));
    fireEvent.click(exportButton());
    await waitFor(() => expect(capturedWorkbookCalls).toHaveLength(1));
    expect(companiesInLastExport()).toEqual(['WEB BUYER']);
    expect(downloads[0]).toMatch(/_B2C_/);
  });

  test('the B2B pill excludes website sales', async () => {
    await renderDashboard();
    fireEvent.click(screen.getByText('B2B'));
    fireEvent.click(exportButton());
    await waitFor(() => expect(capturedWorkbookCalls).toHaveLength(1));
    expect(companiesInLastExport()).not.toContain('WEB BUYER');
  });

  test('the subtitle records which filters produced the file', async () => {
    await renderDashboard();
    fireEvent.change(screen.getByDisplayValue('All Events & Agents'), { target: { value: FAIR_A } });
    fireEvent.click(exportButton());
    await waitFor(() => expect(capturedWorkbookCalls).toHaveLength(1));
    expect(capturedWorkbookCalls[0].subtitle).toContain('INHORGENTA');
    expect(capturedWorkbookCalls[0].subtitle).toContain('2 rows');
  });
});

describe('edge cases', () => {
  test('the button is disabled when the filters match nothing', async () => {
    global.fetch = jest.fn((url) => {
      const href = String(url);
      if (href.startsWith('/api/events')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ events: EVENTS }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ documents: [] }) });
    });
    render(<AnalyticsDashboard />);
    const btn = await screen.findByRole('button', { name: /export excel/i });
    await waitFor(() => expect(btn).toBeDisabled());
    fireEvent.click(btn);
    expect(capturedWorkbookCalls).toHaveLength(0);
  });

  test('a failure while building shows an error instead of a broken download', async () => {
    const { generateAnalyticsWorkbookBuffer } = require('@/lib/analyticsExport');
    generateAnalyticsWorkbookBuffer.mockRejectedValueOnce(new Error('exceljs exploded'));
    await renderDashboard();
    fireEvent.click(exportButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not build the excel file/i);
    expect(downloads).toHaveLength(0);
    // The button recovers so a retry is possible.
    await waitFor(() => expect(screen.getByRole('button', { name: /export excel/i })).toBeEnabled());
  });
});
