'use client'

import { useState, useEffect } from 'react'
import { colors, fonts } from '@/lib/styles'

/**
 * ConsignmentRecipientForm
 *
 * Manages recipient selection for consignment orders.
 *
 * Props:
 *   value    — current ConsignmentData object (or null)
 *   onChange — callback(ConsignmentData)
 *   isOpen   — when true, trigger data fetches
 *
 * ConsignmentData shape:
 * {
 *   recipient_type: 'agent' | 'contact',
 *   agent_id: string | null,
 *   contact_id: string | null,
 *   saveAsContact: boolean,
 *   recipient_name: string,
 *   recipient_company: string,
 *   recipient_phone: string,
 *   recipient_email: string,
 *   recipient_address: string,
 *   return_date: string (YYYY-MM-DD) | '',
 * }
 */

const EMPTY_CONTACT_FIELDS = {
  recipient_name: '',
  recipient_company: '',
  recipient_phone: '',
  recipient_email: '',
  recipient_address: '',
}

function defaultValue() {
  return {
    recipient_type: 'contact',
    agent_id: null,
    contact_id: null,
    saveAsContact: false,
    ...EMPTY_CONTACT_FIELDS,
    return_date: '',
  }
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: '#8a6a7d', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

const inputStyle = (extra = {}) => ({
  width: '100%', padding: '9px 10px', borderRadius: 7,
  border: `1px solid #e3e3e3`, fontSize: 13,
  fontFamily: fonts.body, outline: 'none', boxSizing: 'border-box',
  background: '#fff',
  ...extra,
})

export default function ConsignmentRecipientForm({ value, onChange, isOpen }) {
  const [agents, setAgents] = useState([])
  const [savedContacts, setSavedContacts] = useState([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [loadingContacts, setLoadingContacts] = useState(false)

  const data = value || defaultValue()
  const isAgent = data.recipient_type === 'agent'

  const update = (patch) => onChange({ ...data, ...patch })

  const switchType = (type) => {
    onChange({
      ...defaultValue(),
      recipient_type: type,
      return_date: data.return_date,
    })
  }

  // Fetch agents and saved contacts when form opens
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false

    const fetchAgents = async () => {
      setLoadingAgents(true)
      try {
        const res = await fetch('/api/agents?per_page=200')
        const json = await res.json()
        if (!cancelled) setAgents(json.agents || [])
      } catch { /* non-blocking */ }
      if (!cancelled) setLoadingAgents(false)
    }

    const fetchContacts = async () => {
      setLoadingContacts(true)
      try {
        const res = await fetch('/api/consignment-contacts')
        const json = await res.json()
        if (!cancelled) setSavedContacts(json.contacts || [])
      } catch { /* non-blocking */ }
      if (!cancelled) setLoadingContacts(false)
    }

    fetchAgents()
    fetchContacts()
    return () => { cancelled = true }
  }, [isOpen])

  // Fill form from a saved contact
  const applySavedContact = (contactId) => {
    if (!contactId) {
      update({ contact_id: null, ...EMPTY_CONTACT_FIELDS })
      return
    }
    const contact = savedContacts.find(c => c.id === contactId)
    if (!contact) return
    update({
      contact_id: contact.id,
      recipient_name: contact.full_name || '',
      recipient_company: contact.company || '',
      recipient_phone: contact.phone || '',
      recipient_email: contact.email || '',
      recipient_address: contact.address || '',
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Is this for an agent? ────────────────────────── */}
      <div>
        <div style={{ ...labelStyle, marginBottom: 8 }}>Is this for an agent?</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => switchType('agent')}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: fonts.body,
              border: isAgent ? `2px solid ${colors.inkPlum}` : `1px solid #e3e3e3`,
              background: isAgent ? `${colors.inkPlum}12` : '#fafafa',
              color: isAgent ? colors.inkPlum : '#666',
              transition: 'all .12s',
            }}
          >
            Yes — Agent
          </button>
          <button
            type="button"
            onClick={() => switchType('contact')}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: fonts.body,
              border: !isAgent ? `2px solid ${colors.inkPlum}` : `1px solid #e3e3e3`,
              background: !isAgent ? `${colors.inkPlum}12` : '#fafafa',
              color: !isAgent ? colors.inkPlum : '#666',
              transition: 'all .12s',
            }}
          >
            No — Contact / Person
          </button>
        </div>
      </div>

      {/* ── Agent path ───────────────────────────────────── */}
      {isAgent && (
        <div>
          <label style={labelStyle}>Select agent</label>
          {loadingAgents ? (
            <div style={{ fontSize: 12, color: '#aaa' }}>Loading agents…</div>
          ) : agents.length === 0 ? (
            <div style={{ fontSize: 12, color: '#aaa' }}>No agents found in the system.</div>
          ) : (
            <select
              value={data.agent_id || ''}
              onChange={e => update({ agent_id: e.target.value || null })}
              style={{ ...inputStyle(), cursor: 'pointer' }}
            >
              <option value="">— choose an agent —</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>
                  {a.full_name || a.email}{a.company ? ` (${a.company})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ── Contact path ─────────────────────────────────── */}
      {!isAgent && (
        <>
          {/* Existing contacts quick-fill */}
          <div>
            <label style={labelStyle}>
              {savedContacts.length > 0 ? 'Existing contact (or enter new below)' : 'Recipient details'}
            </label>
            {loadingContacts ? (
              <div style={{ fontSize: 12, color: '#aaa' }}>Loading saved contacts…</div>
            ) : savedContacts.length > 0 ? (
              <select
                value={data.contact_id || ''}
                onChange={e => applySavedContact(e.target.value)}
                style={{ ...inputStyle(), cursor: 'pointer', marginBottom: 12 }}
              >
                <option value="">+ Enter new contact details below</option>
                {savedContacts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}{c.company ? ` — ${c.company}` : ''}{c.email ? ` · ${c.email}` : ''}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {/* Contact detail fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Full name *</label>
              <input
                style={inputStyle()}
                value={data.recipient_name}
                onChange={e => update({ recipient_name: e.target.value, contact_id: null })}
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label style={labelStyle}>Company</label>
              <input
                style={inputStyle()}
                value={data.recipient_company}
                onChange={e => update({ recipient_company: e.target.value, contact_id: null })}
                placeholder="Acme SRL"
              />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input
                style={inputStyle()}
                value={data.recipient_phone}
                onChange={e => update({ recipient_phone: e.target.value, contact_id: null })}
                placeholder="+39 333 000 0000"
              />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                style={inputStyle()}
                value={data.recipient_email}
                onChange={e => update({ recipient_email: e.target.value, contact_id: null })}
                placeholder="jane@example.com"
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Address</label>
            <input
              style={inputStyle()}
              value={data.recipient_address}
              onChange={e => update({ recipient_address: e.target.value, contact_id: null })}
              placeholder="Via Roma 1, Milano"
            />
          </div>

          {/* Save as contact — only shown for new contacts (no contact_id selected) */}
          {!data.contact_id && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
              background: data.saveAsContact ? `${colors.inkPlum}08` : '#f9f9f9',
              border: `1px solid ${data.saveAsContact ? colors.inkPlum + '40' : '#e3e3e3'}`,
              userSelect: 'none',
            }}>
              <input
                type="checkbox"
                checked={data.saveAsContact}
                onChange={e => update({ saveAsContact: e.target.checked })}
                style={{ accentColor: colors.inkPlum, width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.inkPlum }}>Save as contact for future use</div>
                <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>Quick-fill this person next time</div>
              </div>
            </label>
          )}
        </>
      )}

      {/* ── Return date (always shown) ────────────────────── */}
      <div>
        <label style={labelStyle}>Return / expiry date</label>
        <input
          type="date"
          style={{ ...inputStyle(), maxWidth: 200 }}
          value={data.return_date}
          onChange={e => update({ return_date: e.target.value })}
          min={new Date().toISOString().split('T')[0]}
        />
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
          When the goods should be returned or the consignment expires.
        </div>
      </div>

    </div>
  )
}
