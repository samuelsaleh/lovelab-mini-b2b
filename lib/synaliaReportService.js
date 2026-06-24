/**
 * Orchestrates SYNALIA report generation, Drive upload, and email.
 */

import { filterSynaliaOrdersForQuarter } from './synaliaQuarter.js';
import { buildSynaliaReportData, generateSynaliaReport, synaliaReportFilename } from './synaliaReport.js';
import { uploadSynaliaReportToDrive } from './synaliaReportDrive.js';
import { sendSynaliaReportEmail } from './sendSynaliaReportEmail.js';

const EXCLUDED_CHANNELS = ['internal', 'consignment', 'delete_from_stock', 'sample'];

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase
 * @param {{ agentId: string, year: number, quarter: number, uploadToDrive?: boolean, sendEmail?: boolean }} opts
 */
export async function generateSynaliaReportForAgent(adminSupabase, {
  agentId,
  year,
  quarter,
  uploadToDrive = false,
  sendEmail = false,
}) {
  const { data: agent, error: agentErr } = await adminSupabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', agentId)
    .single();

  if (agentErr || !agent) {
    throw new Error('Agent not found');
  }

  const { data: docs, error: docsErr } = await adminSupabase
    .from('documents')
    .select('id, created_at, client_name, client_company, total_amount, file_name, status, order_channel, metadata')
    .eq('created_by', agent.id)
    .eq('document_type', 'order')
    .eq('status', 'sent')
    .is('deleted_at', null);

  if (docsErr) {
    throw new Error(docsErr.message || 'Failed to load orders');
  }

  const filtered = filterSynaliaOrdersForQuarter(
    (docs || []).filter((d) => !EXCLUDED_CHANNELS.includes(d.order_channel)),
    year,
    quarter,
  );

  const agentName = agent.full_name || agent.email || 'Agent';
  const data = buildSynaliaReportData({
    orders: filtered,
    year,
    quarter,
    agentName,
  });

  const buffer = await generateSynaliaReport({ data });
  const filename = synaliaReportFilename(agentName, year, quarter);

  let driveRes = { skipped: true, reason: 'disabled' };
  if (uploadToDrive) {
    driveRes = await uploadSynaliaReportToDrive({ buffer, fileName: filename });
  }

  let emailRes = { sent: false, reason: 'disabled' };
  if (sendEmail) {
    emailRes = await sendSynaliaReportEmail({
      buffer,
      agent: { name: agentName, email: agent.email },
      period: data.period,
      totals: {
        orderCount: data.orderCount,
        clientCount: data.clientCount,
        grandTotal: data.grandTotal,
      },
      driveViewLink: driveRes.webViewLink || null,
    });
  }

  return {
    buffer,
    filename,
    data,
    drive: driveRes,
    email: emailRes,
  };
}

/**
 * Preview counts without generating Excel.
 */
export async function previewSynaliaReportForAgent(adminSupabase, { agentId, year, quarter }) {
  const { data: agent, error: agentErr } = await adminSupabase
    .from('profiles')
    .select('id')
    .eq('id', agentId)
    .single();
  if (agentErr || !agent) throw new Error('Agent not found');

  const { data: docs, error: docsErr } = await adminSupabase
    .from('documents')
    .select('id, created_at, client_name, client_company, total_amount, order_channel, metadata')
    .eq('created_by', agent.id)
    .eq('document_type', 'order')
    .eq('status', 'sent')
    .is('deleted_at', null);

  if (docsErr) throw new Error(docsErr.message || 'Failed to load orders');

  const filtered = filterSynaliaOrdersForQuarter(
    (docs || []).filter((d) => !EXCLUDED_CHANNELS.includes(d.order_channel)),
    year,
    quarter,
  );

  const clients = new Set(
    filtered.map((d) => (d.client_company || d.client_name || 'Client').trim()),
  );
  const grandTotal = filtered.reduce((s, d) => s + (Number(d.total_amount) || 0), 0);

  return {
    orderCount: filtered.length,
    clientCount: clients.size,
    grandTotal: Math.round(grandTotal * 100) / 100,
  };
}
