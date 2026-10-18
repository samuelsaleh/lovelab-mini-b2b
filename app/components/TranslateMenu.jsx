'use client'

import { useEffect, useRef, useState } from 'react'
import { colors, fonts } from '@/lib/styles'
import { filterLanguages } from '@/lib/doc-translate/languages'

// Admin-only "Translate to…" control for one document. Type to filter the
// languages by first letters, pick one with the mouse or Enter.
export default function TranslateMenu({ file, onTranslate, busy = false }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  const options = filterLanguages(query)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const close = () => { setOpen(false); setQuery(''); setActive(0) }
  const pick = (lang) => { close(); onTranslate?.(file, lang) }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[active]) pick(options[active]) }
    else if (e.key === 'Escape') { close() }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
          border: `1px solid ${colors.inkPlum}`, background: '#fff', color: colors.inkPlum,
          cursor: busy ? 'wait' : 'pointer', fontFamily: fonts.body, opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? 'Translating…' : 'Translate to…'}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 20, width: 200,
            background: '#fff', border: `1px solid ${colors.inkPlum}33`, borderRadius: 8,
            boxShadow: '0 6px 18px rgba(0,0,0,.12)', padding: 6,
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0) }}
            onKeyDown={onKeyDown}
            placeholder="Type a language"
            aria-label="Search languages"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '5px 8px', fontSize: 12,
              border: `1px solid ${colors.inkPlum}33`, borderRadius: 6, outline: 'none', fontFamily: fonts.body,
            }}
          />
          <ul role="listbox" aria-label="Languages" style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, maxHeight: 180, overflowY: 'auto' }}>
            {options.length === 0 && (
              <li style={{ padding: '6px 8px', fontSize: 12, color: colors.lovelabMuted }}>No language</li>
            )}
            {options.map((l, i) => (
              <li
                key={l.code}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); pick(l) }}
                style={{
                  padding: '5px 8px', fontSize: 12, borderRadius: 5, cursor: 'pointer', fontFamily: fonts.body,
                  color: colors.inkPlum, background: i === active ? '#ece4f3' : 'transparent',
                }}
              >
                {l.name} <span style={{ color: colors.lovelabMuted }}>· {l.native}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
