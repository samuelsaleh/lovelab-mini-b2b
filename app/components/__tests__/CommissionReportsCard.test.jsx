/**
 * CommissionReportsCard — unit tests (Phase 22, 2026-05-13)
 *
 * Sam removed the month picker. The card now has a single "Send report
 * now" button that POSTs `{ agent_id, send_email, upload_to_drive }` —
 * NO `month` field. The server snapshot-builds a "ready right now"
 * report and stamps today's date as the title.
 *
 * July 2026: also loads payments; "Replace last report" deletes then regenerates.
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

/** Mount loads reports + payments in parallel. */
function mockMount({ reports = [], payments = [] } = {}) {
  global.fetch.mockImplementation((url, opts) => {
    const u = String(url);
    if (u.includes('/api/commission-reports?')) {
      return Promise.resolve({ ok: true, json: async () => ({ reports }) });
    }
    if (u.includes('/api/agent-payments')) {
      return Promise.resolve({ ok: true, json: async () => ({ payments }) });
    }
    if (u === '/api/commission-reports/generate' && opts?.method === 'POST') {
      return Promise.resolve({
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
    }
    if (u.startsWith('/api/commission-reports/') && opts?.method === 'DELETE') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

describe('CommissionReportsCard', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    window.confirm = jest.fn(() => true);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads past reports on mount and renders them', async () => {
    mockMount({ reports: fakeReports });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/commission-reports?agent_id=agent-1'),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/agent-payments?agent_id=agent-1'),
    );
    expect(screen.getByText(/5 orders.*1 bonus/i)).toBeInTheDocument();
    expect(screen.getByText(/0 orders/i)).toBeInTheDocument();
  });

  it('renders no month <select> (Phase 22 regression guard)', async () => {
    mockMount({ reports: [] });
    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });

    expect(document.querySelector('select')).toBeNull();
    expect(screen.queryByLabelText(/Month/i)).toBeNull();
  });

  it('button is labelled "Send report now"', async () => {
    mockMount({ reports: [] });
    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });
    expect(screen.getByRole('button', { name: /Send report now/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generate & Email/i })).toBeNull();
  });

  it('renders an empty state mentioning the new button name', async () => {
    mockMount({ reports: [] });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });

    expect(screen.getByText(/No reports yet/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Send report now/i).length).toBeGreaterThanOrEqual(2);
  });

  it('shows list error inline when GET fails', async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/api/commission-reports?')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: 'oh no' }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ payments: [] }) });
    });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });

    expect(screen.getByText(/Error: oh no/i)).toBeInTheDocument();
  });

  it('Send report POSTs WITHOUT a month field and shows success pill', async () => {
    mockMount({ reports: [] });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Send report now/i }));
      await flushPromises();
    });

    const postCall = global.fetch.mock.calls.find(
      ([url, opts]) => url === '/api/commission-reports/generate' && opts?.method === 'POST',
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall[1].body);
    expect(body).toEqual({
      agent_id: 'agent-1',
      send_email: true,
      upload_to_drive: true,
    });
    expect(body.month).toBeUndefined();

    expect(await screen.findByText(/Sent to dionne@love-lab.com/i)).toBeInTheDocument();
  });

  it('shows skipped pill when the API reports skipped:true', async () => {
    global.fetch.mockImplementation((url, opts) => {
      if (String(url).includes('/api/commission-reports?')) {
        return Promise.resolve({ ok: true, json: async () => ({ reports: [] }) });
      }
      if (String(url).includes('/api/agent-payments')) {
        return Promise.resolve({ ok: true, json: async () => ({ payments: [] }) });
      }
      if (url === '/api/commission-reports/generate' && opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            mode: 'single',
            result: { skipped: true, reason: 'empty', totals: { grandTotal: 0 } },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
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
    global.fetch.mockImplementation((url, opts) => {
      if (String(url).includes('/api/commission-reports?')) {
        return Promise.resolve({ ok: true, json: async () => ({ reports: [] }) });
      }
      if (String(url).includes('/api/agent-payments')) {
        return Promise.resolve({ ok: true, json: async () => ({ payments: [] }) });
      }
      if (url === '/api/commission-reports/generate' && opts?.method === 'POST') {
        return Promise.resolve({
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
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
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
    global.fetch.mockImplementation((url, opts) => {
      if (String(url).includes('/api/commission-reports?')) {
        return Promise.resolve({ ok: true, json: async () => ({ reports: [] }) });
      }
      if (String(url).includes('/api/agent-payments')) {
        return Promise.resolve({ ok: true, json: async () => ({ payments: [] }) });
      }
      if (url === '/api/commission-reports/generate' && opts?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: 'server kaboom' }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
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
    mockMount({ reports: fakeReports });
    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });

    const drive = screen.getByText('Drive');
    expect(drive).toHaveAttribute('href', 'https://drive.google.com/file/d/abc/view');
    expect(drive).toHaveAttribute('target', '_blank');

    const download = screen.getByText('Download');
    expect(download).toHaveAttribute('href', '/api/commission-reports/r1/download');
    expect(download).toHaveAttribute('download', 'Marc Schlund - 2026-05-13-1422.xlsx');

    const links = screen.getAllByRole('link');
    expect(links.filter((l) => l.textContent === 'Drive')).toHaveLength(1);
    expect(links.filter((l) => l.textContent === 'Download')).toHaveLength(1);
  });

  it('Replace last report deletes then generates', async () => {
    mockMount({ reports: fakeReports, payments: [] });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });

    const replaceBtn = screen.getByTestId('replace-last-report');
    expect(replaceBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(replaceBtn);
      await flushPromises();
    });

    expect(window.confirm).toHaveBeenCalled();
    const deleteCall = global.fetch.mock.calls.find(
      ([url, opts]) => String(url).includes('/api/commission-reports/r1') && opts?.method === 'DELETE',
    );
    expect(deleteCall).toBeTruthy();
    const generateCall = global.fetch.mock.calls.find(
      ([url, opts]) => url === '/api/commission-reports/generate' && opts?.method === 'POST',
    );
    expect(generateCall).toBeTruthy();
    expect(await screen.findByText(/Sent to dionne@love-lab.com/i)).toBeInTheDocument();
  });

  it('disables Replace last report when the latest report already has a payment', async () => {
    mockMount({
      reports: fakeReports,
      payments: [{ id: 'p1', report_id: 'r1', amount: 1500 }],
    });

    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });

    expect(screen.getByTestId('replace-last-report')).toBeDisabled();
  });

  it('shows forgot-order helper text', async () => {
    mockMount({ reports: [] });
    await act(async () => {
      render(<CommissionReportsCard agentId="agent-1" agentName="Marc Schlund" />);
      await flushPromises();
    });
    expect(screen.getByText(/Forgot an order/i)).toBeInTheDocument();
  });
});
