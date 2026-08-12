/**
 * Commission attribution must survive a database that hasn't had the
 * new_client_bonus_mode migration yet.
 *
 * These profile lookups decide who owns a commission, and they ignore
 * query errors. Asking for a column Postgres doesn't have would turn
 * every one of them into null and silently drop commissions on every
 * order save — the loudest possible bug with the quietest symptoms.
 */

const AGENT = {
  id: 'agent-1',
  is_agent: true,
  agent_status: 'active',
  commission_rate: 15,
  new_client_bonus_mode: 'manual',
  new_client_bonus_enabled: true,
  new_client_bonus_amount: 200,
};

/**
 * @param {boolean} hasModeColumn whether the migration has been applied
 */
function makeAdmin(hasModeColumn) {
  const selects = [];
  const admin = {
    from: jest.fn(() => {
      const chain = {};
      const ret = () => chain;
      chain.select = jest.fn((cols) => {
        selects.push(cols);
        chain._cols = cols;
        return chain;
      });
      chain.eq = jest.fn(ret);
      chain.in = jest.fn(ret);
      chain.is = jest.fn(ret);
      chain.ilike = jest.fn(ret);
      chain.limit = jest.fn(() => {
        // The probe: select('new_client_bonus_mode').limit(1)
        if (chain._cols === 'new_client_bonus_mode') {
          return Promise.resolve(
            hasModeColumn
              ? { data: [], error: null }
              : { data: null, error: { message: 'column profiles.new_client_bonus_mode does not exist', code: '42703' } },
          );
        }
        return chain;
      });
      chain.maybeSingle = jest.fn(() => {
        // Real Postgres fails the whole query when a column is unknown.
        if (!hasModeColumn && String(chain._cols).includes('new_client_bonus_mode')) {
          return Promise.resolve({ data: null, error: { message: 'column does not exist' } });
        }
        return Promise.resolve({ data: AGENT, error: null });
      });
      return chain;
    }),
  };
  return { admin, selects };
}

const loadModule = async () => {
  let mod;
  await jest.isolateModulesAsync(async () => {
    mod = await import('../commissionAttribution.js');
  });
  return mod;
};

const document = { id: 'doc-1', created_by: 'agent-1', event_id: null };

describe('profile column probing', () => {
  test('asks for the mode column once the migration has run', async () => {
    const { resolveCommissionAgent } = await loadModule();
    const { admin, selects } = makeAdmin(true);
    const result = await resolveCommissionAgent(admin, document);
    expect(result).toMatchObject({ agentId: 'agent-1', via: 'creator' });
    expect(result.profile.new_client_bonus_mode).toBe('manual');
    expect(selects.some((c) => String(c).includes('new_client_bonus_mode, ') || String(c).endsWith('new_client_bonus_mode'))).toBe(true);
  });

  test('still attributes the commission when the column is missing', async () => {
    const { resolveCommissionAgent } = await loadModule();
    const { admin, selects } = makeAdmin(false);
    const result = await resolveCommissionAgent(admin, document);
    expect(result).toMatchObject({ agentId: 'agent-1', via: 'creator' });
    // The lookup itself must not mention the missing column.
    const lookupCols = selects.filter((c) => c !== 'new_client_bonus_mode');
    expect(lookupCols.every((c) => !String(c).includes('new_client_bonus_mode'))).toBe(true);
    expect(lookupCols.every((c) => String(c).includes('new_client_bonus_enabled'))).toBe(true);
  });

  test('probes only once after the column is found', async () => {
    const { resolveCommissionAgent } = await loadModule();
    const { admin, selects } = makeAdmin(true);
    await resolveCommissionAgent(admin, document);
    await resolveCommissionAgent(admin, document);
    await resolveCommissionAgent(admin, document);
    expect(selects.filter((c) => c === 'new_client_bonus_mode')).toHaveLength(1);
  });

  test('keeps re-probing while the column is missing, so it heals after the migration', async () => {
    const { resolveCommissionAgent } = await loadModule();
    const { admin, selects } = makeAdmin(false);
    await resolveCommissionAgent(admin, document);
    await resolveCommissionAgent(admin, document);
    expect(selects.filter((c) => c === 'new_client_bonus_mode')).toHaveLength(2);
  });
});
