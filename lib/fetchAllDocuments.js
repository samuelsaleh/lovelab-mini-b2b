/**
 * Fetch EVERY document the caller can see, paginating past the API's default
 * 50-row page so dashboards aggregate over all orders — not just page one.
 *
 * Returns full document rows (same shape as GET /api/documents), so every
 * consumer field (event_id, document_type, metadata, total_amount, status…)
 * is present. Matches the pagination approach already used by AnalyticsDashboard.
 *
 * @param {(url: string) => Promise<Response>} [doFetch=fetch] - fetch or a
 *   wrapper like safeFetch; must resolve to a Response.
 * @param {{ params?: string, perPage?: number }} [opts] - `params` is an extra
 *   query string appended verbatim (e.g. "order_channel=consignment").
 * @returns {Promise<object[]>} all document rows the caller can access.
 */
export async function fetchAllDocuments(doFetch = fetch, { params = '', perPage = 200 } = {}) {
  const all = []
  let page = 1
  let total = Infinity
  const extra = params ? `&${params}` : ''
  // page cap is a safety valve against a misbehaving total_count (200 * 100 = 20k rows)
  while (all.length < total && page <= 100) {
    const res = await doFetch(`/api/documents?per_page=${perPage}&page=${page}${extra}`)
    const data = await res.json().catch(() => ({}))
    const batch = Array.isArray(data?.documents) ? data.documents : []
    all.push(...batch)
    total = typeof data?.total_count === 'number' ? data.total_count : all.length
    if (batch.length < perPage) break
    page += 1
  }
  return all
}

export default fetchAllDocuments
