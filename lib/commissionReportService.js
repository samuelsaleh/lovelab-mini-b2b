/**
 * Phase 19/B6 — orchestration layer for monthly commission reports.
 *
 * `generateAgentReport()` is the single function called both by the
 * manual "Generate Report" UI button AND by the n8n cron POST. It:
 *   1. Loads the agent profile + their commissions for the period.
 *   2. Calls buildReportData() to shape the data.
 *   3. If skipIfEmpty=true (cron default) and there's nothing to pay,
 *      returns { skipped: true, reason: 'empty' } without touching
 *      Storage / Drive / Resend / DB.
 *   4. Calls generateCommissionReport() to produce the .xlsx Buffer.
 *   5. Uploads the buffer to Supabase Storage (private archive).
 *   6. Uploads the buffer to Google Drive (mom's convenience copy).
 *      Failure here is logged but does NOT fail the whole flow.
 *   7. Emails the buffer to dionne@love-lab.com via Resend.
 *      Failure logged but does NOT fail the flow.
 *   8. Inserts a `commission_reports` row recording everything above.
 *      THIS step DOES fail the flow if it errors — we want a database
 *      record for every successful build.
 *
 * `generateAllAgents()` loops over every active agent and calls
 * `generateAgentReport()` for each, returning per-agent results.
 *
 * Inputs/Outputs are small, plain objects so this is straightforward to
 * unit-test with jest mocks for the supabase client.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { buildReportData, generateCommissionReport } from './commissionReport.js';
import { uploadCommissionReportToDrive } from './commissionReportDrive.js';
import { sendCommissionReportEmail } from './sendCommissionReport.js';

// process.cwd() is the project root in Next.js + jest runs alike. Avoids
// the import.meta.url / __dirname collision Babel-CommonJS transform
// triggers when this file is require()'d in tests.
const REPO_ROOT = process.cwd();

const STORAGE_BUCKET = 'commission-reports';

// Cache the logo bytes so we don't read disk on every report.
let _logoCache = null;
async function loadLogo() {
  if (_logoCache !== null) return _logoCache;
  try {
    _logoCache = await fs.readFile(path.join(REPO_ROOT, 'public', 'logo.png'));
  } catch {
    _logoCache = null;
  }
  return _logoCache;
}

/**
 * @param {object} args
 * @param {object} args.supabase            — admin (service-role) Supabase client
 * @param {string} args.agentId
 * @param {{ start: string|Date, end: string|Date, label: string, key: string }} args.period
 * @param {object} [args.options]
 * @param {boolean}[args.options.skipIfEmpty=true]
 * @param {boolean}[args.options.sendEmail=true]
 * @param {boolean}[args.options.uploadToDrive=true]
 * @param {string} [args.options.recipient]                 — overrides default to dionne@love-lab.com
 * @param {string} [args.options.triggeredBy]               — auth user id (null for cron)
 * @param {'manual'|'cron'}[args.options.triggerSource='manual']
 * @returns {Promise<{
 *   skipped?: boolean, reason?: string,
 *   reportId?: string, totals?: object,
 *   storage?: { path: string, error?: string },
 *   drive?:   { fileId?: string, viewLink?: string, error?: string, skipped?: boolean },
 *   email?:   { sent: boolean, recipient?: string, message_id?: string, error?: string },
 * }>}
 */
export async function generateAgentReport({
  supabase,
  agentId,
  period,
  options = {},
}) {
  const {
    skipIfEmpty = true,
    sendEmail = true,
    uploadToDrive = true,
    recipient,
    triggeredBy = null,
    triggerSource = 'manual',
  } = options;

  if (!supabase) throw new Error('supabase client is required');
  if (!agentId) throw new Error('agentId is required');
  if (!period) throw new Error('period is required');

  // ── 1. Load agent ──────────────────────────────────────────────────
  const { data: agent, error: agentErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, commission_rate, new_client_bonus_enabled, new_client_bonus_amount, role, agent_status')
    .eq('id', agentId)
    .maybeSingle();

  if (agentErr) throw new Error(`Failed to load agent: ${agentErr.message}`);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  // ── 2. Load commissions for the period (slightly wider window so we
  //      don't miss orders that were customer-paid in the period but
  //      created earlier).
  const { data: commissions, error: cErr } = await supabase
    .from('agent_commissions')
    .select(`
      id, type, status, commission_rate, commission_amount, order_total,
      created_at, customer_paid_at, document_id,
      document:documents (
        id, client_name, client_company, total_amount, order_channel, metadata, created_at
      )
    `)
    .eq('agent_id', agentId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });

  if (cErr) throw new Error(`Failed to load commissions: ${cErr.message}`);

  // ── 3. Shape ───────────────────────────────────────────────────────
  const data = buildReportData({
    agent,
    commissions: commissions || [],
    periodStart: period.start,
    periodEnd: period.end,
    includeLooseSales: true,
  });

  if (skipIfEmpty && data.totals.grandTotal === 0) {
    return { skipped: true, reason: 'empty', totals: data.totals };
  }

  // ── 4. Render xlsx ────────────────────────────────────────────────
  const logoBuffer = await loadLogo();
  const xlsxBuffer = await generateCommissionReport({ data, logoBuffer });

  const safeName = sanitiseFilenamePart(agent.full_name || agent.email || agentId);
  const storagePath = `${period.key}/${safeName}-${period.key}.xlsx`;

  // ── 5. Upload to Supabase Storage (primary archive) ────────────────
  const storageRes = { path: storagePath };
  const { error: upErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, xlsxBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
      cacheControl: '3600',
    });
  if (upErr) {
    storageRes.error = upErr.message;
    // Hard fail — we don't want a row in commission_reports without an
    // archive to point at.
    throw new Error(`Storage upload failed: ${upErr.message}`);
  }

  // ── 6. Upload to Google Drive (best-effort) ────────────────────────
  let driveRes = { skipped: true, reason: 'disabled' };
  if (uploadToDrive) {
    driveRes = await uploadCommissionReportToDrive({
      buffer: xlsxBuffer,
      agentName: agent.full_name || agent.email || 'Agent',
      periodLabel: period.label,
      periodKey: period.key,
    });
    if (driveRes.error) {
      console.warn(`[commissionReportService] Drive upload failed for agent ${agentId}:`, driveRes.error);
    }
  }

  // ── 7. Email (best-effort) ─────────────────────────────────────────
  let emailRes = { sent: false, reason: 'disabled' };
  if (sendEmail) {
    emailRes = await sendCommissionReportEmail({
      buffer: xlsxBuffer,
      agent: { name: agent.full_name || agent.email || 'Agent', email: agent.email },
      period,
      totals: data.totals,
      recipient,
    });
    if (!emailRes.sent) {
      console.warn(`[commissionReportService] Email failed for agent ${agentId}:`, emailRes.reason || emailRes.error);
    }
  }

  // ── 8. Insert commission_reports row ───────────────────────────────
  const insertPayload = {
    agent_id: agentId,
    period_start: new Date(period.start).toISOString(),
    period_end: new Date(period.end).toISOString(),
    period_label: period.label,
    period_key: period.key,
    total_due: data.totals.grandTotal,
    order_count: data.totals.orderCount,
    bonus_count: data.totals.bonusCount,
    loose_b2c_count: data.totals.looseSalesCount,
    storage_path: storagePath,
    drive_file_id: driveRes.fileId || null,
    drive_view_link: driveRes.webViewLink || null,
    email_recipient: emailRes.sent ? emailRes.recipient : (recipient || null),
    email_message_id: emailRes.message_id || null,
    email_sent_at: emailRes.sent ? new Date().toISOString() : null,
    email_error: emailRes.sent ? null : (emailRes.reason || emailRes.error || null),
    status: emailRes.sent ? 'sent' : 'generated',
    triggered_by: triggeredBy,
    trigger_source: triggerSource,
    snapshot_data: data,
  };

  const { data: report, error: insErr } = await supabase
    .from('commission_reports')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insErr) {
    // Storage is already populated. Surface a clear error so the caller
    // can decide whether to also remove the orphan storage object.
    throw new Error(`commission_reports insert failed: ${insErr.message}`);
  }

  return {
    reportId: report.id,
    totals: data.totals,
    storage: storageRes,
    drive: driveRes,
    email: emailRes,
    report,
  };
}

/**
 * Loop over every active agent and generate their monthly report.
 * Used by the n8n cron call. Failures for one agent don't block the others.
 */
export async function generateAllAgents({ supabase, period, options = {} }) {
  if (!supabase) throw new Error('supabase client is required');

  const { data: agents, error: agentsErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, agent_status')
    .eq('is_agent', true)
    .neq('agent_status', 'archived')
    .order('full_name', { ascending: true });

  if (agentsErr) throw new Error(`Failed to list agents: ${agentsErr.message}`);

  const results = [];
  for (const a of agents || []) {
    try {
      const r = await generateAgentReport({
        supabase,
        agentId: a.id,
        period,
        options: { ...options, triggerSource: options.triggerSource || 'cron' },
      });
      results.push({ agent_id: a.id, agent_name: a.full_name || a.email, ok: true, ...r });
    } catch (err) {
      console.error(`[generateAllAgents] Failed for ${a.full_name || a.id}:`, err.message);
      results.push({ agent_id: a.id, agent_name: a.full_name || a.email, ok: false, error: err.message });
    }
  }

  const summary = {
    period,
    total_agents: results.length,
    sent: results.filter((r) => r.ok && r.email?.sent).length,
    skipped: results.filter((r) => r.ok && r.skipped).length,
    failed: results.filter((r) => !r.ok).length,
  };
  return { summary, results };
}

/**
 * Build the canonical period object for "previous full calendar month".
 * Used by the n8n cron handler. Brussels-naive but UTC-comparable.
 */
export function previousMonthPeriod(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed = current month
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  const yyyy = start.getUTCFullYear();
  const mm = String(start.getUTCMonth() + 1).padStart(2, '0');
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    key: `${yyyy}-${mm}`,
    label: start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
  };
}

function sanitiseFilenamePart(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
