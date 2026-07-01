'use client';

/**
 * Per-agent commission report panel.
 *
 * Lives inside the agent detail page (`/admin/agents/[id]`), inside the
 * Financials tab (Sam merged Reports + Financials on 2026-05-13).
 *
 * Two halves:
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ Send report now                                             │
 *   │   [Send report now button]                                  │
 *   │   small status pill: success / skipped / error              │
 *   ├────────────────────────────────────────────────────────────┤
 *   │ Past reports                                                 │
 *   │   13 May 2026  €1 500   ✓ Sent   📎 Drive   ⬇ Download     │
 *   │   30 Apr 2026  skipped (no paid orders)                      │
 *   │   ...                                                        │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Behaviour:
 *   - "Send report now" calls POST /api/commission-reports/generate with
 *     `{ agent_id }` only — no month. The server snapshot-builds a report
 *     of every commission ready to pay right now (everything ticked
 *     customer-paid, not yet paid out) and stamps today's date as the
 *     header / filename. Sam's 2026-05-13 redesign: the calendar-month
 *     abstraction was confusing ("April report" picked up May orders mom
 *     ticked Paid that morning), and unnecessary — agents get paid when
 *     the customer pays, not on a fixed monthly schedule.
 *   - skip_if_empty stays true so we don't email empty .xlsx files.
 *   - On success, refreshes the list.
 *   - "Drive" opens drive_view_link in a new tab.
 *   - "Download" hits GET /api/commission-reports/[id]/download.
 *
 * The component is purely presentational — no Supabase imports, just
 * fetch() calls. Errors are shown inline; the page doesn't crash.
 */

import { useEffect, useState, useCallback } from 'react';

const PLUM = '#5D3A5E';
const GOLD = '#C5A059';
const MUTED = '#999';
const LINE = '#e3e3e3';

function fmtEuro(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(v);
}

function todayKey(now = new Date()) {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-${hh}${min}`;
}

export default function CommissionReportsCard({ agentId, agentName }) {
  const [reports, setReports] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(null);

  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { kind: 'success'|'skipped'|'error', message }

  const loadReports = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch(`/api/commission-reports?agent_id=${encodeURIComponent(agentId)}&limit=24`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      const j = await res.json();
      setReports(j.reports || []);
    } catch (err) {
      setListError(err?.message || 'Failed to load reports');
    } finally {
      setLoadingList(false);
    }
  }, [agentId]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleGenerate = useCallback(async () => {
    if (!agentId) return;
    setBusy(true);
    setLastResult(null);
    try {
      // No `month` field — the server snapshot-builds a "ready right now"
      // report and stamps today's date as the title (Sam's 2026-05-13 redesign).
      const res = await fetch('/api/commission-reports/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          send_email: true,
          upload_to_drive: true,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      const r = j?.result;
      if (r?.skipped) {
        setLastResult({
          kind: 'skipped',
          message: 'No paid orders ready to pay — no email was sent.',
        });
      } else if (r?.email?.sent === false) {
        setLastResult({
          kind: 'partial',
          message: `Excel saved (Drive ${r?.drive?.ok ? 'OK' : 'failed'}) but email FAILED: ${r?.email?.reason || r?.email?.error || 'unknown'}`,
        });
      } else {
        setLastResult({
          kind: 'success',
          message: `Sent to ${r?.email?.recipient || 'recipient'}. Total: ${fmtEuro(r?.totals?.grandTotal || 0)}`,
        });
      }
      await loadReports();
    } catch (err) {
      setLastResult({ kind: 'error', message: err?.message || 'Generate failed' });
    } finally {
      setBusy(false);
    }
  }, [agentId, loadReports]);

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${LINE}`, fontSize: 13, fontWeight: 700, color: PLUM, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Commission Reports</span>
        <span style={{ fontSize: 11, color: MUTED, fontWeight: 500 }}>
          Excel + email to Dionne only · also saved to Google Drive
        </span>
      </div>

      {/* ── Send report row ───────────────────────────────────────── */}
      <div style={{ padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', background: '#fafafa', borderBottom: `1px solid ${LINE}` }}>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: busy ? '#aaa' : PLUM,
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
          aria-busy={busy}
        >
          {busy ? 'Sending…' : 'Send report now'}
        </button>
        <span style={{ fontSize: 11, color: MUTED }}>
          Emails Dionne (never the agent) with every order ticked Paid that isn’t on a report yet, and marks them “Reported”. Forward to the agent yourself when ready.
        </span>

        {lastResult && (
          <div
            role="status"
            style={{
              fontSize: 12,
              padding: '6px 10px',
              borderRadius: 6,
              fontWeight: 600,
              ...(lastResult.kind === 'success' && { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }),
              ...(lastResult.kind === 'skipped' && { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }),
              ...(lastResult.kind === 'partial' && { background: '#fef3c7', color: '#7c2d12', border: '1px solid #fcd34d' }),
              ...(lastResult.kind === 'error'   && { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }),
            }}
          >
            {lastResult.message}
          </div>
        )}
      </div>

      {/* ── Past reports list ──────────────────────────────────────── */}
      <div>
        {loadingList && (
          <div style={{ padding: 16, fontSize: 13, color: MUTED }}>Loading past reports…</div>
        )}
        {!loadingList && listError && (
          <div style={{ padding: 16, fontSize: 13, color: '#991b1b' }}>Error: {listError}</div>
        )}
        {!loadingList && !listError && reports.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: MUTED }}>
            No reports yet. Click <strong style={{ color: PLUM }}>Send report now</strong> above to create the first one.
          </div>
        )}
        {!loadingList && reports.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 580 }}>
              <thead>
                <tr style={{ background: '#faf8fc' }}>
                  <th style={th}>Period</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total</th>
                  <th style={{ ...th, textAlign: 'center' }}>Status</th>
                  <th style={{ ...th, textAlign: 'left' }}>Generated</th>
                  <th style={{ ...th, textAlign: 'right' }}>Files</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <ReportRow key={r.id} r={r} agentName={agentName} onDeleted={loadReports} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportRow({ r, agentName, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const handleDelete = async () => {
    if (!window.confirm(`Delete this report (${r.period_label || r.period_key})? The file in Supabase Storage will also be removed. The Google Drive copy is kept.`)) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/commission-reports/${r.id}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      onDeleted?.();
    } catch (err) {
      setDeleteError(err?.message || 'Delete failed');
      setDeleting(false);
    }
  };

  const isEmpty = Number(r.total_due) === 0;
  const status = (() => {
    if (r.status === 'sent' || r.email_sent_at) return { label: 'Sent', bg: '#f0fdf4', fg: '#166534' };
    if (r.email_error) return { label: 'Email failed', bg: '#fee2e2', fg: '#991b1b' };
    if (isEmpty) return { label: 'Empty', bg: '#f3f4f6', fg: '#374151' };
    return { label: 'Generated', bg: '#fffbeb', fg: '#92400e' };
  })();
  const generatedAt = r.created_at ? new Date(r.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const trigger = r.trigger_source === 'cron' ? ' · auto' : '';
  return (
    <>
      <tr style={{ borderBottom: deleteError ? 'none' : `1px solid ${LINE}` }}>
        <td style={td}>
          <div style={{ fontWeight: 600, color: '#1a1a1a' }}>{r.period_label || r.period_key}</div>
          <div style={{ fontSize: 11, color: MUTED }}>
            {(r.order_count || 0)} order{r.order_count === 1 ? '' : 's'}
            {r.bonus_count > 0 ? ` · ${r.bonus_count} bonus${r.bonus_count === 1 ? '' : 'es'}` : ''}
            {r.loose_b2c_count > 0 ? ` · ${r.loose_b2c_count} B2C` : ''}
          </div>
        </td>
        <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: isEmpty ? MUTED : GOLD }}>
          {fmtEuro(r.total_due)}
        </td>
        <td style={{ ...td, textAlign: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 12, background: status.bg, color: status.fg }}>
            {status.label}
          </span>
        </td>
        <td style={{ ...td, fontSize: 11, color: MUTED }}>
          {generatedAt}{trigger}
          {r.email_recipient && <div style={{ fontSize: 10 }}>→ {r.email_recipient}</div>}
        </td>
        <td style={{ ...td, textAlign: 'right' }}>
          <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
            {r.drive_view_link && (
              <a
                href={r.drive_view_link}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, fontWeight: 600, color: PLUM, padding: '4px 8px', border: `1px solid ${LINE}`, borderRadius: 6, textDecoration: 'none' }}
                title="Open in Google Drive"
              >
                Drive
              </a>
            )}
            {r.storage_path && (
              <a
                href={`/api/commission-reports/${r.id}/download`}
                download={`${agentName || 'agent'} - ${r.period_key || r.period_label}.xlsx`}
                style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: PLUM, padding: '4px 10px', borderRadius: 6, textDecoration: 'none' }}
                title="Download .xlsx"
              >
                Download
              </a>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              title="Delete this report"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: deleting ? MUTED : '#b91c1c',
                background: 'none',
                border: `1px solid ${deleting ? LINE : '#fecaca'}`,
                borderRadius: 6,
                padding: '4px 8px',
                cursor: deleting ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {deleting ? '…' : 'Delete'}
            </button>
          </div>
        </td>
      </tr>
      {deleteError && (
        <tr style={{ borderBottom: `1px solid ${LINE}` }}>
          <td colSpan={5} style={{ padding: '4px 12px 8px', fontSize: 11, color: '#b91c1c' }}>
            {deleteError}
          </td>
        </tr>
      )}
    </>
  );
}

const th = {
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 700,
  color: '#666',
  textAlign: 'left',
  borderBottom: `1px solid ${LINE}`,
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
};

const td = {
  padding: '10px 12px',
  fontSize: 12,
  color: '#1a1a1a',
};
