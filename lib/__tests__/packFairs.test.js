/**
 * lib/packFairs — pack fair folders + per-user pack hiding (Phase 34).
 *
 * What's covered:
 *   - syncPackFairs replaces the whole set (delete-then-insert), dedupes,
 *     tolerates junk entries, clears on an empty list, and surfaces DB errors
 *     instead of silently losing the assignment.
 *   - fetchFairIdsForPacks groups rows into { packId: [eventId, ...] } and
 *     short-circuits on an empty input so we never issue an `in ()` query.
 *   - fetchHiddenPackIds / setPackHidden always scope by user_id, so one user
 *     can never read or write another user's hidden list even with the
 *     RLS-bypassing admin client.
 *   - fetchFairsWithPackCounts only counts fairs, and reports 0 (not missing)
 *     for a fair with no packs.
 *   - findNonFairEventIds is what stops a caller filing a pack under an agent
 *     folder or a partner event.
 *
 * Supabase is mocked with a chainable recorder so we can assert the exact
 * shape of every query without touching the network.
 */

import {
  syncPackFairs,
  fetchFairIdsForPacks,
  fetchHiddenPackIds,
  setPackHidden,
  fetchFairsWithPackCounts,
  findNonFairEventIds,
  isMissingTableError,
  FAIR_EVENT_TYPE,
} from '../packFairs'

// `handlers(ctx)` receives { table, ops } and returns the { data, error } the
// awaited chain should resolve to. Returning undefined defaults to an empty ok.
function makeClient(handlers = () => ({ data: [], error: null })) {
  const calls = []
  const client = {
    calls,
    // Every recorded query for a table, in order.
    forTable(table) { return calls.filter((c) => c.table === table) },
    from(table) {
      const ctx = { table, ops: [] }
      calls.push(ctx)
      const chain = {
        select(cols) { ctx.ops.push({ op: 'select', cols }); return chain },
        insert(values) { ctx.ops.push({ op: 'insert', values }); return chain },
        upsert(values, opts) { ctx.ops.push({ op: 'upsert', values, opts }); return chain },
        delete() { ctx.ops.push({ op: 'delete' }); return chain },
        eq(col, val) { ctx.ops.push({ op: 'eq', col, val }); return chain },
        in(col, vals) { ctx.ops.push({ op: 'in', col, vals }); return chain },
        order(col, opts) { ctx.ops.push({ op: 'order', col, opts }); return chain },
        then(resolve, reject) {
          const result = handlers(ctx) || { data: [], error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return chain
    },
  }
  return client
}

function opsOf(ctx) {
  return ctx.ops.map((o) => o.op)
}

describe('syncPackFairs', () => {
  it('replaces the whole set: deletes the old rows, then inserts the new ones', async () => {
    const client = makeClient()
    await syncPackFairs(client, 'p-1', ['f-1', 'f-2'], 'u-1')

    const queries = client.forTable('pack_fairs')
    expect(queries).toHaveLength(2)
    expect(opsOf(queries[0])).toEqual(['delete', 'eq'])
    expect(queries[0].ops[1]).toEqual({ op: 'eq', col: 'pack_id', val: 'p-1' })
    expect(queries[1].ops[0].values).toEqual([
      { pack_id: 'p-1', event_id: 'f-1', added_by: 'u-1' },
      { pack_id: 'p-1', event_id: 'f-2', added_by: 'u-1' },
    ])
  })

  it('collapses duplicate event ids to one row (the UI can send a merged list)', async () => {
    const client = makeClient()
    await syncPackFairs(client, 'p-1', ['f-1', 'f-1', 'f-2', 'f-1'], 'u-1')

    const insert = client.forTable('pack_fairs')[1].ops[0]
    expect(insert.values).toHaveLength(2)
    expect(insert.values.map((r) => r.event_id)).toEqual(['f-1', 'f-2'])
  })

  it('drops non-string and empty entries instead of writing junk rows', async () => {
    const client = makeClient()
    await syncPackFairs(client, 'p-1', ['f-1', '', null, undefined, 42, {}], 'u-1')

    const insert = client.forTable('pack_fairs')[1].ops[0]
    expect(insert.values).toEqual([{ pack_id: 'p-1', event_id: 'f-1', added_by: 'u-1' }])
  })

  it('unfiles the pack everywhere on an empty list, without inserting', async () => {
    const client = makeClient()
    await syncPackFairs(client, 'p-1', [], 'u-1')

    const queries = client.forTable('pack_fairs')
    expect(queries).toHaveLength(1)
    expect(opsOf(queries[0])).toEqual(['delete', 'eq'])
  })

  it('treats a missing list the same as an empty one', async () => {
    const client = makeClient()
    await syncPackFairs(client, 'p-1', undefined, 'u-1')
    expect(client.forTable('pack_fairs')).toHaveLength(1)
  })

  it('omits added_by when no user is supplied', async () => {
    const client = makeClient()
    await syncPackFairs(client, 'p-1', ['f-1'])

    const insert = client.forTable('pack_fairs')[1].ops[0]
    expect(insert.values).toEqual([{ pack_id: 'p-1', event_id: 'f-1' }])
  })

  it('throws when the delete fails, so the caller does not report success', async () => {
    const client = makeClient((ctx) => (
      ctx.ops.some((o) => o.op === 'delete')
        ? { data: null, error: { message: 'delete blocked' } }
        : { data: [], error: null }
    ))
    await expect(syncPackFairs(client, 'p-1', ['f-1'])).rejects.toThrow('delete blocked')
  })

  it('throws when the insert fails', async () => {
    const client = makeClient((ctx) => (
      ctx.ops.some((o) => o.op === 'insert')
        ? { data: null, error: { message: 'insert blocked' } }
        : { data: [], error: null }
    ))
    await expect(syncPackFairs(client, 'p-1', ['f-1'])).rejects.toThrow('insert blocked')
  })
})

describe('fetchFairIdsForPacks', () => {
  it('groups rows into { packId: [eventId, ...] }', async () => {
    const client = makeClient(() => ({
      data: [
        { pack_id: 'p-1', event_id: 'f-1' },
        { pack_id: 'p-1', event_id: 'f-2' },
        { pack_id: 'p-2', event_id: 'f-1' },
      ],
      error: null,
    }))

    const map = await fetchFairIdsForPacks(client, ['p-1', 'p-2', 'p-3'])
    expect(map).toEqual({ 'p-1': ['f-1', 'f-2'], 'p-2': ['f-1'] })
    // A pack with no fairs is simply absent — callers default it to [].
    expect(map['p-3']).toBeUndefined()
  })

  it('returns {} without querying when there are no pack ids', async () => {
    const client = makeClient()
    await expect(fetchFairIdsForPacks(client, [])).resolves.toEqual({})
    expect(client.calls).toHaveLength(0)
  })

  it('deduplicates the requested pack ids', async () => {
    const client = makeClient(() => ({ data: [], error: null }))
    await fetchFairIdsForPacks(client, ['p-1', 'p-1'])
    const inOp = client.forTable('pack_fairs')[0].ops.find((o) => o.op === 'in')
    expect(inOp.vals).toEqual(['p-1'])
  })

  it('throws on a query error', async () => {
    const client = makeClient(() => ({ data: null, error: { message: 'boom' } }))
    await expect(fetchFairIdsForPacks(client, ['p-1'])).rejects.toThrow('boom')
  })
})

describe('fetchHiddenPackIds', () => {
  it('returns the set of pack ids this user hid, always scoped by user_id', async () => {
    const client = makeClient(() => ({
      data: [{ pack_id: 'p-1' }, { pack_id: 'p-9' }],
      error: null,
    }))

    const hidden = await fetchHiddenPackIds(client, 'u-1')
    expect(hidden).toBeInstanceOf(Set)
    expect([...hidden].sort()).toEqual(['p-1', 'p-9'])

    const q = client.forTable('pack_hidden')[0]
    expect(q.ops).toEqual([
      { op: 'select', cols: 'pack_id' },
      { op: 'eq', col: 'user_id', val: 'u-1' },
    ])
  })

  it('returns an empty set without querying when there is no user', async () => {
    const client = makeClient()
    await expect(fetchHiddenPackIds(client, null)).resolves.toEqual(new Set())
    expect(client.calls).toHaveLength(0)
  })

  it('throws on a query error', async () => {
    const client = makeClient(() => ({ data: null, error: { message: 'nope' } }))
    await expect(fetchHiddenPackIds(client, 'u-1')).rejects.toThrow('nope')
  })
})

describe('setPackHidden', () => {
  it('upserts a row for this user when hiding (idempotent)', async () => {
    const client = makeClient()
    await setPackHidden(client, 'p-1', 'u-1', true)

    const q = client.forTable('pack_hidden')[0]
    expect(q.ops[0]).toEqual({
      op: 'upsert',
      values: { pack_id: 'p-1', user_id: 'u-1' },
      opts: { onConflict: 'pack_id,user_id' },
    })
  })

  it('deletes only this user\u2019s row when unhiding', async () => {
    const client = makeClient()
    await setPackHidden(client, 'p-1', 'u-1', false)

    const q = client.forTable('pack_hidden')[0]
    expect(q.ops).toEqual([
      { op: 'delete' },
      { op: 'eq', col: 'pack_id', val: 'p-1' },
      { op: 'eq', col: 'user_id', val: 'u-1' },
    ])
  })

  it('refuses to run without both a pack and a user', async () => {
    const client = makeClient()
    await expect(setPackHidden(client, 'p-1', null, true)).rejects.toThrow(/required/)
    await expect(setPackHidden(client, null, 'u-1', true)).rejects.toThrow(/required/)
    expect(client.calls).toHaveLength(0)
  })

  it('throws when the write fails', async () => {
    const client = makeClient(() => ({ data: null, error: { message: 'rls' } }))
    await expect(setPackHidden(client, 'p-1', 'u-1', true)).rejects.toThrow('rls')
    await expect(setPackHidden(client, 'p-1', 'u-1', false)).rejects.toThrow('rls')
  })
})

describe('fetchFairsWithPackCounts', () => {
  it('reports a count per fair, and 0 (not missing) for an empty fair', async () => {
    const client = makeClient((ctx) => {
      if (ctx.table === 'events') {
        return {
          data: [
            { id: 'f-1', name: 'Ambiente Frankfurt', start_date: '2026-02-06', end_date: null },
            { id: 'f-2', name: 'Les Journées d\u2019Achats Paris', start_date: null, end_date: null },
          ],
          error: null,
        }
      }
      if (ctx.table === 'documents') {
        return { data: [{ event_id: 'f-2' }], error: null }
      }
      return {
        data: [{ event_id: 'f-1' }, { event_id: 'f-1' }, { event_id: 'f-1' }],
        error: null,
      }
    })

    const fairs = await fetchFairsWithPackCounts(client)
    expect(fairs).toEqual([
      { id: 'f-1', name: 'Ambiente Frankfurt', start_date: '2026-02-06', end_date: null, pack_count: 3, doc_count: 0 },
      { id: 'f-2', name: 'Les Journées d\u2019Achats Paris', start_date: null, end_date: null, pack_count: 0, doc_count: 1 },
    ])
  })

  it('counts documents per fair so the UI can tell an empty folder from a full one', async () => {
    const client = makeClient((ctx) => {
      if (ctx.table === 'events') {
        return { data: [{ id: 'f-1', name: 'A' }, { id: 'f-2', name: 'B' }], error: null }
      }
      if (ctx.table === 'documents') {
        return { data: [{ event_id: 'f-1' }, { event_id: 'f-1' }, { event_id: null }], error: null }
      }
      return { data: [], error: null }
    })

    const fairs = await fetchFairsWithPackCounts(client)
    expect(fairs.map((f) => [f.id, f.pack_count, f.doc_count])).toEqual([
      ['f-1', 0, 2],
      ['f-2', 0, 0],
    ])
  })

  it('reports doc_count as null — never 0 — when the document count cannot be read', async () => {
    // 0 would mean "safe to delete this folder". A failed query must never be
    // allowed to say that about a folder that might be full of orders.
    const client = makeClient((ctx) => {
      if (ctx.table === 'events') return { data: [{ id: 'f-1', name: 'A' }], error: null }
      if (ctx.table === 'documents') return { data: null, error: { message: 'boom' } }
      return { data: [], error: null }
    })

    const fairs = await fetchFairsWithPackCounts(client)
    expect(fairs[0].doc_count).toBeNull()
    expect(fairs[0].pack_count).toBe(0)
  })

  it('only looks at fair-type events (never agent or partner folders)', async () => {
    const client = makeClient((ctx) => (
      ctx.table === 'events' ? { data: [{ id: 'f-1', name: 'F' }], error: null } : { data: [], error: null }
    ))
    await fetchFairsWithPackCounts(client)

    const eq = client.forTable('events')[0].ops.find((o) => o.op === 'eq')
    expect(eq).toEqual({ op: 'eq', col: 'type', val: FAIR_EVENT_TYPE })
    expect(FAIR_EVENT_TYPE).toBe('fair')
  })

  it('returns [] and skips the count query when there are no fairs', async () => {
    const client = makeClient(() => ({ data: [], error: null }))
    await expect(fetchFairsWithPackCounts(client)).resolves.toEqual([])
    expect(client.forTable('pack_fairs')).toHaveLength(0)
  })

  it('throws when the events query fails', async () => {
    const client = makeClient(() => ({ data: null, error: { message: 'events down' } }))
    await expect(fetchFairsWithPackCounts(client)).rejects.toThrow('events down')
  })

  it('throws when the count query fails', async () => {
    const client = makeClient((ctx) => (
      ctx.table === 'events'
        ? { data: [{ id: 'f-1', name: 'F' }], error: null }
        : { data: null, error: { message: 'links down' } }
    ))
    await expect(fetchFairsWithPackCounts(client)).rejects.toThrow('links down')
  })
})

describe('findNonFairEventIds', () => {
  it('reports the ids that are not fairs (e.g. an agent folder)', async () => {
    const client = makeClient(() => ({ data: [{ id: 'f-1' }], error: null }))
    const unknown = await findNonFairEventIds(client, ['f-1', 'agent-folder-1', 'nope'])
    expect(unknown).toEqual(['agent-folder-1', 'nope'])
  })

  it('returns [] when every id is a known fair', async () => {
    const client = makeClient(() => ({ data: [{ id: 'f-1' }, { id: 'f-2' }], error: null }))
    await expect(findNonFairEventIds(client, ['f-1', 'f-2'])).resolves.toEqual([])
  })

  it('returns [] without querying for an empty list (unfiling needs no check)', async () => {
    const client = makeClient()
    await expect(findNonFairEventIds(client, [])).resolves.toEqual([])
    expect(client.calls).toHaveLength(0)
  })

  it('throws on a query error rather than accepting unvalidated ids', async () => {
    const client = makeClient(() => ({ data: null, error: { message: 'down' } }))
    await expect(findNonFairEventIds(client, ['f-1'])).rejects.toThrow('down')
  })
})

// ─── Pre-migration detection ────────────────────────────────────────────────
//
// Until the Phase 34 migration is applied, pack_fairs and pack_hidden don't
// exist and every write fails. That has to be distinguishable from a real error:
// the UI rolls the change back either way, and "the table is missing" needs a
// migration while a genuine failure needs a retry. Getting this wrong is what
// made hiding look like it silently undid itself.

describe('isMissingTableError', () => {
  it('recognises the PostgREST schema-cache miss Supabase actually returns', () => {
    const err = Object.assign(
      new Error("Could not find the table 'public.pack_hidden' in the schema cache"),
      { code: 'PGRST205' },
    )
    expect(isMissingTableError(err)).toBe(true)
  })

  it('recognises the raw Postgres undefined_table code', () => {
    const err = Object.assign(new Error('relation "pack_fairs" does not exist'), { code: '42P01' })
    expect(isMissingTableError(err)).toBe(true)
  })

  it('recognises it from the message alone when no code survived', () => {
    expect(isMissingTableError(new Error('relation "pack_hidden" does not exist'))).toBe(true)
  })

  it('does not mistake an ordinary failure for a missing table', () => {
    const err = Object.assign(new Error('permission denied for table pack_hidden'), { code: '42501' })
    expect(isMissingTableError(err)).toBe(false)
    expect(isMissingTableError(new Error('network down'))).toBe(false)
    expect(isMissingTableError(null)).toBe(false)
  })
})

describe('error codes survive the throw', () => {
  it('setPackHidden preserves the code so the route can classify it', async () => {
    const client = makeClient(() => ({
      data: null,
      error: { message: "Could not find the table 'public.pack_hidden'", code: 'PGRST205' },
    }))
    const err = await setPackHidden(client, 'p-1', 'u-1', true).catch((e) => e)
    expect(err.code).toBe('PGRST205')
    expect(isMissingTableError(err)).toBe(true)
  })

  it('syncPackFairs preserves the code too', async () => {
    const client = makeClient(() => ({
      data: null,
      error: { message: 'relation "pack_fairs" does not exist', code: '42P01' },
    }))
    const err = await syncPackFairs(client, 'p-1', ['f-1']).catch((e) => e)
    expect(isMissingTableError(err)).toBe(true)
  })
})

describe('fetchFairsWithPackCounts before the migration', () => {
  it('still lists the folders, with zero counts, when pack_fairs is missing', async () => {
    // Folder names live in `events`, which exists. Failing the whole call would
    // hide the folders entirely for a problem that only affects the counts.
    const client = makeClient((ctx) => {
      if (ctx.table === 'events') {
        return { data: [{ id: 'f-1', name: 'Ambiente Frankfurt' }], error: null }
      }
      if (ctx.table === 'documents') return { data: [], error: null }
      return {
        data: null,
        error: { message: "Could not find the table 'public.pack_fairs'", code: 'PGRST205' },
      }
    })
    await expect(fetchFairsWithPackCounts(client)).resolves.toEqual([
      { id: 'f-1', name: 'Ambiente Frankfurt', pack_count: 0, doc_count: 0 },
    ])
  })

  it('still throws when counting fails for a real reason', async () => {
    const client = makeClient((ctx) => {
      if (ctx.table === 'events') return { data: [{ id: 'f-1', name: 'F' }], error: null }
      if (ctx.table === 'documents') return { data: [], error: null }
      return { data: null, error: { message: 'permission denied', code: '42501' } }
    })
    await expect(fetchFairsWithPackCounts(client)).rejects.toThrow('permission denied')
  })
})
