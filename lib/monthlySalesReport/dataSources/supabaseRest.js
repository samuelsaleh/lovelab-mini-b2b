/**
 * The same read as fetchSupabaseRows (supabase.js), over Supabase's plain
 * REST API instead of the supabase-js client — for Google Apps Script, which
 * can only make plain HTTP calls (UrlFetchApp). Same tables, same columns,
 * same paging by id, same de-duplication; GET requests only, so it can never
 * write.
 *
 * `fetchJson(url, headers)` is injected: UrlFetchApp in Apps Script, fetch in
 * Node (tests and the equivalence check against the supabase-js path).
 */

import { DOCUMENT_COLUMNS, withMetadata } from './supabase.js'

const PAGE = 1000

function query(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

/**
 * @param {object} o
 * @param {string} o.url      project URL, e.g. https://xyz.supabase.co
 * @param {string} o.key      service-role / secret key (never logged)
 * @param {(url: string, headers: object) => any} o.fetchJson  sync or async
 */
export async function fetchSupabaseRowsRest({ url, key, fetchJson }) {
  if (!url || !key) throw new Error('No database access configured: SUPABASE_URL and SUPABASE_KEY are required')
  const base = `${String(url).replace(/\/+$/, '')}/rest/v1`
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' }

  async function all(table, select, filters = {}) {
    const byId = new Map()
    for (let offset = 0; ; offset += PAGE) {
      const rows = await fetchJson(`${base}/${table}?${query({ select, ...filters, order: 'id.asc', limit: PAGE, offset })}`, headers)
      if (!Array.isArray(rows)) throw new Error(`Supabase read failed (${table}): ${JSON.stringify(rows).slice(0, 200)}`)
      for (const r of rows) byId.set(r.id, r)
      if (rows.length < PAGE) return [...byId.values()]
    }
  }

  const documents = await all('documents', DOCUMENT_COLUMNS.replace(/\s+/g, ''), { document_type: 'eq.order', deleted_at: 'is.null' })
  const events = await all('events', 'id,name,type,start_date,end_date')
  const commissions = await all('agent_commissions', 'id,agent_id,document_id,type,commission_amount,status,created_at')
  const payments = await all('agent_payments', 'id,agent_id,amount,payment_date')

  const agentIds = [...new Set([...documents.map((d) => d.agent_id), ...commissions.map((c) => c.agent_id), ...payments.map((p) => p.agent_id)].filter(Boolean))]
  const profiles = []
  for (let i = 0; i < agentIds.length; i += 150) {
    const ids = agentIds.slice(i, i + 150)
    const rows = await fetchJson(`${base}/profiles?${query({ select: 'id,full_name,email', id: `in.(${ids.join(',')})` })}`, headers)
    if (!Array.isArray(rows)) throw new Error(`Supabase read failed (agent names): ${JSON.stringify(rows).slice(0, 200)}`)
    profiles.push(...rows)
  }

  return { documents: documents.map(withMetadata), events, profiles, commissions, payments }
}
