/**
 * CommissionReportsCard — unit tests (Phase 19/B7)
 *
 * Locks the card's contract:
 *   ✓ Loads past reports on mount (GET /api/commission-reports?agent_id=...)
 *   ✓ Shows empty state when there are no past reports
 *   ✓ Generate POSTs /api/commission-reports/generate with selected month
 *   ✓ Shows success pill when result.email.sent
 *   ✓ Shows skipped pill when result.skipped is true
 *   ✓ Shows partial pill when storage saved but email failed
 *   ✓ Shows error pill on HTTP failure
 *   ✓ Refreshes list after a successful generate
 *   ✓ Drive + Download links rendered when present
 *   ✓ List error shown inline without crashing
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CommissionReportsCard from '../CommissionReportsCard';

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

const fakeReports = [
  {
    id: 'r1',
    agent_id: 'agent-1',
    period_label: 'April 2026',
    period_key: '2026-04',
    total_due: 1500,
    order_count: 5,
    bonus_count: 1,
    loose_b2c_count: 0,
    storage_path: '2026-04/nicolas.xlsx',
    drive_view_link: 'https://drive.google.com/file/d/abc/view',
    drive_file_id: 'abc',
    email_recipient: 'dionne@love-lab.com',
    email_sent_at: '2026-05-01T08:01:00.000Z',
    status: 'sent',
    trigger_source: 'cron',
    created_at: '2026-05-01T08:00:00.000Z',
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
      render(<CommissionReportsCard agentId="agent-1" agentName="Nicolas Vial" />);
      await flushPromises();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/commission-reports?agent_id=agent-1'),
    );
    // "April 2026" / "March 2026" also appear in the month dropdown, so
    // assert the report rows specifically (the rows have order count subtitles).
    expect(screen.getByText(/5 orders.*1 bonus/i)).toBeInTheDocument();
    expect(screen.getByText(/0 orders/i)).toBeInTheDocument();
  });

  it('renders an empty state when there are no past reports', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reports: [] }),
    });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Nicolas Vial" />);
      await flushPromises();
    });

    expect(screen.getByText(/No reports yet/i)).toBeInTheDocument();
  });

  it('shows list error inline when GET fails', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'oh no' }),
    });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Nicolas Vial" />);
      await flushPromises();
    });

    expect(screen.getByText(/Error: oh no/i)).toBeInTheDocument();
  });

  it('Generate POSTs /api/commission-reports/generate with selected month and shows success pill', async () => {
    // 1st call: GET list
    global.fetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ reports: [] }),
    });
    // 2nd call: POST generate
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
    // 3rd call: GET list refresh
    global.fetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ reports: fakeReports }),
    });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Nicolas Vial" />);
      await flushPromises();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Generate & Email/i }));
      await flushPromises();
    });

    // POST body has agent_id + month
    const postCall = global.fetch.mock.calls[1];
    expect(postCall[0]).toBe('/api/commission-reports/generate');
    const body = JSON.parse(postCall[1].body);
    expect(body.agent_id).toBe('agent-1');
    expect(body.month).toMatch(/^\d{4}-\d{2}$/);
    expect(body.send_email).toBe(true);
    expect(body.upload_to_drive).toBe(true);

    // Success pill
    expect(await screen.findByText(/Sent to dionne@love-lab.com/i)).toBeInTheDocument();

    // Refresh happened
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
      render(<CommissionReportsCard agentId="agent-1" agentName="Nicolas Vial" />);
      await flushPromises();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Generate & Email/i }));
      await flushPromises();
    });

    expect(await screen.findByText(/No paid orders for this month/i)).toBeInTheDocument();
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
      render(<CommissionReportsCard agentId="agent-1" agentName="Nicolas Vial" />);
      await flushPromises();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Generate & Email/i }));
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
      render(<CommissionReportsCard agentId="agent-1" agentName="Nicolas Vial" />);
      await flushPromises();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Generate & Email/i }));
      await flushPromises();
    });

    expect(await screen.findByText(/server kaboom/i)).toBeInTheDocument();
  });

  it('renders Drive + Download links when present, none when storage_path is null', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ reports: fakeReports }),
    });
    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Nicolas Vial" />);
      await flushPromises();
    });

    const drive = screen.getByText('Drive');
    expect(drive).toHaveAttribute('href', 'https://drive.google.com/file/d/abc/view');
    expect(drive).toHaveAttribute('target', '_blank');

    const download = screen.getByText('Download');
    expect(download).toHaveAttribute('href', '/api/commission-reports/r1/download');

    // The empty March 2026 row should have NEITHER Drive nor Download.
    const links = screen.getAllByRole('link');
    expect(links.filter((l) => l.textContent === 'Drive')).toHaveLength(1);
    expect(links.filter((l) => l.textContent === 'Download')).toHaveLength(1);
  });
});
