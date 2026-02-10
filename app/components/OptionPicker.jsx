'use client'

import { useState, useCallback } from 'react'
import { colors } from '@/lib/styles'

/**
 * OptionPicker — renders interactive option chips from AI "options" data.
 * Each category has a label and a set of choices the user can tap.
 * Once all required selections are made, a "Send" button appears.
 *
 * Props:
 *  - options: [{ label, key, choices: string[], multi?: number }]
 *  - onSend: (selections: Record<string, string | string[]>) => void
 *  - disabled?: boolean  (true while waiting for AI response)
 */
export default function OptionPicker({ options, onSend, disabled }) {
  // selections keyed by option.key → string (single) or string[] (multi)
  const [selections, setSelections] = useState(() => {
    const init = {}
    for (const opt of options) {
      init[opt.key] = (opt.multi && opt.multi > 1) ? [] : null
    }
    return init
  })

  const toggle = useCallback((key, value, multi) => {
    setSelections((prev) => {
      const copy = { ...prev }
      if (multi && multi > 1) {
        // Multi-select: toggle in/out of array
        const arr = Array.isArray(copy[key]) ? [...copy[key]] : []
        const idx = arr.indexOf(value)
        if (idx >= 0) {
          arr.splice(idx, 1)
        } else {
          // Only add if under limit
          if (arr.length < multi) {
            arr.push(value)
          }
        }
        copy[key] = arr
      } else {
        // Single-select: toggle or pick
        copy[key] = copy[key] === value ? null : value
      }
      return copy
    })
  }, [])

  // Check if all categories have selections
  const allSelected = options.every((opt) => {
    const val = selections[opt.key]
    if (opt.multi && opt.multi > 1) {
      return Array.isArray(val) && val.length === opt.multi
    }
    return val !== null && val !== undefined
  })

  // Build a natural-language message from selections
  const handleSend = useCallback(() => {
    if (!allSelected || disabled) return
    const parts = []
    for (const opt of options) {
      const val = selections[opt.key]
      if (opt.multi && opt.multi > 1 && Array.isArray(val)) {
        parts.push(`${opt.label}: ${val.join(', ')}`)
      } else if (val) {
        parts.push(`${opt.label}: ${val}`)
      }
    }
    onSend(parts.join(' · '))
  }, [allSelected, disabled, options, selections, onSend])

  return (
    <div style={{ marginTop: 10 }}>
      {options.map((opt) => {
        const isMulti = opt.multi && opt.multi > 1
        const currentArr = isMulti ? (Array.isArray(selections[opt.key]) ? selections[opt.key] : []) : null
        const currentSingle = !isMulti ? selections[opt.key] : null

        return (
          <div key={opt.key} style={{ marginBottom: 12 }}>
            {/* Category label */}
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: 5,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              {opt.label}
              {isMulti && (
                <span style={{
                  fontSize: 9,
                  fontWeight: 500,
                  color: currentArr.length === opt.multi ? '#27ae60' : colors.inkPlum,
                  textTransform: 'none',
                  letterSpacing: 0,
                }}>
                  ({currentArr.length}/{opt.multi})
                </span>
              )}
            </div>

            {/* Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {opt.choices.map((choice) => {
                const active = isMulti
                  ? currentArr.includes(choice)
                  : currentSingle === choice
                const atLimit = isMulti && currentArr.length >= opt.multi && !active

                return (
                  <button
                    key={choice}
                    onClick={() => !atLimit && toggle(opt.key, choice, opt.multi)}
                    disabled={disabled}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 18,
                      border: active
                        ? `1.5px solid ${colors.inkPlum}`
                        : '1px solid #e0e0e0',
                      background: active
                        ? `${colors.inkPlum}15`
                        : atLimit
                          ? '#f8f8f8'
                          : '#fff',
                      color: active
                        ? colors.inkPlum
                        : atLimit
                          ? '#ccc'
                          : '#444',
                      fontSize: 11,
                      fontWeight: active ? 700 : 500,
                      cursor: disabled || atLimit ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all .12s',
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    {active && '✓ '}{choice}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={!allSelected || disabled}
        style={{
          width: '100%',
          padding: '10px 16px',
          borderRadius: 10,
          border: 'none',
          background: allSelected && !disabled ? colors.inkPlum : '#e5e5e5',
          color: allSelected && !disabled ? '#fff' : '#999',
          fontSize: 13,
          fontWeight: 700,
          cursor: allSelected && !disabled ? 'pointer' : 'default',
          fontFamily: 'inherit',
          transition: 'all .15s',
          marginTop: 4,
        }}
      >
        {allSelected ? 'Confirm selections ↑' : 'Select all options to continue'}
      </button>
    </div>
  )
}
