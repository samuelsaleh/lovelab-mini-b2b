/**
 * Server-only module — syncs consignment/gift-lost orders with the
 * Lovelab main system (Laravel ERP).
 *
 * All functions in this file talk to an external API and must only be
 * called from Next.js API routes (never from client components).
 */

const LOVELAB_API = () => process.env.LOVELAB_API_URL || 'https://software.love-lab.com/api'

function buildItemPayload(document) {
  const formState = document.metadata?.formState || {}
  return (formState.rows || []).map(row => ({
    consignment_item_id: `${document.id}-${row.no}`,
    type: 'BRACELET',
    category: row.collection,
    carat: row.carat,
    housing: row.bpColor,
    setting: row.setting,
    shape: row.shape,
    color: row.colorCord,
    product_size: row.size,
    variant: row.variant,
    product_id: row.productId,
    description: row.material,
    pcs: Number(row.quantity) || 1,
    weight: (Number(row.quantity) || 1) * (Number(row.carat) || 0),
    rate: Number(row.unitPrice) || 0,
  }))
}

/**
 * Syncs consignment orders with the Lovelab main system (Laravel).
 */
export async function syncConsignmentToLovelab(document, isReturn = false) {
  const apiUrl = LOVELAB_API()
  if (!apiUrl) {
    console.error('[Lovelab Sync] LOVELAB_API_URL not configured')
    return
  }

  const endpoint = isReturn ? `${apiUrl}/consignment-order/return` : `${apiUrl}/consignment-order/store`
  const metadata = document.metadata || {}
  const consignment = metadata.consignment || {}

  const payload = {
    consignment_order_id: document.id,
    party: document.client_name,
    bill_no: document.file_name,
    date: document.created_at,
    total_carat: metadata.total_carat || 0,
    total_amount: document.total_amount || 0,
    final_total: document.total_amount || 0,
    items: buildItemPayload(document),
  }

  if (isReturn) {
    const reconciliation = consignment.reconciliation || []
    if (reconciliation.length > 0) {
      payload.items = reconciliation.map(rec => ({
        consignment_item_id: `${document.id}-${rec.row_no}`,
        pcs: rec.came_back,
        weight: rec.came_back * (Number(payload.items.find(i => i.consignment_item_id === `${document.id}-${rec.row_no}`)?.carat) || 0),
      }))
    }
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const result = await response.json()
    if (!response.ok) {
      console.error('[Lovelab Sync] Error:', result.message || response.statusText)
    } else {
      console.log('[Lovelab Sync] Success:', result.data)
    }
    return result
  } catch (error) {
    console.error('[Lovelab Sync] Fetch Error:', error.message)
    throw error
  }
}

/**
 * Syncs write-off (gift/lost) orders with the Lovelab main system (Laravel).
 */
export async function syncGiftLostToLovelab(document) {
  const apiUrl = LOVELAB_API()
  if (!apiUrl) {
    console.error('[Lovelab Sync Gift Lost] LOVELAB_API_URL not configured')
    return
  }

  const endpoint = `${apiUrl}/gift-lost-order/store`

  const payload = {
    consignment_order_id: document.id,
    party: document.client_name,
    bill_no: document.file_name,
    date: document.created_at,
    total_carat: document.metadata?.total_carat || 0,
    total_amount: document.total_amount || 0,
    final_total: document.total_amount || 0,
    items: buildItemPayload(document),
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const result = await response.json()
    if (!response.ok) {
      console.error('[Lovelab Sync Gift Lost] Error:', result.message || response.statusText)
    } else {
      console.log('[Lovelab Sync Gift Lost] Success:', result.data)
    }
    return result
  } catch (error) {
    console.error('[Lovelab Sync Gift Lost] Fetch Error:', error.message)
    throw error
  }
}

/**
 * Undoes a consignment return (restores issued quantity) in the Lovelab main system.
 */
export async function undoConsignmentReturnToLovelab(document) {
  const apiUrl = LOVELAB_API()
  if (!apiUrl) return

  const formState = document.metadata?.formState || {}

  const payload = {
    consignment_order_id: document.id,
    items: (formState.rows || []).map(row => ({
      consignment_item_id: `${document.id}-${row.no}`,
      sku: row.sku || row.productId,
    })),
  }

  try {
    const fullUrl = `${apiUrl}/consignment-order/undo-return`
    console.log('[Lovelab Sync Undo] Sending request to:', fullUrl)

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Lovelab Sync Undo] Server responded with error:', response.status, errorText)
      throw new Error(`Server Error: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    console.log('[Lovelab Sync Undo] Success:', result.message || 'Operation successful')
    return result
  } catch (error) {
    console.error('[Lovelab Sync Undo] Fetch Error:', error.message)
    throw error
  }
}
