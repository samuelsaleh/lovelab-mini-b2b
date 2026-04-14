'use client'

import { useState } from 'react'
import { colors, fonts } from '@/lib/styles'
import ConsignmentRecipientForm from './ConsignmentRecipientForm'

/**
 * EditConsignmentDetailsModal
 *
 * Opens a modal pre-filled with the consignment metadata for `order`,
 * lets the admin edit recipient / agent / return date, then PATCHes.
 *
 * Props:
 *   order     — document object (must have id + metadata.consignment)
 *   onClose   — () => void
 *   onSaved   — (updatedOrder) => void  called after a successful save
 */
export default function EditConsignmentDetailsModal({ order, onClose, onSaved }) {
  const existing = order?.metadata?.consignment || {}

  // Build initial ConsignmentData from what's stored on the order
  const [consignmentData, setConsignmentData] = useState({
    recipient_type: existing.recipient_type || 'contact',
    agent_id: order.consignment_agent_id || null,
    contact_id: existing.contact_id || null,
    saveAsContact: false,
    recipient_name: existing.recipient_name || '',
    recipient_company: existing.recipient_company || '',
    recipient_phone: existing.recipient_phone || '',
    recipient_email: existing.recipient_email || '',
    recipient_address: existing.recipient_address || '',
    return_date: existing.return_date || '',
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSave = async () => {
    // Validate required fields
    if (consignmentData.recipient_type === 'contact' && !consignmentData.recipient_name?.trim()) {
      setError('Full name is required for a contact recipient.')
      return
    }
    if (consignmentData.recipient_type === 'agent' && !consignmentData.agent_id) {
      setError('Please select an agent.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      // Save as new contact if requested
      let resolvedContactId = consignmentData.contact_id || null
      if (consignmentData.saveAsContact && consignmentData.recipient_name?.trim() && !resolvedContactId) {
        try {
          const cr = await fetch('/api/consignment-contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              full_name: consignmentData.recipient_name.trim(),
              company: consignmentData.recipient_company?.trim() || null,
              phone: consignmentData.recipient_phone?.trim() || null,
              email: consignmentData.recipient_email?.trim() || null,
              address: consignmentData.recipient_address?.trim() || null,
            }),
          })
          const cd = await cr.json()
          if (cd.contact?.id) resolvedContactId = cd.contact.id
        } catch { /* non-blocking */ }
      }

      const newConsignment = {
        // preserve fields that aren't touched here (e.g. returned_at)
        ...existing,
        recipient_type: consignmentData.recipient_type,
        contact_id: resolvedContactId,
        recipient_name: consignmentData.recipient_name?.trim() || '',
        recipient_company: consignmentData.recipient_company?.trim() || '',
        recipient_phone: consignmentData.recipient_phone?.trim() || '',
        recipient_email: consignmentData.recipient_email?.trim() || '',
        recipient_address: consignmentData.recipient_address?.trim() || '',
        return_date: consignmentData.return_date || null,
      }

      const agentId = consignmentData.recipient_type === 'agent'
        ? (consignmentData.agent_id || null)
        : null

      const res = await fetch(`/api/documents/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata: { consignment: newConsignment },
          consignment_agent_id: agentId,
        }),
      })

      const resBody = await res.json()

      if (!res.ok) {
        throw new Error(resBody.detail || resBody.error || 'Failed to save')
      }
      if (!resBody.document) {
        throw new Error('Save failed — document not found or no changes were applied.')
      }

      // PATCH response does not embed the profiles join, so we reconstruct
      // consignment_agent from the existing order or by fetching the profile.
      let resolvedAgent = agentId ? (order.consignment_agent || null) : null
      if (agentId && agentId !== order.consignment_agent_id) {
        // Agent changed — fetch minimal profile to keep UI in sync
        try {
          const ar = await fetch(`/api/agents/${agentId}`)
          const ad = await ar.json()
          if (ad.agent) resolvedAgent = { full_name: ad.agent.full_name, email: ad.agent.email }
        } catch { /* non-blocking — UI will still show correct data on next full refresh */ }
      }

      // Use the saved metadata from the DB response to ensure UI is in sync
      const savedConsignment = resBody.document.metadata?.consignment || newConsignment

      onSaved({
        ...order,
        ...resBody.document,
        metadata: { ...(order.metadata || {}), ...resBody.document.metadata, consignment: savedConsignment },
        consignment_agent_id: agentId,
        consignment_agent: resolvedAgent,
      })
    } catch (err) {
      setError(err.message || 'Failed to save changes')
    }
    setSaving(false)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 700,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, padding: 28,
          width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 16px 48px rgba(0,0,0,0.18)', fontFamily: fonts.body,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: colors.inkPlum }}>
              Edit Consignment Details
            </h2>
            <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
              {order.client_name || order.client_company || order.file_name || 'this order'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, color: '#aaa', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
          >
            ×
          </button>
        </div>

        <ConsignmentRecipientForm
          value={consignmentData}
          onChange={setConsignmentData}
          isOpen={true}
        />

        {error && (
          <div style={{ marginTop: 14, padding: '9px 12px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '10px 18px', borderRadius: 8, border: '1px solid #e3e3e3',
              background: '#fff', color: '#666', fontSize: 13, cursor: 'pointer',
              fontFamily: fonts.body,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '10px 22px', borderRadius: 8, border: 'none',
              background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer', fontFamily: fonts.body,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
