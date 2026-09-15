'use client'

/**
 * Duplicate an order (Sam, 15 Sep 2026).
 *
 * "Copy" always reopened the order for the same boutique, which is a restock —
 * useful, but not what it is usually wanted for. Duplicate now asks who the
 * new order is for: another shop (the common case, so it is the default and
 * the field is focused), or the same one again.
 *
 * The cart comes along either way. For another shop the old one's address,
 * VAT, delivery and negotiated prices do not — they would be wrong on someone
 * else's order. Picking a boutique from the directory fills those in from
 * their own record; typing a name leaves them to fill in on the form.
 *
 * Anyone who can see the order can do this, agents included: nothing is
 * written until the new order is saved.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useI18n } from '@/lib/i18n'
import { clientRowToFormFields } from '@/lib/clientGatePersistence'

export default function DuplicateOrderModal({ doc, onCancel, onConfirm }) {
  const { t } = useI18n()
  const [mode, setMode] = useState('new')
  const [search, setSearch] = useState('')
  const [contactName, setContactName] = useState('')
  const [picked, setPicked] = useState(null)
  const [matches, setMatches] = useState([])
  const [searching, setSearching] = useState(false)
  const [keepFair, setKeepFair] = useState(true)
  const searchRef = useRef(null)

  const formState = doc?.metadata?.formState || {}
  const fairName = formState.eventName || doc?.events?.name || ''

  useEffect(() => {
    if (mode === 'new') searchRef.current?.focus()
  }, [mode])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Look the typed name up in the shared client directory. Free text is fine
  // too — a boutique that is not in there yet is created when the order saves.
  const term = picked ? '' : search.trim()
  useEffect(() => {
    if (mode !== 'new' || term.length < 2) { setMatches([]); return }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients?search=${encodeURIComponent(term)}`)
        const data = await res.json().catch(() => ({}))
        if (!cancelled) setMatches(res.ok ? (data.clients || []).slice(0, 5) : [])
      } catch {
        if (!cancelled) setMatches([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [term, mode])

  const pick = useCallback((row) => {
    setPicked(row)
    setSearch(row.company || '')
    if (row.name) setContactName(row.name)
    setMatches([])
  }, [])

  if (!doc) return null

  const sourceName = doc.client_company || doc.client_name || formState.companyName || '—'
  const lineCount = Array.isArray(formState.rows)
    ? formState.rows.filter((r) => r && (r.collection || r.quantity)).length
    : 0
  const typedName = search.trim()
  const ready = mode === 'same' || typedName.length > 0

  const submit = (e) => {
    e?.preventDefault?.()
    if (!ready) return
    if (mode === 'same') {
      onConfirm({ mode: 'same', keepFair })
      return
    }
    const fields = picked && picked.company === typedName
      ? { ...clientRowToFormFields(picked), contactName: contactName.trim() || picked.name || '' }
      : { companyName: typedName, contactName: contactName.trim() }
    onConfirm({ mode: 'new', clientFields: fields, client: picked || null, keepFair })
  }

  const choice = (id, label, hint) => {
    const active = mode === id
    return (
      <button
        key={id}
        type="button"
        data-testid={`duplicate-mode-${id}`}
        aria-pressed={active}
        onClick={() => setMode(id)}
        style={{
          flex: '1 1 180px', textAlign: 'left', padding: '11px 13px', borderRadius: 10,
          border: `1.5px solid ${active ? colors.inkPlum : colors.lineGray}`,
          background: active ? '#f8f0fa' : '#fff', cursor: 'pointer', fontFamily: fonts.body,
        }}
      >
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: active ? colors.inkPlum : colors.charcoal }}>{label}</span>
        <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: colors.lovelabMuted, lineHeight: 1.35 }}>{hint}</span>
      </button>
    )
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${colors.lineGray}`,
    fontFamily: fonts.body, fontSize: 15, boxSizing: 'border-box',
  }
  const labelStyle = { display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 600, color: colors.inkPlum }

  return (
    <div
      className="fa-modal-overlay"
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={t('docs.duplicateTitle')}
        data-testid="duplicate-order-modal"
        style={{ background: '#fff', width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto', borderRadius: 14, padding: 20, fontFamily: fonts.body, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: colors.inkPlum }}>{t('docs.duplicateTitle')}</h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: colors.lovelabMuted, lineHeight: 1.45 }}>
          {lineCount > 0
            ? t('docs.duplicateFrom', { count: lineCount, company: sourceName })
            : t('docs.duplicateFromNoLines', { company: sourceName })}
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {choice('new', t('docs.duplicateForNew'), t('docs.duplicateForNewHint'))}
          {choice('same', t('docs.duplicateSame'), t('docs.duplicateSameHint', { company: sourceName }))}
        </div>

        {mode === 'new' ? (
          <>
            <label style={{ display: 'block', marginBottom: 12, position: 'relative' }}>
              <span style={labelStyle}>{t('docs.duplicateCompany')}</span>
              <input
                ref={searchRef}
                value={search}
                data-testid="duplicate-company"
                autoComplete="off"
                placeholder={t('docs.duplicateCompanyPlaceholder')}
                onChange={(e) => { setSearch(e.target.value); setPicked(null) }}
                style={inputStyle}
              />
              {searching && <span style={{ position: 'absolute', right: 10, top: 34, fontSize: 11, color: colors.lovelabMuted }}>…</span>}
              {matches.length > 0 && (
                <ul data-testid="duplicate-matches" style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, border: `1px solid ${colors.lineGray}`, borderRadius: 8, overflow: 'hidden' }}>
                  {matches.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => pick(row)}
                        style={{ width: '100%', textAlign: 'left', padding: '8px 11px', border: 'none', borderTop: `1px solid ${colors.lineGray}`, background: '#fff', cursor: 'pointer', fontFamily: fonts.body, fontSize: 13 }}
                      >
                        <span style={{ fontWeight: 700, color: colors.charcoal }}>{row.company}</span>
                        {(row.name || row.country) && (
                          <span style={{ color: colors.lovelabMuted }}> · {[row.name, row.country].filter(Boolean).join(' · ')}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {picked && (
                <span data-testid="duplicate-picked" style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#166534' }}>
                  {t('docs.duplicatePicked')}
                </span>
              )}
            </label>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={labelStyle}>{t('docs.duplicateContact')}</span>
              <input
                value={contactName}
                data-testid="duplicate-contact"
                onChange={(e) => setContactName(e.target.value)}
                style={inputStyle}
              />
            </label>

            <p style={{ margin: '0 0 14px', fontSize: 12, color: colors.lovelabMuted, lineHeight: 1.45 }}>
              {picked ? t('docs.duplicatePickedNote') : t('docs.duplicateNewNote')}
            </p>
          </>
        ) : (
          <p style={{ margin: '0 0 14px', fontSize: 12, color: colors.lovelabMuted, lineHeight: 1.45 }}>
            {t('docs.duplicateSameNote')}
          </p>
        )}

        {fairName && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: colors.charcoal }}>
            <input
              type="checkbox"
              checked={keepFair}
              data-testid="duplicate-keep-fair"
              onChange={(e) => setKeepFair(e.target.checked)}
              style={{ accentColor: colors.inkPlum, cursor: 'pointer' }}
            />
            {t('docs.duplicateKeepFair', { fair: fairName })}
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.lineGray}`, background: '#fff', color: colors.charcoal, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={!ready}
            data-testid="duplicate-confirm"
            style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: ready ? colors.inkPlum : '#e7e1ea', color: ready ? '#fff' : '#6b5b71', fontSize: 13, fontWeight: 700, cursor: ready ? 'pointer' : 'not-allowed', fontFamily: fonts.body }}
          >
            {t('docs.duplicateGo')}
          </button>
        </div>
      </form>
    </div>
  )
}
