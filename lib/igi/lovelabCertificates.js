/**
 * LoveLab ERP certificate ledger APIs.
 *
 * Server-only — same rule as lib/igi/lovelabStock.js: never call from the browser.
 * Uses LOVELAB_API_URL (default production ERP API base).
 */

const LOVELAB_API = () => process.env.LOVELAB_API_URL || 'https://software.lovelab-antwerp.com/api'

const TIMEOUT_MS = 20_000

async function lovelabFetch(path, { method = 'GET', body, query } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const url = new URL(`${LOVELAB_API().replace(/\/$/, '')}/${path.replace(/^\//, '')}`)
  if (query && typeof query === 'object') {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    }
  }

  let res
  try {
    res = await fetch(url.toString(), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`certificate API ${path} did not answer within ${TIMEOUT_MS / 1000}s`)
    }
    throw new Error(`certificate API ${path} unreachable: ${err?.message || 'network error'}`)
  } finally {
    clearTimeout(timer)
  }

  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = json?.message || json?.error || `HTTP ${res.status}`
    const err = new Error(`certificate API ${path}: ${msg}`)
    err.status = res.status
    err.body = json
    throw err
  }

  return json
}

/** GET /api/certificate-in/descriptions */
export async function fetchCertificateDescriptions() {
  const json = await lovelabFetch('certificate-in/descriptions')
  if (!json || json.success !== true || !Array.isArray(json.data)) {
    throw new Error('certificate-in/descriptions answered in an unexpected shape')
  }
  return json
}

/** GET /api/certificate-stock */
export async function fetchCertificateStock(query = {}) {
  const json = await lovelabFetch('certificate-stock', { query })
  if (!json || json.success !== true || !Array.isArray(json.data)) {
    throw new Error('certificate-stock answered in an unexpected shape')
  }
  return json
}

/**
 * POST /api/certificate-in
 * @param {{ date?: string, party?: string, external_ref?: string,
 *           items: Array<{ description: string, pcs: number }> }} payload
 */
export async function postCertificateIn(payload) {
  const json = await lovelabFetch('certificate-in', { method: 'POST', body: payload })
  if (!json || json.success !== true) {
    throw new Error(json?.message || 'certificate-in failed')
  }
  return json
}

/**
 * POST /api/certificate-out
 * B2B → ERP when B2B originates an out.
 * @param {{ date?: string, party?: string, external_ref?: string,
 *           items: Array<{ description: string, pcs: number, remark?: string }> }} payload
 */
export async function postCertificateOut(payload) {
  const json = await lovelabFetch('certificate-out', { method: 'POST', body: payload })
  if (!json || json.success !== true) {
    throw new Error(json?.message || 'certificate-out failed')
  }
  return json
}

/**
 * GET /api/certificate-in (list for ERP → B2B mirror)
 * @param {{ since_id?: number|string, from?: string, to?: string, limit?: number,
 *           country_stock?: string, branch_id?: number }} query
 */
export async function fetchCertificateIns(query = {}) {
  const json = await lovelabFetch('certificate-in', { query })
  if (!json || json.success !== true || !Array.isArray(json.data)) {
    throw new Error('certificate-in answered in an unexpected shape')
  }
  return json
}

/**
 * GET /api/certificate-out
 * @param {{ since_id?: number|string, from?: string, to?: string, limit?: number,
 *           country_stock?: string, branch_id?: number }} query
 */
export async function fetchCertificateOuts(query = {}) {
  const json = await lovelabFetch('certificate-out', { query })
  if (!json || json.success !== true || !Array.isArray(json.data)) {
    throw new Error('certificate-out answered in an unexpected shape')
  }
  return json
}

export { LOVELAB_API }
