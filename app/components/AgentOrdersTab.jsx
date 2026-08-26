'use client'

import { useMemo, useState } from 'react'
import { colors, fonts } from '@/lib/styles'
import { fmtRevenue as fmt } from '@/lib/utils'
import { documentMatchesSearch } from '@/lib/documentSearch'

const th = {
  padding: '9px 12px',
  fontSize: 11,
  fontWeight: 700,
  color: colors.lovelabMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  textAlign: 'left',
  borderBottom: `1px solid ${colors.lineGray}`,
}
const td = {
  padding: '11px 12px',
  fontSize: 13,
  color: colors.charcoal,
  borderBottom: `1px solid ${colors.lineGray}`,
}

function companyOf(doc) {
  return doc.client_company
    || doc.metadata?.formState?.companyName
    || doc.metadata?.formState?.company
    || ''
}

function contactOf(doc) {
  return doc.client_name || doc.metadata?.formState?.contactName || ''
}

function fairOf(doc) {
  return doc.events?.name || doc.event?.name || 'Direct'
}

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AgentOrdersTab({ documents = [] }) {
  const [search, setSearch] = useState('')

  const orders = useMemo(
    () => (documents || []).filter((d) => (
      d.document_type === 'order' && !d.deleted_at && d.status !== 'draft'
    )),
    [documents],
  )

  const visible = useMemo(
    () => orders.filter((d) => documentMatchesSearch(d, search)),
    [orders, search],
  )

  return (
    <div
      data-testid="agent-orders-tab"
      style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}
    >
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.lineGray}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum, marginBottom: 10 }}>
          Orders
        </div>
        <input
          type="search"
          aria-label="Search this agent’s orders"
          placeholder="Search this agent’s orders by company or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%', maxWidth: 480, padding: '10px 14px', borderRadius: 10,
            border: '1px solid #e3e3e3', fontSize: 13, fontFamily: fonts.body,
            background: '#fff', outline: 'none', boxSizing: 'border-box',
          }}
        />
        <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
          {visible.length} {visible.length === 1 ? 'order' : 'orders'}
          {search.trim() ? ' matching your search' : ''}
        </div>
      </div>

      {orders.length === 0 ? (
        <div style={{ padding: 20, fontSize: 13, color: colors.lovelabMuted }}>No orders yet.</div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 20, fontSize: 13, color: colors.lovelabMuted }}>No orders match your search.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr style={{ background: '#faf8fc' }}>
                <th style={th}>Date</th>
                <th style={th}>Company</th>
                <th style={th}>Contact</th>
                <th style={th}>Fair</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {visible.map((doc) => (
                <tr key={doc.id} data-testid={`agent-order-row-${doc.id}`}>
                  <td style={td}>{formatDate(doc.created_at)}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{companyOf(doc) || '—'}</td>
                  <td style={td}>{contactOf(doc) || '—'}</td>
                  <td style={td}>{fairOf(doc)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: colors.inkPlum }}>{fmt(doc.total_amount)}</td>
                  <td style={td}>
                    <a
                      href={`/?reEdit=${doc.id}`}
                      style={{ color: colors.inkPlum, fontWeight: 600, fontSize: 12 }}
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
