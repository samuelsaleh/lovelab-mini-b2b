import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getUserContext } from '@/app/api/_lib/access'
import { syncConsignmentToLovelab } from '@/lib/lovelab-sync'

/**
 * POST /api/consignment/reconcile
 *
 * Atomic reconciliation: creates the sold-items invoice AND marks the
 * consignment as returned in a single server call. If the consignment
 * patch fails after the invoice was created, the invoice is cleaned up.
 *
 * Idempotency: if the consignment already has a returned_at, returns
 * the existing state instead of creating duplicates.
 */
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { user, isAdmin } = await getUserContext(supabase)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { order_id, reconciliation, client: clientInfo, sold_value } = body

    if (!order_id || !Array.isArray(reconciliation)) {
      return NextResponse.json({ error: 'order_id and reconciliation[] are required' }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    const { data: order, error: fetchErr } = await adminSupabase
      .from('documents')
      .select('*')
      .eq('id', order_id)
      .single()

    if (fetchErr || !order) {
      return NextResponse.json({ error: 'Consignment order not found' }, { status: 404 })
    }

    // Idempotency: already reconciled
    const existingConsignment = order.metadata?.consignment || {}
    if (existingConsignment.returned_at) {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        invoice_id: existingConsignment.invoice_document_id || null,
        document: order,
      })
    }

    const anySold = reconciliation.some(r => r.sold > 0)
    let invoiceId = null

    // Step 1: Create B2B invoice for sold items (if any)
    if (anySold && clientInfo) {
      const soldRows = (order.metadata?.formState?.rows || [])
        .filter(row => {
          const rec = reconciliation.find(r => r.row_no === row.no)
          return rec && rec.sold > 0
        })
        .map(row => {
          const rec = reconciliation.find(r => r.row_no === row.no)
          return {
            ...row,
            quantity: String(rec.sold),
            total: rec.sold > 0 && row.unitPrice
              ? String(Math.round(rec.sold * Number(row.unitPrice) * 100) / 100)
              : row.total,
          }
        })

      const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

      const invoiceMetadata = {
        formState: {
          ...(order.metadata?.formState || {}),
          rows: soldRows,
          companyName: clientInfo.companyName,
          contactName: clientInfo.contactName,
          email: clientInfo.email,
          phone: clientInfo.phone,
          addressLine1: clientInfo.addressLine1,
          addressLine2: clientInfo.addressLine2,
          country: clientInfo.country,
          vatNumber: clientInfo.vatNumber,
        },
        consignment_source_id: order.id,
        auto_created: true,
      }

      const { data: invoice, error: invoiceErr } = await adminSupabase
        .from('documents')
        .insert({
          event_id: order.event_id || null,
          client_name: clientInfo.contactName || order.client_name || 'Client',
          client_company: clientInfo.companyName || null,
          document_type: 'order',
          file_path: null,
          file_name: `Invoice — ${clientInfo.companyName || clientInfo.contactName || order.client_name || 'Client'} ${dateStr}`,
          total_amount: sold_value || null,
          created_by: user.id,
          metadata: invoiceMetadata,
          order_channel: 'b2b',
        })
        .select()
        .single()

      if (invoiceErr) {
        console.error('[reconcile] Invoice insert error:', invoiceErr.message)
        return NextResponse.json({ error: 'Failed to create invoice', detail: invoiceErr.message }, { status: 500 })
      }
      invoiceId = invoice.id
    }

    // Step 2: PATCH the consignment order as returned
    const consignmentPatch = {
      ...existingConsignment,
      returned_at: new Date().toISOString(),
      reconciliation,
      ...(invoiceId ? { invoice_document_id: invoiceId } : {}),
    }

    const { data: updated, error: patchErr } = await adminSupabase
      .from('documents')
      .update({
        metadata: { ...(order.metadata || {}), consignment: consignmentPatch },
      })
      .eq('id', order_id)
      .select()
      .single()

    if (patchErr) {
      console.error('[reconcile] Consignment patch error:', patchErr.message)
      // Cleanup: remove the orphaned invoice
      if (invoiceId) {
        console.warn('[reconcile] Cleaning up orphaned invoice:', invoiceId)
        await adminSupabase.from('documents').delete().eq('id', invoiceId)
      }
      return NextResponse.json({ error: 'Failed to update consignment', detail: patchErr.message }, { status: 500 })
    }

    // Non-blocking: sync return to Lovelab ERP
    syncConsignmentToLovelab(updated, true).catch(err =>
      console.error('[reconcile] Lovelab sync error (non-blocking):', err.message)
    )

    return NextResponse.json({ ok: true, invoice_id: invoiceId, document: updated })
  } catch (err) {
    console.error('[reconcile] Unexpected error:', err.message)
    return NextResponse.json({ error: err.message || 'Reconciliation failed' }, { status: 500 })
  }
}
