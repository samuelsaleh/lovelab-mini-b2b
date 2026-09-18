/**
 * @jest-environment node
 *
 * loadIgiWorld must serve every IGI screen on a database whose tables exist
 * but predate today's requested_at column (Sam, 10 Sept 2026: "IGI still
 * doesn't work at all" on a database switched on before the update).
 */
const { loadIgiWorld } = require('../igi-portal/_lib/load');

function sb({ hasRequestedAt }) {
  const selects = [];
  const rows = {
    igi_models: [
      { id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', state: 'in_use', sort_order: 1 },
      { id: 'm2', serial: null, name: 'Full Moonlight', state: 'awaiting_serial', sort_order: 99 },
    ],
    igi_batches: [], igi_visit_lines: [], igi_visits: [],
  };
  return {
    selects,
    from(table) {
      let cols = '';
      const chain = {
        select: (c) => { cols = c; selects.push([table, c]); return chain; },
        order: () => chain,
        then: (resolve) => {
          if (table === 'igi_models' && /requested_at/.test(cols) && !hasRequestedAt) {
            return resolve({ data: null, error: { code: '42703', message: 'column igi_models.requested_at does not exist' } });
          }
          return resolve({ data: rows[table], error: null });
        },
      };
      return chain;
    },
  };
}

test('asks for requested_at and uses it when the column exists', async () => {
  const db = sb({ hasRequestedAt: true });
  const world = await loadIgiWorld(db);
  expect(db.selects.filter(([t]) => t === 'igi_models')).toHaveLength(1);
  expect(world.models.map((m) => m.id)).toEqual(['m1']);
  expect(world.awaiting.map((m) => m.id)).toEqual(['m2']);
});

test('falls back to the old columns when the database is behind, and still lists the waiting model', async () => {
  const db = sb({ hasRequestedAt: false });
  const world = await loadIgiWorld(db);
  const modelSelects = db.selects.filter(([t]) => t === 'igi_models').map(([, c]) => c);
  expect(modelSelects).toHaveLength(2);
  expect(modelSelects[1]).not.toMatch(/requested_at/);
  expect(world.models.map((m) => m.id)).toEqual(['m1']);
  expect(world.awaiting.map((m) => m.id)).toEqual(['m2']);
});
