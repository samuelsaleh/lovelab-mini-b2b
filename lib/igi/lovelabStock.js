/**
 * Reads LoveLab's packing stock from the Laravel ERP.
 *
 * Server-only. The strict CSP in next.config.js does not list
 * software.love-lab.com in connect-src, and it should not: this endpoint
 * currently answers with no authentication at all, so it must never be reachable
 * from a browser. Same env var as lib/lovelab-sync.js.
 */

const LOVELAB_API = () => process.env.LOVELAB_API_URL || 'https://software.love-lab.com/api'

const TIMEOUT_MS = 20_000

/**
 * @returns {Promise<{ branch_id:number, country_stock:string, count:number,
 *                     data: Array<{description:string, total_pcs:number}> }>}
 * @throws when the endpoint is unreachable, slow, or answers in a shape we do
 *         not recognise — the caller must leave yesterday's figures standing
 *         rather than write a guess.
 */
export async function fetchPackingStock() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let res
  try {
    res = await fetch(`${LOVELAB_API()}/packing-stock`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`packing-stock did not answer within ${TIMEOUT_MS / 1000}s`)
    }
    throw new Error(`packing-stock unreachable: ${err?.message || 'network error'}`)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) throw new Error(`packing-stock returned HTTP ${res.status}`)

  const json = await res.json().catch(() => null)
  if (!json || json.success !== true || !Array.isArray(json.data)) {
    throw new Error('packing-stock answered in an unexpected shape')
  }

  return json
}
