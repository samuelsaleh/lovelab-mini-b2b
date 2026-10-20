'use client'

import { useEffect, useRef, useState } from 'react'
import { colors, fonts } from '@/lib/styles'

const field = {
  border: `1px solid ${colors.lineGray}`,
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 13,
  fontFamily: fonts.body,
  background: '#fff',
}

const miniBtn = {
  flex: 1,
  padding: '6px 8px',
  borderRadius: 6,
  border: `1px solid ${colors.lineGray}`,
  background: '#fff',
  color: colors.inkPlum,
  fontSize: 11,
  fontWeight: 700,
  fontFamily: fonts.body,
  cursor: 'pointer',
}

/**
 * Multi-select dropdown for one diamond dimension (model, carat or shape).
 * Same look as the Agent picker on Reports; also used in the Analytics toolbar.
 *
 * options: [{ value, count }]   selected: string[]
 */
export default function DiamondFilter({
  name, allLabel, options, selected, onChange, format = (v) => v, compact = false,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = selected.length > 0
  const label = !active
    ? allLabel
    : selected.length <= 2
      ? selected.map(format).join(', ')
      : `${selected.length} ${name}`

  const toggle = (v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: compact ? 150 : 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${name}: ${label}`}
        style={{
          ...field,
          padding: compact ? '8px 14px' : field.padding,
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          color: active ? colors.inkPlum : colors.charcoal,
          fontWeight: active ? 700 : 400,
          borderColor: active ? colors.inkPlum : colors.lineGray,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 9, color: '#999' }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
          background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 10, minWidth: 200, width: 'max-content', maxWidth: '90vw',
        }}>
          <div style={{ maxHeight: 240, overflowY: 'auto', margin: '0 -4px' }}>
            {options.length === 0 ? (
              <div style={{ padding: '10px 14px', fontSize: 12, color: '#999' }}>No {name} on these orders.</div>
            ) : options.map((o) => {
              const on = selected.includes(o.value)
              return (
                <label key={o.value} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                  cursor: 'pointer', fontSize: 12.5,
                  color: on ? colors.inkPlum : '#555', fontWeight: on ? 600 : 400,
                }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(o.value)}
                    style={{ accentColor: colors.inkPlum, flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>{format(o.value)}</span>
                  <span style={{ fontSize: 11, color: '#999', fontWeight: 400, paddingLeft: 12 }}>{o.count}</span>
                </label>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, borderTop: `1px solid ${colors.lineGray}`, paddingTop: 8 }}>
            <button type="button" onClick={() => onChange(options.map((o) => o.value))} disabled={options.length === 0} style={miniBtn}>
              Select all
            </button>
            <button type="button" onClick={() => onChange([])} disabled={!active} style={miniBtn}>Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}

export const caratFormat = (c) => `${c} ct`
