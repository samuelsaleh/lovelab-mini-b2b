/**
 * Daily health check / reconciler.
 *
 * Audits the database for invariants the application relies on but cannot
 * always enforce at write time. Each finding is recorded as a structured
 * `system_health_events` row and (per healthEvent.js policy) triggers an
 * admin email alert when severity >= warn.
 *
 * Audits performed:
 *   1. Ghost commissions  — pending agent_commissions whose document is
 *                           soft-deleted. Should be 0 after Phase 11b's
 *                           cascade fix; this is the regression net.
 *   2. Duplicate agent events — groups of (lower(name), organisation_id)
 *                           in events with type='agent' and count > 1.
 *                           These cause "two Corinne" dropdown bugs.
 *   3. Schema drift count — number of expected tables/functions missing
 *                           from the live DB. Counts are coarse on purpose;
 *                           the detailed diff is `npm run check:schema`.
 *
 * Read-only. Returns a summary object the API route serialises back to the
 * caller. Failure of one audit never aborts the others — each runs in its
 * own try/catch and records its own health event on failure.
 */

import { recordHealthEvent } from './healthEvent.js';

async function auditGhostCommissions(adminSupabase) {
  // Pending commissions linked to a soft-deleted document. Phase 11b cancels
  // these on delete; this audit catches anything that slipped through (e.g.
  // a delete that happened before phase 11b shipped, or a manual cancel that
  // bypassed the API).
  const { data, error } = await adminSupabase
    .from('agent_commissions')
    .select('id, agent_id, document_id, documents!inner(id, deleted_at)')
    .eq('status', 'pending')
    .not('documents.deleted_at', 'is', null);
  if (error) {
    return { ok: false, error: error.message };
  }
  const ghosts = data || [];
  if (ghosts.length > 0) {
    await recordHealthEvent({
      source: 'cron_health_check_ghost_commissions',
      severity: 'warn',
      message: `Found ${ghosts.length} pending commission row(s) linked to soft-deleted documents.`,
      context: {
        sample: ghosts.slice(0, 10).map((g) => ({
          commission_id: g.id,
          agent_id: g.agent_id,
          document_id: g.document_id,
        })),
        total: ghosts.length,
      },
    });
  }
  return { ok: true, count: ghosts.length };
}

async function auditDuplicateAgentEvents(adminSupabase) {
  const { data, error } = await adminSupabase
    .from('events')
    .select('id, name, organization_id, created_at')
    .eq('type', 'agent');
  if (error) {
    return { ok: false, error: error.message };
  }

  const groups = new Map();
  for (const evt of data || []) {
    const norm = String(evt.name || '').trim().toLowerCase();
    const orgKey = evt.organization_id || 'null';
    const key = `${norm}|${orgKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(evt);
  }
  const dupGroups = [];
  for (const [key, members] of groups) {
    if (members.length > 1) dupGroups.push({ key, members });
  }
  if (dupGroups.length > 0) {
    await recordHealthEvent({
      source: 'cron_health_check_duplicate_agent_events',
      severity: 'warn',
      message: `Found ${dupGroups.length} duplicate agent-event group(s).`,
      context: {
        groups: dupGroups.slice(0, 20).map((g) => ({
          key: g.key,
          ids: g.members.map((m) => m.id),
        })),
        total_groups: dupGroups.length,
      },
    });
  }
  return { ok: true, duplicate_groups: dupGroups.length };
}

async function auditSchemaDrift(adminSupabase) {
  const expected = await import('./expected-schema.mjs').then((m) => m.expectedSchema);

  let liveTables;
  try {
    const { data, error } = await adminSupabase.rpc('__schema_drift_tables');
    if (error) throw new Error(error.message);
    liveTables = new Set((data || []).map((r) => r.table_name));
  } catch (err) {
    return { ok: false, error: `tables RPC failed: ${err.message}` };
  }

  const missingTables = (expected.tables || [])
    .filter((t) => !liveTables.has(t.name))
    .map((t) => t.name);

  if (missingTables.length > 0) {
    await recordHealthEvent({
      source: 'cron_health_check_schema_drift',
      severity: 'critical',
      message: `Schema drift: ${missingTables.length} expected table(s) missing in production.`,
      context: { missing: missingTables },
    });
  }
  return { ok: true, missing_tables: missingTables.length, missing: missingTables };
}

export async function runDailyHealthCheck(adminSupabase) {
  const startedAt = new Date().toISOString();
  const findings = {};

  try {
    findings.ghost_commissions = await auditGhostCommissions(adminSupabase);
  } catch (err) {
    findings.ghost_commissions = { ok: false, error: err.message };
    await recordHealthEvent({
      source: 'cron_health_check_runner',
      severity: 'error',
      message: `auditGhostCommissions threw: ${err.message}`,
      context: { stack: err.stack ? String(err.stack).slice(0, 1000) : null },
    });
  }

  try {
    findings.duplicate_agent_events = await auditDuplicateAgentEvents(adminSupabase);
  } catch (err) {
    findings.duplicate_agent_events = { ok: false, error: err.message };
    await recordHealthEvent({
      source: 'cron_health_check_runner',
      severity: 'error',
      message: `auditDuplicateAgentEvents threw: ${err.message}`,
      context: { stack: err.stack ? String(err.stack).slice(0, 1000) : null },
    });
  }

  try {
    findings.schema_drift = await auditSchemaDrift(adminSupabase);
  } catch (err) {
    findings.schema_drift = { ok: false, error: err.message };
    await recordHealthEvent({
      source: 'cron_health_check_runner',
      severity: 'error',
      message: `auditSchemaDrift threw: ${err.message}`,
      context: { stack: err.stack ? String(err.stack).slice(0, 1000) : null },
    });
  }

  return {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    findings,
  };
}
