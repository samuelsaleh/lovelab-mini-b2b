/**
 * @jest-environment node
 *
 * lib/healthCheck.runDailyHealthCheck — Phase 17 reconciler tests.
 *
 * Exercises each audit independently:
 *   - ghost commissions  : pending rows pointing at soft-deleted docs
 *   - duplicate events   : two agent events with same name+org
 *   - schema drift       : an expected table missing from the live RPC
 *
 * Verifies that every finding triggers a recordHealthEvent call with the
 * right source/severity, and that one audit failing never aborts the others.
 */

const recordHealthEvent = jest.fn().mockResolvedValue({ ok: true });

jest.mock('../healthEvent.js', () => ({
  recordHealthEvent: (...args) => recordHealthEvent(...args),
}));

const { runDailyHealthCheck } = require('../healthCheck.js');

function buildAdminSupabase({ ghosts = [], agentEvents = [], liveTables = null, throwOn } = {}) {
  return {
    from: jest.fn((table) => {
      if (throwOn === table) {
        throw new Error(`mocked failure on ${table}`);
      }
      if (table === 'agent_commissions') {
        const chain = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.not = jest.fn().mockResolvedValue({ data: ghosts, error: null });
        return chain;
      }
      if (table === 'events') {
        const chain = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockResolvedValue({ data: agentEvents, error: null });
        return chain;
      }
      throw new Error('unexpected table: ' + table);
    }),
    rpc: jest.fn().mockImplementation((fn) => {
      if (fn === '__schema_drift_tables') {
        if (liveTables === null) return Promise.resolve({ data: null, error: { message: 'rpc broken' } });
        return Promise.resolve({
          data: liveTables.map((t) => ({ table_name: t })),
          error: null,
        });
      }
      throw new Error('unexpected rpc: ' + fn);
    }),
  };
}

beforeEach(() => {
  recordHealthEvent.mockClear();
});

describe('runDailyHealthCheck — ghost commissions', () => {
  test('records a warn event when ghost commissions are found', async () => {
    const ghosts = [
      { id: 'c1', agent_id: 'a1', document_id: 'd1', documents: { id: 'd1', deleted_at: '2026-04-01' } },
      { id: 'c2', agent_id: 'a1', document_id: 'd2', documents: { id: 'd2', deleted_at: '2026-04-02' } },
    ];
    const adminSupabase = buildAdminSupabase({ ghosts, liveTables: ['profiles', 'documents', 'events', 'agent_commissions', 'system_health_events'] });
    // Ensure expected schema's tables are all reported live so drift audit is clean.
    // We only care here that the ghost audit fired.

    const summary = await runDailyHealthCheck(adminSupabase);

    expect(summary.findings.ghost_commissions.ok).toBe(true);
    expect(summary.findings.ghost_commissions.count).toBe(2);

    const ghostCall = recordHealthEvent.mock.calls.find(
      (c) => c[0]?.source === 'cron_health_check_ghost_commissions',
    );
    expect(ghostCall).toBeDefined();
    expect(ghostCall[0].severity).toBe('warn');
    expect(ghostCall[0].context.total).toBe(2);
  });

  test('records nothing when there are no ghost commissions', async () => {
    const adminSupabase = buildAdminSupabase({ ghosts: [], liveTables: [] });
    const summary = await runDailyHealthCheck(adminSupabase);
    expect(summary.findings.ghost_commissions.count).toBe(0);
    const ghostCall = recordHealthEvent.mock.calls.find(
      (c) => c[0]?.source === 'cron_health_check_ghost_commissions',
    );
    expect(ghostCall).toBeUndefined();
  });
});

describe('runDailyHealthCheck — duplicate agent events', () => {
  test('groups events by lower(name)+org_id and reports duplicates', async () => {
    const adminSupabase = buildAdminSupabase({
      agentEvents: [
        { id: 'e1', name: 'Corinne', organization_id: 'org-1', created_at: '2026-01-01' },
        { id: 'e2', name: '  corinne ', organization_id: 'org-1', created_at: '2026-02-01' },
        { id: 'e3', name: 'Marc', organization_id: 'org-1', created_at: '2026-03-01' },
      ],
      liveTables: [],
    });
    const summary = await runDailyHealthCheck(adminSupabase);
    expect(summary.findings.duplicate_agent_events.duplicate_groups).toBe(1);

    const dupCall = recordHealthEvent.mock.calls.find(
      (c) => c[0]?.source === 'cron_health_check_duplicate_agent_events',
    );
    expect(dupCall).toBeDefined();
    expect(dupCall[0].context.total_groups).toBe(1);
    expect(dupCall[0].context.groups[0].ids).toEqual(['e1', 'e2']);
  });

  test('does not record event when there are no duplicate groups', async () => {
    const adminSupabase = buildAdminSupabase({
      agentEvents: [
        { id: 'e1', name: 'Corinne', organization_id: 'org-1' },
        { id: 'e2', name: 'Marc', organization_id: 'org-1' },
      ],
      liveTables: [],
    });
    await runDailyHealthCheck(adminSupabase);
    const dupCall = recordHealthEvent.mock.calls.find(
      (c) => c[0]?.source === 'cron_health_check_duplicate_agent_events',
    );
    expect(dupCall).toBeUndefined();
  });
});

describe('runDailyHealthCheck — schema drift', () => {
  test('records a critical event when expected tables are missing', async () => {
    // Live DB knows about no tables -> every expected table is missing.
    const adminSupabase = buildAdminSupabase({ liveTables: [] });
    const summary = await runDailyHealthCheck(adminSupabase);

    expect(summary.findings.schema_drift.ok).toBe(true);
    expect(summary.findings.schema_drift.missing_tables).toBeGreaterThan(0);

    const driftCall = recordHealthEvent.mock.calls.find(
      (c) => c[0]?.source === 'cron_health_check_schema_drift',
    );
    expect(driftCall).toBeDefined();
    expect(driftCall[0].severity).toBe('critical');
  });

  test('records nothing when all expected tables exist', async () => {
    // We pre-load the schema and feed every expected name into liveTables.
    const { expectedSchema } = await import('../expected-schema.mjs');
    const liveTables = expectedSchema.tables.map((t) => t.name);
    const adminSupabase = buildAdminSupabase({ liveTables });
    await runDailyHealthCheck(adminSupabase);
    const driftCall = recordHealthEvent.mock.calls.find(
      (c) => c[0]?.source === 'cron_health_check_schema_drift',
    );
    expect(driftCall).toBeUndefined();
  });
});

describe('runDailyHealthCheck — runner resilience', () => {
  test('one failing audit does not abort the others', async () => {
    // Make the events query throw, ghost audit succeed, drift audit succeed.
    const adminSupabase = buildAdminSupabase({
      ghosts: [],
      throwOn: 'events',
      liveTables: [],
    });
    const summary = await runDailyHealthCheck(adminSupabase);

    expect(summary.findings.ghost_commissions.ok).toBe(true);
    expect(summary.findings.duplicate_agent_events.ok).toBe(false);
    expect(summary.findings.schema_drift.ok).toBe(true);

    const runnerCall = recordHealthEvent.mock.calls.find(
      (c) => c[0]?.source === 'cron_health_check_runner',
    );
    expect(runnerCall).toBeDefined();
    expect(runnerCall[0].severity).toBe('error');
  });
});
