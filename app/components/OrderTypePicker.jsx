'use client'

import { useEffect } from 'react'
import { colors, fonts } from '@/lib/styles'
import { ORDER_TYPES } from '@/lib/orderTypes'

/**
 * OrderTypePicker — modal overlay to choose the type of new order.
 *
 * Props:
 *   onSelect(type)     — called with an order channel id
 *   onClose()          — called when dismissed without selection
 *   allowedTypes       — optional list of type ids to show (defaults to all ORDER_TYPES)
 */
export default function OrderTypePicker({ onSelect, onClose, allowedTypes = null }) {
  const types = allowedTypes
    ? ORDER_TYPES.filter((t) => allowedTypes.includes(t.id))
    : ORDER_TYPES
  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16,
          padding: 28, width: '100%', maxWidth: 480,
          maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto',
          boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
          fontFamily: fonts.body,
        }}
      >
        <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: colors.inkPlum }}>
          Create New Order
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#888' }}>
          Choose the type of order you want to create.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {types.map((type) => (
            <button
              key={type.id}
              onClick={() => onSelect(type.id)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                padding: '14px 16px', borderRadius: 12, border: `1.5px solid ${colors.lineGray}`,
                background: '#faf8fc', cursor: 'pointer', textAlign: 'left',
                fontFamily: fonts.body, transition: 'border-color .12s, background .12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = colors.inkPlum
                e.currentTarget.style.background = `${colors.inkPlum}08`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = colors.lineGray
                e.currentTarget.style.background = '#faf8fc'
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{type.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: colors.inkPlum, marginBottom: 2 }}>
                  {type.label}
                </div>
                <div style={{ fontSize: 12, color: '#777', lineHeight: 1.4 }}>
                  {type.description}
                </div>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 18, width: '100%', padding: '12px 0', minHeight: 44,
            borderRadius: 8, border: `1px solid ${colors.lineGray}`,
            background: '#fff', color: '#888', fontSize: 13,
            cursor: 'pointer', fontFamily: fonts.body,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
