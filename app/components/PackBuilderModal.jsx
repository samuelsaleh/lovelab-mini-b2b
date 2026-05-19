'use client'

/**
 * PackBuilderModal — capture metadata and save the user's current build as a
 * reusable pack.
 *
 * The user has already configured their order in the Builder (lines/colors/
 * carats/etc.). This modal reads those lines as a snapshot, computes the
 * live total, and lets the user attach a name, a short description, and —
 * for admins — choose a visibility scope before persisting.
 *
 * Hard rules surfaced here:
 *   - Pack minimum is €970. The Save button is disabled below that with the
 *     localised "Pack minimum is €970" message.
 *   - Agents cannot publish global packs. The scope toggle is hidden for
 *     non-admins; the scope is forced to 'private' on submit.
 */

import { useEffect, useMemo, useState } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useI18n } from '@/lib/i18n'
import { fmt } from '@/lib/utils'
import { linesToFormRows, totalForFormRows, MIN_PACK_TOTAL } from '@/lib/packBuild'

export default function PackBuilderModal({
  open,
  onClose,
  lines,
  isAdmin = false,
  onSaved = () => {},
  pricelistYear,
}) {
  const { t } = useI18n()
  const [label, setLabel] = useState('')
  const [descriptionText, setDescriptionText] = useState('')
  const [scope, setScope] = useState('private')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Reset on open so reopening with different lines doesn't keep stale data.
  useEffect(() => {
    if (open) {
      setLabel('')
      setDescriptionText('')
      setScope(isAdmin ? 'global' : 'private')
      setSaving(false)
      setError('')
    }
  }, [open, isAdmin])

  const formRows = useMemo(() => linesToFormRows(lines, { pricelistYear }), [lines, pricelistYear])
  const total = useMemo(() => totalForFormRows(formRows), [formRows])
  const meetsMin = total >= MIN_PACK_TOTAL && formRows.length > 0
  const canSave = !!label.trim() && meetsMin && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      const description = descriptionText
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)

      const res = await fetch('/api/packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          description,
          fixed_total: total,
          form_rows: formRows,
          scope: isAdmin ? scope : 'private',
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Surface the localised minimum-price message if the server enforced
        // the floor (race against client check).
        if (res.status === 422 && /970/.test(data?.error || '')) {
          setError(t('pack.minPriceError'))
        } else {
          setError(data?.error || 'Failed to save pack')
        }
        setSaving(false)
        return
      }

      onSaved(data.pack)
      onClose()
    } catch (err) {
      console.error('[PackBuilderModal] save', err)
      setError('Network error')
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pack-builder-modal-title"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480,
          padding: 22, fontFamily: fonts.body,
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
        }}
      >
        <h2
          id="pack-builder-modal-title"
          style={{ fontSize: 17, fontWeight: 700, color: colors.inkPlum, margin: '0 0 14px' }}
        >
          {t('pack.modalTitle')}
        </h2>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 4, textTransform: 'uppercase' }}>
          {t('pack.namePlaceholder').replace(/\s*\(.*\)\s*$/, '')}
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('pack.namePlaceholder')}
          style={{
            width: '100%', padding: '8px 10px', fontSize: 13,
            border: '1px solid #ddd', borderRadius: 8, marginBottom: 14,
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />

        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 4, textTransform: 'uppercase' }}>
          Description
        </label>
        <textarea
          value={descriptionText}
          onChange={(e) => setDescriptionText(e.target.value)}
          placeholder={t('pack.descriptionPlaceholder')}
          rows={4}
          style={{
            width: '100%', padding: '8px 10px', fontSize: 13,
            border: '1px solid #ddd', borderRadius: 8, marginBottom: 14,
            fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical',
          }}
        />

        {isAdmin && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 6, textTransform: 'uppercase' }}>
              {t('pack.scopeLabel')}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="pack-scope"
                  value="global"
                  checked={scope === 'global'}
                  onChange={() => setScope('global')}
                />
                {t('pack.scopeGlobal')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="pack-scope"
                  value="private"
                  checked={scope === 'private'}
                  onChange={() => setScope('private')}
                />
                {t('pack.scopePrivate')}
              </label>
            </div>
          </div>
        )}

        <div
          data-testid="pack-live-total"
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: meetsMin ? '#f3f0f5' : '#fdf2f0',
            padding: '10px 12px', borderRadius: 8, marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 12, color: '#666' }}>
            {t('pack.liveTotal').replace('{total}', fmt(total))}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: meetsMin ? colors.inkPlum : '#c0392b' }}>
            {meetsMin ? '✓' : `≥ €${MIN_PACK_TOTAL}`}
          </span>
        </div>

        {!meetsMin && formRows.length > 0 && (
          <div
            role="alert"
            style={{ fontSize: 12, color: '#c0392b', marginBottom: 12 }}
          >
            {t('pack.minPriceError')}
          </div>
        )}

        {error && (
          <div role="alert" style={{ fontSize: 12, color: '#c0392b', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            type="button"
            style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid #ddd',
              background: '#fff', color: '#666', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('pack.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            type="button"
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: canSave ? colors.inkPlum : '#cbb',
              color: '#fff', fontSize: 12, fontWeight: 700,
              cursor: canSave ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            {saving ? t('pack.saving') : t('pack.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
