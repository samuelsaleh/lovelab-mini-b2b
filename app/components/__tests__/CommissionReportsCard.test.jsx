/**
 * CommissionReportsCard — unit tests (Phase 22, 2026-05-13)
 *
 * Sam removed the month picker. The card now has a single "Send report
 * now" button that POSTs `{ agent_id, send_email, upload_to_drive }` —
 * NO `month` field. The server snapshot-builds a "ready right now"
 * report and stamps today's date as the title.
 *
 * Locks the new contract:
 *   ✓ Loads past reports on mount (GET /api/commission-reports?agent_id=...)
 *   ✓ NO month <select> rendered (regression guard)
 *   ✓ Button labelled "Send report now"
 *   ✓ Send report POSTs WITHOUT a `month` field
 *   ✓ Shows success pill when result.email.sent
 *   ✓ Shows skipped pill when result.skipped is true
 *   ✓ Shows partial pill when storage saved but email failed
 *   ✓ Shows error pill on HTTP failure
 *   ✓ Refreshes list after a successful send
 *   ✓ Drive + Download links rendered when present
 *   ✓ Download filename uses period_key (sortable) not period_label
 *   ✓ List error shown inline without crashing
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CommissionReportsCard from '../CommissionReportsCard';

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

const fakeReports = [
  {
    id: 'r1',
    agent_id: 'agent-1',
    period_label: '13 May 2026',
    period_key: '2026-05-13-1422',
    total_due: 1500,
    order_count: 5,
    bonus_count: 1,
    loose_b2c_count: 0,
    storage_path: 'Marc Schlund/Marc Schlund - 2026-05-13-1422.xlsx',
    drive_view_link: 'https://drive.google.com/file/d/abc/view',
    drive_file_id: 'abc',
    email_recipient: 'dionne@love-lab.com',
    email_sent_at: '2026-05-13T14:23:00.000Z',
    status: 'sent',
    trigger_source: 'manual',
    created_at: '2026-05-13T14:22:00.000Z',
  },
  {
    id: 'r2',
    agent_id: 'agent-1',
    period_label: 'March 2026',
    period_key: '2026-03',
    total_due: 0,
    order_count: 0,
    bonus_count: 0,
    loose_b2c_count: 0,
    storage_path: null,
    drive_view_link: null,
    email_sent_at: null,
    status: 'generated',
    trigger_source: 'cron',
    created_at: '2026-04-01T08:00:00.000Z',
  },
];

describe('CommissionReportsCard', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads past reports on mount and renders them', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reports: fakeReports }),
    });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/commission-reports?agent_id=agent-1'),
    );
    expect(screen.getByText(/5 orders.*1 bonus/i)).toBeInTheDocument();
    expect(screen.getByText(/0 orders/i)).toBeInTheDocument();
  });

  it('renders no month <select> (Phase 22 regression guard)', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ reports: [] }),
    });
    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });

    // No <select>, no "Month" label.
    expect(document.querySelector('select')).toBeNull();
    expect(screen.queryByLabelText(/Month/i)).toBeNull();
  });

  it('button is labelled "Send report now"', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ reports: [] }),
    });
    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });
    expect(screen.getByRole('button', { name: /Send report now/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generate & Email/i })).toBeNull();
  });

  it('renders an empty state mentioning the new button name', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reports: [] }),
    });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });

    expect(screen.getByText(/No reports yet/i)).toBeInTheDocument();
    // The empty-state strong tag also says "Send report now" — confirm
    // at least two elements match (button + strong). Use getAllByText to
    // avoid the "multiple elements" error getByText throws.
    expect(screen.getAllByText(/Send report now/i).length).toBeGreaterThanOrEqual(2);
  });

  it('shows list error inline when GET fails', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'oh no' }),
    });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });

    expect(screen.getByText(/Error: oh no/i)).toBeInTheDocument();
  });

  it('Send report POSTs WITHOUT a month field and shows success pill', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ reports: [] }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mode: 'single',
        result: {
          reportId: 'new-r',
          totals: { grandTotal: 1234 },
          email: { sent: true, recipient: 'dionne@love-lab.com' },
          drive: { ok: true, fileId: 'fid' },
        },
      }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ reports: fakeReports }),
    });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Send report now/i }));
      await flushPromises();
    });

    const postCall = global.fetch.mock.calls[1];
    expect(postCall[0]).toBe('/api/commission-reports/generate');
    const body = JSON.parse(postCall[1].body);
    expect(body).toEqual({
      agent_id: 'agent-1',
      send_email: true,
      upload_to_drive: true,
    });
    // Phase 22: explicitly NOT sending a month field.
    expect(body.month).toBeUndefined();

    expect(await screen.findByText(/Sent to dionne@love-lab.com/i)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('shows skipped pill when the API reports skipped:true', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ reports: [] }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mode: 'single',
        result: { skipped: true, reason: 'empty', totals: { grandTotal: 0 } },
      }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ reports: [] }),
    });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Send report now/i }));
      await flushPromises();
    });

    expect(await screen.findByText(/No paid orders ready to pay/i)).toBeInTheDocument();
  });

  it('shows partial pill when email fails but Drive succeeded', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ reports: [] }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mode: 'single',
        result: {
          reportId: 'r-1',
          totals: { grandTotal: 1000 },
          email: { sent: false, reason: 'resend_error' },
          drive: { ok: true, fileId: 'fid' },
        },
      }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ reports: [] }),
    });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Send report now/i }));
      await flushPromises();
    });

    expect(await screen.findByText(/email FAILED: resend_error/i)).toBeInTheDocument();
  });

  it('shows error pill on HTTP failure', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ reports: [] }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: false, status: 500, json: async () => ({ error: 'server kaboom' }),
    });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Send report now/i }));
      await flushPromises();
    });

    expect(await screen.findByText(/server kaboom/i)).toBeInTheDocument();
  });

  it('renders Drive + Download links and uses period_key in the download filename', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ reports: fakeReports }),
    });
    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });

    const drive = screen.getByText('Drive');
    expect(drive).toHaveAttribute('href', 'https://drive.google.com/file/d/abc/view');
    expect(drive).toHaveAttribute('target', '_blank');

    const download = screen.getByText('Download');
    expect(download).toHaveAttribute('href', '/api/commission-reports/r1/download');
    // Phase 22: download attribute mirrors storage path naming —
    // "<Agent> - <period_key>.xlsx" (sortable, includes HHmm for snapshots).
    expect(download).toHaveAttribute('download', 'Marc Schlund - 2026-05-13-1422.xlsx');

    const links = screen.getAllByRole('link');
    expect(links.filter((l) => l.textContent === 'Drive')).toHaveLength(1);
    expect(links.filter((l) => l.textContent === 'Download')).toHaveLength(1);
  });
});
