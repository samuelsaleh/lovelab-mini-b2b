/**
 * Reports → model, carat and shape filters.
 *
 * They work per order line: a mixed order stays when one of its lines matches,
 * but its amount and Diamond cell shrink to the matching lines. Salesforce
 * accounts have no lines, so they go as soon as a diamond filter is on.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import ReportsDashboard, { filtersFromSavedConfig } from '../ReportsDashboard';

const doc = (id, company, rows, total) => ({
  id, document_type: 'order', order_channel: 'b2b', status: 'sent', total_amount: total,
  created_at: '2026-03-21T09:00:00.000Z', client_company: company, client_name: company,
  event_id: null, events: null,
  metadata: { formState: { country: 'Germany', rows } },
});

const DOCUMENTS = [
  doc('d1', 'Mixed Shop', [
    { collection: 'CUTY', carat: '0.10', shape: 'Round', quantity: '6', total: '1740' },
    { collection: 'CUTY', carat: '0.15', shape: 'Heart', quantity: '4', total: '1480' },
  ], 3500),
  doc('d2', 'Round Only Shop', [
    { collection: 'CUBIX', carat: '0.05', shape: 'Round', quantity: '12', total: '1980' },
  ], 2000),
];

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    const href = String(url);
    const ok = (body) => Promise.resolve({ ok: true, status: 200, json: async () => body });
    if (href.startsWith('/api/events')) return ok({ events: [] });
    if (href.startsWith('/api/clients')) return ok({ clients: [{ id: 'c1', source: 'salesforce', company: 'SF Account', country: 'Germany' }] });
    if (href.startsWith('/api/reports')) return ok({ reports: [] });
    if (href.startsWith('/api/documents')) {
      const page = Number(new URL(href, 'http://x').searchParams.get('page') || 1);
      return ok({ documents: page === 1 ? DOCUMENTS : [], total_count: DOCUMENTS.length });
    }
    return ok({});
  });
});

async function renderReports() {
  render(<ReportsDashboard />);
  await screen.findByRole('button', { name: /all events/i });
}

const pick = (picker, option) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${picker}:`, 'i') }));
  fireEvent.click(screen.getByLabelText(option));
};
const rowOf = (name) => screen.getByRole('cell', { name }).closest('tr');

describe('diamond filters on Reports', () => {
  test('every order shows its models and diamonds', async () => {
    await renderReports();
    const row = rowOf('Mixed Shop');
    expect(row.textContent).toContain('0.10 ct Round');
    expect(row.textContent).toContain('0.15 ct Heart');
  });

  test('a carat keeps the order but only its matching line and amount', async () => {
    await renderReports();
    pick('carats', /0\.15 ct/);
    expect(screen.queryByRole('cell', { name: 'Round Only Shop' })).not.toBeInTheDocument();
    const row = rowOf('Mixed Shop');
    expect(row.textContent).toContain('0.15 ct Heart');
    expect(row.textContent).not.toContain('0.10 ct Round');
    expect(row.textContent).toMatch(/1[.,\s]?480/);
    expect(row.textContent).not.toMatch(/3[.,\s]?500/);
  });

  test('shows how many pieces match, and drops Salesforce accounts', async () => {
    await renderReports();
    expect(screen.getByRole('cell', { name: 'SF Account' })).toBeInTheDocument();
    expect(screen.queryByText('Pieces matching')).not.toBeInTheDocument();
    pick('shapes', /^Round/);
    expect(screen.getByText('Pieces matching').nextSibling).toHaveTextContent('18');
    expect(screen.queryByRole('cell', { name: 'SF Account' })).not.toBeInTheDocument();
  });

  test('carat and shape must match on the same line', async () => {
    await renderReports();
    pick('carats', /0\.05 ct/);
    pick('shapes', /^Heart/);
    expect(screen.getByText('No results for current filters.')).toBeInTheDocument();
  });
});

describe('diamond filters in saved presets', () => {
  test('an older preset loads with no diamond filter', () => {
    expect(filtersFromSavedConfig({ country: 'France' })).toMatchObject({ models: [], carats: [], shapes: [] });
  });

  test('junk values fall back to empty lists', () => {
    expect(filtersFromSavedConfig({ carats: '0.10' }).carats).toEqual([]);
  });

  test('a saved selection survives', () => {
    expect(filtersFromSavedConfig({ carats: ['0.10'], shapes: ['Heart'] })).toMatchObject({ carats: ['0.10'], shapes: ['Heart'] });
  });
});
