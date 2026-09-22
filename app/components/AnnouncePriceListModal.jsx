'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useI18n } from '@/lib/i18n'
import { useIsMobile } from '@/lib/useIsMobile'
import { PRICE_LIST_FILES } from '@/lib/b2b-files'
import { COLLECTIONS, getProductType } from '@/lib/catalog'
import { AGENT_LANGUAGES, AGENT_LANGUAGE_LABELS, isAgentLanguage } from '@/lib/agents/language'
import { priceListAnnouncementEmail, firstNameOf, MAX_NOTE_LENGTH } from '@/lib/priceListAnnouncement'
import ConfirmDialog from './ConfirmDialog'

const MAX_SEND_PASSES = 20

const EMPTY_TRANSLATIONS = {}

/**
 * Announce a new price list to every agent, in their own language.
 *
 * Three steps: compose (PDF, collections, note, who receives it), review
 * the translations (one editable tab per language that has recipients plus
 * English, which every agent also gets as a second version; live preview;
 * test copy), send (confirm, progress, results, retry the failures).
 * Nothing is sent until every language in play has a text.
 */
export default function AnnouncePriceListModal({ open, onClose }) {
  const { t, lang: appLang } = useI18n()
  const mobile = useIsMobile()
  const defaultSourceLang = isAgentLanguage(appLang) ? appLang : 'en'
  const defaultFile = PRICE_LIST_FILES[PRICE_LIST_FILES.length - 1]?.path || ''

  const [step, setStep] = useState(1)
  const [filePath, setFilePath] = useState(defaultFile)
  const [collectionIds, setCollectionIds] = useState(() => new Set())
  const [allCollections, setAllCollections] = useState(false)
  const [note, setNote] = useState('')
  const [sourceLang, setSourceLang] = useState(defaultSourceLang)

  const [recipients, setRecipients] = useState(null)
  const [recipientsError, setRecipientsError] = useState(null)
  // Agents the admin has unticked for this send. Everyone is in by default.
  const [excluded, setExcluded] = useState(() => new Set())
  const [showRecipients, setShowRecipients] = useState(false)
  const [savingLangFor, setSavingLangFor] = useState(null)
  const [langError, setLangError] = useState(null)

  // translations[lang] = { status: 'pending' | 'done' | 'refused' | 'manual', verified, error }
  const [translations, setTranslations] = useState(EMPTY_TRANSLATIONS)
  // texts[lang] = what will be sent (translation or admin edit)
  const [texts, setTexts] = useState({})
  const [activeLang, setActiveLang] = useState(null)
  const [showPreview, setShowPreview] = useState(!mobile)

  const [testState, setTestState] = useState(null) // { status: 'sending' | 'sent' | 'error', to?, error? }
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(null) // { done, total }
  const [results, setResults] = useState([])
  const [sendError, setSendError] = useState(null)

  const reset = useCallback(() => {
    setStep(1)
    setFilePath(defaultFile)
    setCollectionIds(new Set())
    setAllCollections(false)
    setNote('')
    setSourceLang(defaultSourceLang)
    setRecipients(null)
    setRecipientsError(null)
    setExcluded(new Set())
    setShowRecipients(false)
    setSavingLangFor(null)
    setLangError(null)
    setTranslations(EMPTY_TRANSLATIONS)
    setTexts({})
    setActiveLang(null)
    setTestState(null)
    setConfirmOpen(false)
    setSending(null)
    setResults([])
    setSendError(null)
  }, [defaultFile, defaultSourceLang])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  // Who will get it — fetched as soon as the modal opens so the counts sit
  // next to the form while the admin writes, and again after a language
  // change so the list always shows what the profile says.
  const loadRecipients = useCallback(async () => {
    setRecipientsError(null)
    try {
      const res = await fetch('/api/price-lists/announce/recipients')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setRecipients(data)
      return data
    } catch (err) {
      setRecipientsError(err?.message || 'error')
      return null
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    loadRecipients().then(() => { if (cancelled) return })
    return () => { cancelled = true }
  }, [open, loadRecipients])

  const file = useMemo(() => PRICE_LIST_FILES.find((f) => f.path === filePath) || null, [filePath])

  const { bracelets, necklaces } = useMemo(() => {
    const b = []
    const n = []
    for (const c of COLLECTIONS) (getProductType(c) === 'necklace' ? n : b).push(c)
    return { bracelets: b, necklaces: n }
  }, [])

  const collectionLabels = useMemo(
    () => COLLECTIONS.filter((c) => collectionIds.has(c.id)).map((c) => c.label),
    [collectionIds],
  )

  // Every eligible agent, grouped by language, and the included subset.
  const allByLanguage = recipients?.byLanguage || {}
  const totalRecipients = recipients?.total || 0
  const includedByLanguage = useMemo(() => {
    const out = {}
    for (const lang of AGENT_LANGUAGES) {
      const list = (allByLanguage[lang] || []).filter((r) => !excluded.has(r.id))
      if (list.length) out[lang] = list
    }
    return out
  }, [allByLanguage, excluded])
  const includedCount = Object.values(includedByLanguage).reduce((n, list) => n + list.length, 0)

  // Languages that have someone to write to, in a stable order; plus
  // English, which every agent receives as a second version.
  const neededLangs = useMemo(() => AGENT_LANGUAGES.filter((l) => (includedByLanguage[l] || []).length > 0), [includedByLanguage])
  const translationLangs = useMemo(() => AGENT_LANGUAGES.filter((l) => l === 'en' || neededLangs.includes(l)), [neededLangs])

  const canCompose = !!file && (allCollections || collectionIds.size > 0) && note.trim().length > 0 && includedCount > 0

  const toggleCollection = (id) => {
    setCollectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const setGroup = (group, on) => {
    setCollectionIds((prev) => {
      const next = new Set(prev)
      for (const c of group) (on ? next.add(c.id) : next.delete(c.id))
      return next
    })
  }

  const toggleRecipient = (id) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const setLanguageIncluded = (lang, on) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      for (const r of allByLanguage[lang] || []) (on ? next.delete(r.id) : next.add(r.id))
      return next
    })
  }

  // A language change is saved to the agent's profile, not kept for this
  // send only: the next announcement must not repeat the mistake.
  const saveAgentLanguage = async (id, code) => {
    setSavingLangFor(id)
    setLangError(null)
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_language: code || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      await loadRecipients()
    } catch (err) {
      setLangError(t('announce.languageSaveFailed', { reason: err?.message || 'error' }))
    } finally {
      setSavingLangFor(null)
    }
  }

  // ── Step 2: translations ──────────────────────────────────────────────
  const translateOne = useCallback(async (target, source, text) => {
    setTranslations((prev) => ({ ...prev, [target]: { status: 'pending' } }))
    try {
      const res = await fetch('/api/price-lists/announce/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: text, sourceLang: source, targetLang: target, collectionIds: [...collectionIds] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setTexts((prev) => ({ ...prev, [target]: data.text || '' }))
      setTranslations((prev) => ({ ...prev, [target]: { status: 'done', verified: data.verified !== false } }))
    } catch (err) {
      setTranslations((prev) => ({ ...prev, [target]: { status: 'refused', error: err?.message || 'error' } }))
    }
  }, [collectionIds])

  const goToTranslate = () => {
    const source = note.trim()
    setTexts({ [sourceLang]: source })
    setTranslations({ [sourceLang]: { status: 'done', verified: true } })
    setActiveLang(translationLangs.includes(sourceLang) ? sourceLang : (translationLangs[0] || 'en'))
    setStep(2)
    for (const target of translationLangs) {
      if (target === sourceLang) continue
      translateOne(target, sourceLang, source)
    }
  }

  const missingLangs = translationLangs.filter((l) => !(texts[l] || '').trim())
  const readyToSend = neededLangs.length > 0 && missingLangs.length === 0

  const previewHtml = useMemo(() => {
    if (!activeLang || !file) return ''
    const siteUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const sample = includedByLanguage[activeLang]?.[0]
    const { html } = priceListAnnouncementEmail({
      lang: activeLang,
      firstName: firstNameOf(sample?.name || ''),
      note: texts[activeLang] || '',
      englishNote: texts.en || '',
      collectionLabels,
      allCollections,
      fileName: file.name,
    }, siteUrl)
    return html
  }, [activeLang, file, texts, collectionLabels, allCollections, includedByLanguage])

  const previewSubject = useMemo(() => {
    if (!activeLang || !file) return ''
    return priceListAnnouncementEmail({
      lang: activeLang, note: '', collectionLabels, allCollections, fileName: file.name,
    }, '').subject
  }, [activeLang, file, collectionLabels, allCollections])

  const sendPayloadBase = () => ({
    filePath,
    collectionIds: allCollections ? [] : [...collectionIds],
    allCollections,
    notes: Object.fromEntries(translationLangs.filter((l) => (texts[l] || '').trim()).map((l) => [l, texts[l].trim()])),
  })

  const sendTestCopy = async () => {
    setTestState({ status: 'sending' })
    try {
      const res = await fetch('/api/price-lists/announce/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sendPayloadBase(), testToSelf: true, testLang: activeLang }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setTestState({ status: 'sent', to: data.to })
    } catch (err) {
      setTestState({ status: 'error', error: err?.message || 'error' })
    }
  }

  // ── Step 3: send ──────────────────────────────────────────────────────
  const runSend = async (ids) => {
    setSendError(null)
    setStep(3)
    setSending({ done: 0, total: ids.length })
    let remaining = ids
    let done = 0
    const base = sendPayloadBase()
    try {
      for (let pass = 0; pass < MAX_SEND_PASSES && remaining.length > 0; pass += 1) {
        const res = await fetch('/api/price-lists/announce/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...base, recipientIds: remaining }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
        done += (data.results || []).length
        remaining = Array.isArray(data.remaining) ? data.remaining : []
        setSending({ done, total: ids.length })
        setResults((prev) => mergeResults(prev, data.results || []))
      }
      if (remaining.length > 0) {
        setSendError(`${remaining.length} agents were not attempted — use "retry".`)
        setResults((prev) => mergeResults(prev, remaining.map((id) => ({ id, status: 'failed', reason: 'not_attempted' }))))
      }
    } catch (err) {
      setSendError(err?.message || 'error')
    } finally {
      setSending(null)
    }
  }

  const allRecipientIds = () => {
    const ids = []
    for (const l of neededLangs) {
      if (!(texts[l] || '').trim()) continue
      for (const r of includedByLanguage[l] || []) ids.push(r.id)
    }
    return ids
  }

  const failedIds = results.filter((r) => r.status === 'failed').map((r) => r.id)
  const sentCount = results.filter((r) => r.status === 'sent').length
  const failedCount = failedIds.length
  const skippedCount = results.filter((r) => r.status === 'skipped').length
  const busy = !!sending || testState?.status === 'sending'

  if (!open) return null

  const modalMaxWidth = mobile ? '100%' : (step === 2 && showPreview ? 980 : 640)

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose?.() }}
      role="dialog"
      aria-modal="true"
      aria-label={t('announce.title')}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center',
        padding: mobile ? 0 : 16, fontFamily: fonts.body,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: mobile ? '14px 14px 0 0' : 14,
        width: '100%', maxWidth: modalMaxWidth,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '92vh', overflow: 'hidden',
        transition: 'max-width .15s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: `1px solid ${colors.lineGray}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: colors.inkPlum }}>{t('announce.title')}</div>
            <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 2 }}>{t('announce.subtitle')}</div>
          </div>
          <button
            onClick={() => !busy && onClose?.()}
            disabled={busy}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', fontSize: 22, color: colors.textLight, padding: 4, lineHeight: 1 }}
          >×</button>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 22px 0', flexWrap: 'wrap' }}>
          {[t('announce.stepCompose'), t('announce.stepTranslate'), t('announce.stepSend')].map((label, i) => {
            const n = i + 1
            const active = n === step
            const past = n < step
            return (
              <div key={label} style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                background: active ? colors.inkPlum : (past ? '#ecfdf5' : '#f3f1f5'),
                color: active ? '#fff' : (past ? colors.success : colors.lovelabMuted),
              }}>{n}. {label}</div>
            )
          })}
        </div>

        {/* Body */}
        <div style={{ padding: '16px 22px', overflowY: 'auto', flex: 1 }}>
          {step === 1 && (
            <ComposeStep
              t={t}
              mobile={mobile}
              filePath={filePath}
              setFilePath={setFilePath}
              bracelets={bracelets}
              necklaces={necklaces}
              collectionIds={collectionIds}
              toggleCollection={toggleCollection}
              setGroup={setGroup}
              allCollections={allCollections}
              setAllCollections={setAllCollections}
              note={note}
              setNote={setNote}
              sourceLang={sourceLang}
              setSourceLang={setSourceLang}
              recipients={recipients}
              recipientsError={recipientsError}
              allByLanguage={allByLanguage}
              includedByLanguage={includedByLanguage}
              includedCount={includedCount}
              totalRecipients={totalRecipients}
              excluded={excluded}
              toggleRecipient={toggleRecipient}
              setLanguageIncluded={setLanguageIncluded}
              showRecipients={showRecipients}
              setShowRecipients={setShowRecipients}
              saveAgentLanguage={saveAgentLanguage}
              savingLangFor={savingLangFor}
              langError={langError}
            />
          )}

          {step === 2 && (
            <TranslateStep
              t={t}
              mobile={mobile}
              translationLangs={translationLangs}
              neededLangs={neededLangs}
              activeLang={activeLang}
              setActiveLang={setActiveLang}
              translations={translations}
              texts={texts}
              setTexts={setTexts}
              setTranslations={setTranslations}
              includedByLanguage={includedByLanguage}
              sourceLang={sourceLang}
              note={note}
              translateOne={translateOne}
              showPreview={showPreview}
              setShowPreview={setShowPreview}
              previewHtml={previewHtml}
              previewSubject={previewSubject}
              testState={testState}
              sendTestCopy={sendTestCopy}
              missingLangs={missingLangs}
              onEditRecipients={() => { setShowRecipients(true); setStep(1) }}
            />
          )}

          {step === 3 && (
            <SendStep
              t={t}
              sending={sending}
              results={results}
              sendError={sendError}
              sentCount={sentCount}
              failedCount={failedCount}
              skippedCount={skippedCount}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px', borderTop: `1px solid ${colors.lineGray}`,
          display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
        }}>
          <div>
            {step === 2 && (
              <button type="button" onClick={() => setStep(1)} disabled={busy} style={secondaryBtn(busy)}>
                ← {t('announce.back')}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {step !== 3 && (
              <button type="button" onClick={() => !busy && onClose?.()} disabled={busy} style={secondaryBtn(busy)}>
                {t('common.cancel')}
              </button>
            )}
            {step === 1 && (
              <button type="button" onClick={goToTranslate} disabled={!canCompose} style={primaryBtn(!canCompose)}>
                {t('announce.next')}
              </button>
            )}
            {step === 2 && (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={!readyToSend || busy}
                title={!readyToSend ? t('announce.missingText') : undefined}
                style={primaryBtn(!readyToSend || busy)}
              >
                {t('announce.send', { count: allRecipientIds().length })}
              </button>
            )}
            {step === 3 && !sending && failedCount > 0 && (
              <button type="button" onClick={() => runSend(failedIds)} style={secondaryBtn(false)}>
                {t('announce.retryFailed', { count: failedCount })}
              </button>
            )}
            {step === 3 && (
              <button type="button" onClick={() => !sending && onClose?.()} disabled={!!sending} style={primaryBtn(!!sending)}>
                {t('announce.close')}
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        variant="info"
        title={t('announce.confirmTitle')}
        message={t('announce.confirmMessage', {
          count: allRecipientIds().length,
          languages: neededLangs.filter((l) => (texts[l] || '').trim()).length,
          file: file?.name || '',
        })}
        confirmLabel={t('announce.confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); runSend(allRecipientIds()) }}
      />
    </div>
  )
}

function mergeResults(prev, incoming) {
  const byId = new Map(prev.map((r) => [r.id, r]))
  for (const r of incoming) byId.set(r.id, { ...(byId.get(r.id) || {}), ...r })
  return [...byId.values()]
}

// ── Step 1 ────────────────────────────────────────────────────────────────
function ComposeStep({
  t, mobile, filePath, setFilePath, bracelets, necklaces, collectionIds, toggleCollection, setGroup,
  allCollections, setAllCollections, note, setNote, sourceLang, setSourceLang, recipients, recipientsError,
  allByLanguage, includedByLanguage, includedCount, totalRecipients, excluded, toggleRecipient, setLanguageIncluded,
  showRecipients, setShowRecipients, saveAgentLanguage, savingLangFor, langError,
}) {
  const chips = AGENT_LANGUAGES.filter((l) => includedByLanguage[l]).map((l) => `${includedByLanguage[l].length} ${AGENT_LANGUAGE_LABELS[l]}`)

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{t('announce.pickFile')}</label>
        <div style={{ border: `1px solid ${colors.lineGray}`, borderRadius: 8, overflow: 'hidden' }}>
          {PRICE_LIST_FILES.map((f, i) => (
            <label key={f.path} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer',
              borderTop: i === 0 ? 'none' : `1px solid ${colors.lineGray}`,
              background: filePath === f.path ? '#faf8fc' : '#fff', fontSize: 13, color: colors.text,
            }}>
              <input type="radio" name="price-list-file" value={f.path} checked={filePath === f.path} onChange={() => setFilePath(f.path)} />
              {f.name}
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <label style={labelStyle}>{t('announce.collections')}</label>
          <label style={{ fontSize: 12, color: colors.inkPlum, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={allCollections} onChange={(e) => setAllCollections(e.target.checked)} />
            {t('announce.allCollections')}
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 12, opacity: allCollections ? 0.45 : 1 }}>
          {[[t('announce.bracelets'), bracelets], [t('announce.necklaces'), necklaces]].map(([title, group]) => (
            <div key={title} style={{ border: `1px solid ${colors.lineGray}`, borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
                <span style={{ fontSize: 11 }}>
                  <button type="button" disabled={allCollections} onClick={() => setGroup(group, true)} style={linkBtn}>{t('announce.selectAll')}</button>
                  {' · '}
                  <button type="button" disabled={allCollections} onClick={() => setGroup(group, false)} style={linkBtn}>{t('announce.clear')}</button>
                </span>
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {group.map((c) => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 0', cursor: allCollections ? 'default' : 'pointer', color: colors.text }}>
                    <input type="checkbox" disabled={allCollections} checked={collectionIds.has(c.id)} onChange={() => toggleCollection(c.id)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '2fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>{t('announce.note')}</label>
          <textarea
            value={note}
            maxLength={MAX_NOTE_LENGTH}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('announce.notePlaceholder')}
            rows={5}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 110, lineHeight: 1.45 }}
          />
          <div style={{ fontSize: 10, color: colors.lovelabMuted, textAlign: 'right', marginTop: 2 }}>{note.length} / {MAX_NOTE_LENGTH}</div>
        </div>
        <div>
          <label style={labelStyle}>{t('announce.noteLanguage')}</label>
          <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            {AGENT_LANGUAGES.map((l) => <option key={l} value={l}>{AGENT_LANGUAGE_LABELS[l]}</option>)}
          </select>
          <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 6, lineHeight: 1.4 }}>{t('announce.englishAlways')}</div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: colors.text, padding: '10px 12px', borderRadius: 8, background: '#f7f5fb', border: `1px solid ${colors.lineGray}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ ...labelStyle, marginBottom: 0 }}>
            {t('announce.recipients')}
            {recipients && totalRecipients > 0 && (
              <span style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
                {t('announce.selectedCount', { selected: includedCount, total: totalRecipients })}
              </span>
            )}
          </div>
          {recipients && totalRecipients > 0 && (
            <button type="button" onClick={() => setShowRecipients((s) => !s)} style={linkBtn}>
              {showRecipients ? `▾ ${t('announce.hideRecipients')}` : `▸ ${t('announce.editRecipients')}`}
            </button>
          )}
        </div>
        {recipientsError && <div style={{ color: colors.danger }}>{recipientsError}</div>}
        {!recipients && !recipientsError && <div style={{ color: colors.lovelabMuted }}>{t('announce.recipientsLoading')}</div>}
        {recipients && totalRecipients === 0 && <div style={{ color: colors.danger }}>{t('announce.recipientsNone')}</div>}
        {recipients && totalRecipients > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {chips.map((c) => (
              <span key={c} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: '#fff', border: `1px solid ${colors.lineGray}`, color: colors.inkPlum }}>{c}</span>
            ))}
            {includedCount === 0 && <span style={{ fontSize: 11, color: colors.danger }}>{t('announce.recipientsNoneSelected')}</span>}
          </div>
        )}
        {recipients?.fallbackToEnglish > 0 && (
          <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 6 }}>{t('announce.fallbackEnglish', { count: recipients.fallbackToEnglish })}</div>
        )}
        {recipients?.missingEmail?.length > 0 && (
          <div style={{ fontSize: 11, color: colors.danger, marginTop: 4 }}>{t('announce.missingEmail', { count: recipients.missingEmail.length })}</div>
        )}

        {showRecipients && recipients && totalRecipients > 0 && (
          <RecipientsEditor
            t={t}
            mobile={mobile}
            allByLanguage={allByLanguage}
            excluded={excluded}
            toggleRecipient={toggleRecipient}
            setLanguageIncluded={setLanguageIncluded}
            saveAgentLanguage={saveAgentLanguage}
            savingLangFor={savingLangFor}
            langError={langError}
          />
        )}
      </div>
    </>
  )
}

function RecipientsEditor({ t, mobile, allByLanguage, excluded, toggleRecipient, setLanguageIncluded, saveAgentLanguage, savingLangFor, langError }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = (r) => !q || String(r.name || '').toLowerCase().includes(q) || String(r.email || '').toLowerCase().includes(q)
  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${colors.lineGray}`, paddingTop: 8 }} data-testid="recipients-editor">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('announce.searchAgents')}
        aria-label={t('announce.searchAgents')}
        style={{ ...inputStyle, padding: '6px 10px', fontSize: 12, marginBottom: 8 }}
      />
      {langError && <div style={{ fontSize: 11, color: colors.danger, marginBottom: 6 }}>{langError}</div>}
      {AGENT_LANGUAGES.filter((l) => (allByLanguage[l] || []).some(matches)).map((lang) => {
        const list = allByLanguage[lang]
        const on = list.filter((r) => !excluded.has(r.id)).length
        return (
          <div key={lang} style={{ marginBottom: 8 }} data-testid={`recipients-${lang}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {AGENT_LANGUAGE_LABELS[lang]} <span style={{ fontWeight: 500, color: colors.lovelabMuted }}>{on}/{list.length}</span>
              </span>
              <span style={{ fontSize: 11 }}>
                <button type="button" onClick={() => setLanguageIncluded(lang, true)} style={linkBtn}>{t('announce.includeAll')}</button>
                {' · '}
                <button type="button" onClick={() => setLanguageIncluded(lang, false)} style={linkBtn}>{t('announce.excludeAll')}</button>
              </span>
            </div>
            {list.filter(matches).map((r) => {
              const included = !excluded.has(r.id)
              return (
                <div key={r.id} style={{
                  display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'auto 1fr auto', gap: mobile ? 4 : 10, alignItems: 'center',
                  padding: '5px 0', borderTop: `1px solid ${colors.borderLight || colors.lineGray}`, opacity: included ? 1 : 0.55,
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 0 }}>
                    <input type="checkbox" checked={included} onChange={() => toggleRecipient(r.id)} aria-label={`${t('announce.include')} ${r.name || r.email}`} />
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name || r.email}</span>
                  </label>
                  <span style={{ fontSize: 11, color: colors.lovelabMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.email}{r.status === 'paused' ? ` · ${t('announce.paused')}` : ''}
                    {r.languageSource !== 'stored' ? ` · ${t('announce.languageAuto')}` : ''}
                  </span>
                  <select
                    value={r.languageSource === 'stored' ? r.language : ''}
                    disabled={savingLangFor === r.id}
                    onChange={(e) => saveAgentLanguage(r.id, e.target.value)}
                    aria-label={`${t('announce.languageFor')} ${r.name || r.email}`}
                    style={{ ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
                  >
                    <option value="">{t('announce.languageAuto')} ({AGENT_LANGUAGE_LABELS[r.language]})</option>
                    {AGENT_LANGUAGES.map((l) => <option key={l} value={l}>{AGENT_LANGUAGE_LABELS[l]}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 2 ────────────────────────────────────────────────────────────────
function TranslateStep({
  t, mobile, translationLangs, neededLangs, activeLang, setActiveLang, translations, texts, setTexts, setTranslations,
  includedByLanguage, sourceLang, note, translateOne, showPreview, setShowPreview, previewHtml, previewSubject,
  testState, sendTestCopy, missingLangs, onEditRecipients,
}) {
  const state = translations[activeLang] || {}
  const agents = includedByLanguage[activeLang] || []
  const englishOnlyAsSecond = activeLang === 'en' && !neededLangs.includes('en')

  const badge = (lang) => {
    const s = translations[lang]?.status
    const hasText = !!(texts[lang] || '').trim()
    if (s === 'pending') return { color: colors.lovelabMuted, text: '…' }
    if (!hasText) return { color: colors.danger, text: '!' }
    if (translations[lang]?.verified === false) return { color: colors.warning, text: '?' }
    return { color: colors.success, text: '✓' }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {translationLangs.map((lang) => {
          const b = badge(lang)
          const active = lang === activeLang
          const count = (includedByLanguage[lang] || []).length
          return (
            <button key={lang} type="button" onClick={() => setActiveLang(lang)} style={{
              fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: fonts.body,
              background: active ? colors.inkPlum : '#fff', color: active ? '#fff' : colors.text,
              border: `1px solid ${active ? colors.inkPlum : colors.lineGray}`, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {AGENT_LANGUAGE_LABELS[lang]}
              <span style={{ fontSize: 10, color: active ? '#fff' : b.color }}>{b.text}</span>
              <span style={{ fontSize: 10, opacity: 0.7 }}>{lang === 'en' && count === 0 ? '+' : count}</span>
            </button>
          )
        })}
      </div>

      {missingLangs.length > 0 && (
        <div style={{ fontSize: 12, color: colors.danger, marginBottom: 10 }}>{t('announce.missingText')}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: showPreview && !mobile ? '1fr 1fr' : '1fr', gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <label style={labelStyle}>
              {t('announce.note')} — {AGENT_LANGUAGE_LABELS[activeLang]}
            </label>
            <span style={{ fontSize: 11, color: colors.lovelabMuted }}>
              {englishOnlyAsSecond ? t('announce.englishSecondVersion') : t('announce.agentsInLanguage', { count: agents.length })}
            </span>
          </div>
          {activeLang === 'en' && !englishOnlyAsSecond && (
            <div style={{ fontSize: 11, color: colors.lovelabMuted, marginBottom: 6 }}>{t('announce.englishSecondVersion')}</div>
          )}

          {state.status === 'pending' && (
            <div style={{ fontSize: 12, color: colors.lovelabMuted, marginBottom: 6 }}>{t('announce.translating')}</div>
          )}
          {state.status === 'refused' && (
            <div style={{ fontSize: 12, color: colors.danger, marginBottom: 6, padding: '8px 10px', background: '#fee2e2', borderRadius: 6 }}>
              <div style={{ fontWeight: 700 }}>{t('announce.refused')}</div>
              <div style={{ marginTop: 2 }}>{state.error}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => translateOne(activeLang, sourceLang, note.trim())} style={linkBtn}>{t('announce.retry')}</button>
                <button type="button" onClick={() => setTranslations((p) => ({ ...p, [activeLang]: { status: 'manual' } }))} style={linkBtn}>{t('announce.writeManually')}</button>
              </div>
            </div>
          )}
          {state.status === 'done' && (
            <div style={{ fontSize: 11, color: state.verified === false ? colors.warning : colors.success, marginBottom: 6 }}>
              {state.verified === false ? t('announce.unverified') : t('announce.verified')}
            </div>
          )}

          <textarea
            value={texts[activeLang] || ''}
            maxLength={MAX_NOTE_LENGTH}
            disabled={state.status === 'pending'}
            onChange={(e) => setTexts((p) => ({ ...p, [activeLang]: e.target.value }))}
            rows={8}
            aria-label={`${t('announce.note')} ${AGENT_LANGUAGE_LABELS[activeLang]}`}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 160, lineHeight: 1.45, fontSize: 12 }}
          />

          <div style={{ marginTop: 10, fontSize: 11, color: colors.lovelabMuted }}>
            {agents.map((a) => a.name || a.email).join(', ')}
            {agents.length > 0 ? ' · ' : ''}
            <button type="button" onClick={onEditRecipients} style={{ ...linkBtn, fontSize: 11 }}>{t('announce.editRecipients')}</button>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setShowPreview((s) => !s)} style={linkBtn}>
              {showPreview ? '▾' : '▸'} {t('announce.preview')}
            </button>
            <button
              type="button"
              onClick={sendTestCopy}
              disabled={testState?.status === 'sending' || !(texts[activeLang] || '').trim() || !(texts.en || '').trim()}
              style={linkBtn}
            >
              ✉ {t('announce.testCopy')}
            </button>
            {testState?.status === 'sent' && <span style={{ fontSize: 11, color: colors.success }}>{t('announce.testSent', { to: testState.to })}</span>}
            {testState?.status === 'error' && <span style={{ fontSize: 11, color: colors.danger }}>{testState.error}</span>}
          </div>
        </div>

        {showPreview && (
          <div style={{ background: '#f7f7fa', borderRadius: 8, border: `1px solid ${colors.lineGray}`, padding: 10, minWidth: 0 }}>
            <div style={{ background: '#fff', borderRadius: 6, border: `1px solid ${colors.lineGray}`, padding: '8px 10px', fontSize: 12, marginBottom: 8, color: colors.charcoal }}>
              <div style={{ fontSize: 10, color: colors.lovelabMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{t('announce.subject')}</div>
              <div style={{ fontWeight: 600 }}>{previewSubject}</div>
            </div>
            <iframe
              title="price-list-preview"
              srcDoc={previewHtml}
              sandbox=""
              style={{ width: '100%', minHeight: 420, height: 420, border: `1px solid ${colors.lineGray}`, borderRadius: 6, background: '#fff' }}
            />
          </div>
        )}
      </div>
    </>
  )
}

// ── Step 3 ────────────────────────────────────────────────────────────────
function SendStep({ t, sending, results, sendError, sentCount, failedCount, skippedCount }) {
  const tone = { sent: colors.success, failed: colors.danger, skipped: colors.lovelabMuted }
  return (
    <>
      {sending && (
        <div style={{ fontSize: 13, color: colors.inkPlum, fontWeight: 600, marginBottom: 10 }}>
          {t('announce.sending', { done: sending.done, total: sending.total })}
        </div>
      )}
      {!sending && (
        <div style={{ fontSize: 13, color: failedCount ? colors.danger : colors.success, fontWeight: 600, marginBottom: 10 }}>
          {t('announce.done', { sent: sentCount, failed: failedCount, skipped: skippedCount })}
        </div>
      )}
      {sendError && (
        <div style={{ fontSize: 12, color: colors.danger, padding: '8px 10px', background: '#fee2e2', borderRadius: 6, marginBottom: 10 }}>{sendError}</div>
      )}
      <div style={{ border: `1px solid ${colors.lineGray}`, borderRadius: 8, overflow: 'hidden' }}>
        {results.map((r, i) => (
          <div key={r.id || i} style={{
            display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 12px', fontSize: 12,
            borderTop: i === 0 ? 'none' : `1px solid ${colors.lineGray}`, color: colors.text,
          }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong>{r.name || r.email || r.id}</strong>{r.email && r.name ? ` · ${r.email}` : ''}{r.lang ? ` · ${AGENT_LANGUAGE_LABELS[r.lang] || r.lang}` : ''}
            </span>
            <span style={{ color: tone[r.status] || colors.text, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {t(`announce.status.${r.status}`)}{r.reason ? ` (${r.reason})` : ''}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: colors.lovelabMuted, textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: 6,
}

const inputStyle = {
  width: '100%', padding: '9px 12px', fontSize: 13,
  border: `1.5px solid ${colors.lineGray}`, borderRadius: 8,
  outline: 'none', fontFamily: fonts.body, boxSizing: 'border-box',
  color: colors.text, background: '#fff',
}

const linkBtn = {
  background: 'none', border: 'none', padding: 0,
  color: colors.inkPlum, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: fonts.body,
}

const secondaryBtn = (disabled) => ({
  padding: '9px 18px', fontSize: 13, fontWeight: 600,
  background: '#fff', color: colors.text,
  border: `1px solid ${colors.lineGray}`, borderRadius: 8,
  cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: fonts.body,
  opacity: disabled ? 0.6 : 1,
})

const primaryBtn = (disabled) => ({
  padding: '9px 22px', fontSize: 13, fontWeight: 600,
  background: colors.inkPlum, color: '#fff',
  border: 'none', borderRadius: 8,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: fonts.body, opacity: disabled ? 0.6 : 1,
})
