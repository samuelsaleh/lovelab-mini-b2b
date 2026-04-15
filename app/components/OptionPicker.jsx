'use client'

import { useState, useCallback } from 'react'
import { colors } from '@/lib/styles'
import { CORD_COLORS } from '@/lib/catalog'
import { isLight } from '@/lib/utils'

const COLOR_SWATCH_BY_NAME = (() => {
  const map = {}
  Object.values(CORD_COLORS || {}).forEach((palette) => {
    if (!Array.isArray(palette)) return
    palette.forEach((entry) => {
      if (!entry?.n || !entry?.h) return
      map[entry.n.toLowerCase()] = entry.h
    })
  })
  return map
})()

function getColorHex(choice) {
  if (!choice) return null
  const hex = COLOR_SWATCH_BY_NAME[String(choice).trim().toLowerCase()]
  return typeof hex === 'string' ? hex : null
}

function isColorOption(opt) {
  const key = String(opt?.key || '').toLowerCase()
  const label = String(opt?.label || '').toLowerCase()
  return key.includes('color') || label.includes('color')
}

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
  const getMultiLimit = useCallback((opt) => {
    const numericMulti = Number(opt?.multi)
    if (Number.isFinite(numericMulti) && numericMulti > 1) return numericMulti
    if (isColorOption(opt)) return Infinity
    return 1
  }, [])

  // selections keyed by option.key -> string (single) or string[] (multi)
  const [selections, setSelections] = useState(() => {
    const init = {}
    for (const opt of options) {
      init[opt.key] = getMultiLimit(opt) > 1 ? [] : null
    }
    return init
  })

  const toggle = useCallback((key, value, limit) => {
    setSelections((prev) => {
      const copy = { ...prev }
      if (limit > 1) {
        // Multi-select: toggle in/out of array
        const arr = Array.isArray(copy[key]) ? [...copy[key]] : []
        const idx = arr.indexOf(value)
        if (idx >= 0) {
          arr.splice(idx, 1)
        } else {
          // Only add if under limit (Infinity means unrestricted)
          if (arr.length < limit) {
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
    const multiLimit = getMultiLimit(opt)
    if (multiLimit > 1) {
      // Unrestricted multi-select (colors): require at least one pick.
      if (!Number.isFinite(multiLimit)) {
        return Array.isArray(val) && val.length > 0
      }
      return Array.isArray(val) && val.length === multiLimit
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
        const multiLimit = getMultiLimit(opt)
        const isMulti = multiLimit > 1
        const currentArr = isMulti ? (Array.isArray(selections[opt.key]) ? selections[opt.key] : []) : null
        const currentSingle = !isMulti ? selections[opt.key] : null
        const isUnrestrictedMulti = isMulti && !Number.isFinite(multiLimit)

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
                  color: isUnrestrictedMulti
                    ? (currentArr.length > 0 ? '#27ae60' : colors.inkPlum)
                    : (currentArr.length === multiLimit ? '#27ae60' : colors.inkPlum),
                  textTransform: 'none',
                  letterSpacing: 0,
                }}>
                  {isUnrestrictedMulti ? `(${currentArr.length} selected)` : `(${currentArr.length}/${multiLimit})`}
                </span>
              )}
            </div>

            {/* Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {opt.choices.map((choice) => {
                const active = isMulti
                  ? currentArr.includes(choice)
                  : currentSingle === choice
                const atLimit = isMulti && Number.isFinite(multiLimit) && currentArr.length >= multiLimit && !active
                const swatchHex = isColorOption(opt) ? getColorHex(choice) : null

                return (
                  <button
                    key={choice}
                    onClick={() => !atLimit && toggle(opt.key, choice, multiLimit)}
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
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: swatchHex ? 6 : 0 }}>
                      {swatchHex && (
                        <span
                          aria-hidden
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: swatchHex,
                            border: isLight(swatchHex) ? '1px solid rgba(0,0,0,.25)' : '1px solid rgba(0,0,0,.08)',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span>{active && '✓ '}{choice}</span>
                    </span>
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
