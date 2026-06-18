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

import { useEffect, useMemo, useRef, useState } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useI18n } from '@/lib/i18n'
import { fmt } from '@/lib/utils'
import { linesToFormRows, totalForFormRows, summarizeFormRows, MIN_PACK_TOTAL } from '@/lib/packBuild'

export default function PackBuilderModal({
  open,
  onClose,
  lines,
  isAdmin = false,
  onSaved = () => {},
  onUpdated = () => {},
  pricelistYear,
  editingPack = null,
}) {
  const { t } = useI18n()
  const [label, setLabel] = useState('')
  const [descriptionText, setDescriptionText] = useState('')
  const [scope, setScope] = useState('private')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Restricted-scope visibility: the full agent list (admin only) and the
  // currently selected agent ids who may see this pack.
  const [agents, setAgents] = useState([])
  const [selectedAgentIds, setSelectedAgentIds] = useState([])
  const nameRef = useRef(null)
  // Tracks whether the user has hand-edited the description. While false we
  // keep the description in sync with the auto-generated summary so a pack is
  // never saved empty; once the user types we stop touching it.
  const descTouchedRef = useRef(false)

  const isEditing = !!(editingPack && editingPack._dbId)

  // Reset on open. In edit mode we seed the fields from the pack being edited
  // (so the user can tweak its name/description); otherwise start blank.
  useEffect(() => {
    if (open) {
      descTouchedRef.current = false
      if (editingPack && editingPack._dbId) {
        setLabel(editingPack.label || '')
        setDescriptionText(
          Array.isArray(editingPack.description) ? editingPack.description.join('\n') : '',
        )
        const validScopes = ['global', 'private', 'restricted']
        setScope(validScopes.includes(editingPack._scope) ? editingPack._scope : 'private')
        setSelectedAgentIds(Array.isArray(editingPack._agentIds) ? editingPack._agentIds : [])
      } else {
        setLabel('')
        setDescriptionText('')
        setScope(isAdmin ? 'global' : 'private')
        setSelectedAgentIds([])
      }
      setSaving(false)
      setError('')
    }
  }, [open, isAdmin, editingPack])

  // Lazily load the agent list the first time an admin actually picks the
  // "Restricted" scope, so the per-agent checkboxes can be shown. Kept lazy so
  // opening the modal for a normal global/private pack issues no extra request.
  useEffect(() => {
    if (!open || !isAdmin || scope !== 'restricted' || agents.length > 0) return
    let cancelled = false
    fetch('/api/agents')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const list = Array.isArray(data.agents) ? data.agents : []
        setAgents(
          list
            .filter((a) => a && a.id)
            .map((a) => ({ id: a.id, name: a.full_name || a.email || a.id })),
        )
      })
      .catch(() => { /* non-blocking: checkbox list just stays empty */ })
    return () => { cancelled = true }
  }, [open, isAdmin, scope, agents.length])

  function toggleAgent(agentId) {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((x) => x !== agentId) : [...prev, agentId],
    )
  }

  // When editing, focus + select the name so it's obvious it can be renamed
  // right away (this is the field users come here to change).
  useEffect(() => {
    if (open && isEditing && nameRef.current) {
      const id = setTimeout(() => {
        nameRef.current?.focus()
        nameRef.current?.select()
      }, 50)
      return () => clearTimeout(id)
    }
  }, [open, isEditing])

  const formRows = useMemo(() => linesToFormRows(lines, { pricelistYear }), [lines, pricelistYear])
  const total = useMemo(() => totalForFormRows(formRows), [formRows])
  // Auto-generated, human-readable summary of the build: per-collection
  // description bullets + the per-bracelet price range. Used to pre-fill the
  // (editable) description and to set the pack's budget label.
  const summary = useMemo(() => summarizeFormRows(formRows), [formRows])
  const meetsMin = total >= MIN_PACK_TOTAL && formRows.length > 0
  const canSave = !!label.trim() && meetsMin && !saving

  // Pre-fill the description from the auto-summary while the user hasn't
  // hand-edited it and the box is empty. This covers both create mode (blank
  // start) and editing a pack that was saved without a description.
  useEffect(() => {
    if (!open || descTouchedRef.current) return
    setDescriptionText(prev => (prev.trim() ? prev : summary.description.join('\n')))
  }, [open, summary])

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      let description = descriptionText
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
      // Never persist an empty pack: fall back to the auto-generated summary
      // if the user cleared the description.
      if (description.length === 0) description = summary.description

      const payload = {
        label: label.trim(),
        description,
        // Auto price-range so the pack card always shows a budget, recomputed
        // from the current contents.
        budget_label: summary.budgetLabel || null,
        fixed_total: total,
        form_rows: formRows,
        scope: isAdmin ? scope : 'private',
      }

      // Only admins can publish restricted packs; carry the assigned agents.
      if (isAdmin && scope === 'restricted') {
        payload.agent_ids = selectedAgentIds
      }

      // Edit mode → PUT the existing row; create mode → POST a new one.
      const res = isEditing
        ? await fetch(`/api/packs/${editingPack._dbId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/packs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
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

      if (isEditing) {
        onUpdated(data.pack)
      } else {
        onSaved(data.pack)
      }
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
          maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto',
          padding: 22, fontFamily: fonts.body,
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
        }}
      >
        <h2
          id="pack-builder-modal-title"
          style={{ fontSize: 17, fontWeight: 700, color: colors.inkPlum, margin: '0 0 14px' }}
        >
          {isEditing ? t('pack.editTitle') : t('pack.modalTitle')}
        </h2>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 4, textTransform: 'uppercase' }}>
          {t('pack.namePlaceholder').replace(/\s*\(.*\)\s*$/, '')}
        </label>
        <input
          ref={nameRef}
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
          onChange={(e) => { descTouchedRef.current = true; setDescriptionText(e.target.value) }}
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', minHeight: 44 }}>
                <input
                  type="radio"
                  name="pack-scope"
                  value="global"
                  checked={scope === 'global'}
                  onChange={() => setScope('global')}
                />
                {t('pack.scopeGlobal')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', minHeight: 44 }}>
                <input
                  type="radio"
                  name="pack-scope"
                  value="private"
                  checked={scope === 'private'}
                  onChange={() => setScope('private')}
                />
                {t('pack.scopePrivate')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', minHeight: 44 }}>
                <input
                  type="radio"
                  name="pack-scope"
                  value="restricted"
                  checked={scope === 'restricted'}
                  onChange={() => setScope('restricted')}
                />
                {t('pack.scopeRestricted')}
              </label>
            </div>

            {scope === 'restricted' && (
              <div data-testid="pack-agent-list" style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 6, textTransform: 'uppercase' }}>
                  {t('pack.visibleTo')}
                </div>
                {agents.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#888' }}>{t('pack.noAgents')}</div>
                ) : (
                  <div
                    style={{
                      maxHeight: 160, overflowY: 'auto', border: '1px solid #eee',
                      borderRadius: 8, padding: '6px 10px', display: 'flex',
                      flexDirection: 'column', gap: 4,
                    }}
                  >
                    {agents.map((a) => (
                      <label
                        key={a.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedAgentIds.includes(a.id)}
                          onChange={() => toggleAgent(a.id)}
                        />
                        {a.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12, color: '#666' }}>
              {t('pack.liveTotal').replace('{total}', fmt(total))}
            </span>
            {summary.budgetLabel && (
              <span data-testid="pack-budget-range" style={{ fontSize: 11, color: '#888' }}>
                {summary.budgetLabel}
              </span>
            )}
          </div>
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
              padding: '11px 16px', minHeight: 44, borderRadius: 8, border: '1px solid #ddd',
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
              padding: '11px 18px', minHeight: 44, borderRadius: 8, border: 'none',
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
