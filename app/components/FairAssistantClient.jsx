'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { colors, fonts } from '@/lib/styles'
import { createClient } from '@/lib/supabase/client'
import { FAIR_OUTREACH_TEMPLATES, FAIR_LEAD_TYPES } from '@/lib/fair-assistant/templates'
import FairOutreachChatPanel from '@/app/components/FairOutreachChatPanel'

const TABS = [
  { id: 'upload', label: 'Upload' },
  { id: 'leads', label: 'Leads' },
  { id: 'outreach', label: 'Outreach' },
]

// Vercel's serverless body limit is 4.5 MB. iPhone photos are 5-10 MB
// and HEIC images can be even larger. Run multiple compression passes
// of increasing aggression until we land under 3 MB (safety margin)
// or run out of options. 1280 px is still well above what GPT-4 OCR
// needs to read a business card.
async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file) } catch {}
  }
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed (unsupported format?)')) }
    img.src = url
  })
}

async function compressPass(file, bitmap, maxDim, quality) {
  let { width, height } = bitmap
  if (!width || !height) throw new Error('Image has zero dimensions')
  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('Canvas toBlob returned null')); return }
        const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
        resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }))
      },
      'image/jpeg',
      quality
    )
  })
}

async function compressImage(file) {
  if (!file.type.startsWith('image/')) return file
  // Even small files can be HEIC and reject from the server — always compress
  // unless the file is already a small JPEG/PNG.
  if (file.size <= 800 * 1024 && /jpeg|jpg|png/i.test(file.type)) return file

  const bitmap = await loadBitmap(file)
  const passes = [
    { maxDim: 1600, quality: 0.85 },
    { maxDim: 1280, quality: 0.75 },
    { maxDim: 1024, quality: 0.65 },
    { maxDim: 800,  quality: 0.55 },
    { maxDim: 640,  quality: 0.5  },
  ]
  let last = null
  for (const opts of passes) {
    last = await compressPass(file, bitmap, opts.maxDim, opts.quality)
    if (last.size <= 3 * 1024 * 1024) break
  }
  if (bitmap.close) bitmap.close()
  return last
}

export default function FairAssistantClient() {
  const [batches, setBatches] = useState([])
  const [activeBatchId, setActiveBatchId] = useState(null)
  const [batch, setBatch] = useState(null)
  const [leads, setLeads] = useState([])
  const [images, setImages] = useState([])
  const [tab, setTab] = useState('upload')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newBatchName, setNewBatchName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [countryFilter, setCountryFilter] = useState('')
  const [languageFilter, setLanguageFilter] = useState('')
  const [previewHtml, setPreviewHtml] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [busyAction, setBusyAction] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [editingLead, setEditingLead] = useState(null)
  const [savedTemplates, setSavedTemplates] = useState([])
  const fileInputRef = useRef(null)

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  const loadBatches = useCallback(async () => {
    const res = await fetch('/api/fair-assistant/batches')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load batches')
    setBatches(data.batches || [])
    return data.batches || []
  }, [])

  const loadBatchDetails = useCallback(async (batchId) => {
    if (!batchId) return
    const res = await fetch(`/api/fair-assistant/batches/${batchId}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load batch')
    setBatch(data.batch)
    setLeads(data.leads || [])
    setImages(data.images || [])
  }, [])

  useEffect(() => {
    loadBatches()
      .then((list) => {
        if (list.length && !activeBatchId) setActiveBatchId(list[0].id)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    loadSavedTemplates()
  }, [loadBatches, activeBatchId, loadSavedTemplates])

  useEffect(() => {
    if (!activeBatchId) return
    loadBatchDetails(activeBatchId).catch((err) => setError(err.message))
  }, [activeBatchId, loadBatchDetails])

  useEffect(() => {
    if (!activeBatchId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`fair-batch-${activeBatchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fair_leads', filter: `batch_id=eq.${activeBatchId}` }, () => {
        loadBatchDetails(activeBatchId)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fair_batches', filter: `id=eq.${activeBatchId}` }, () => {
        loadBatchDetails(activeBatchId)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeBatchId, loadBatchDetails])

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (countryFilter && (lead.country || '') !== countryFilter) return false
      if (languageFilter && !(lead.language || '').includes(languageFilter)) return false
      return true
    })
  }, [leads, countryFilter, languageFilter])

  const countries = useMemo(() => [...new Set(leads.map((l) => l.country).filter(Boolean))].sort(), [leads])
  const languages = useMemo(() => {
    const set = new Set()
    for (const lead of leads) {
      for (const part of (lead.language || 'en').split('+')) set.add(part)
    }
    return [...set].sort()
  }, [leads])

  const loadSavedTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/fair-assistant/saved-templates')
      const data = await res.json()
      if (res.ok) setSavedTemplates(data.templates || [])
    } catch {}
  }, [])

  const handleSaveAsTemplate = async () => {
    if (!batch) return
    const defaultName = batch.fair_name || batch.name || 'Untitled template'
    const name = window.prompt('Name this template (e.g. "Vicenzaoro 2026 — shops"):', defaultName)
    if (!name || !name.trim()) return
    setError(null)
    try {
      const res = await fetch('/api/fair-assistant/saved-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          lead_type: 'shop',
          headline: batch.headline,
          paragraph1: batch.paragraph1,
          paragraph2: batch.paragraph2,
          signoff: batch.signoff,
          cta_line: batch.cta_line,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save template')
      await loadSavedTemplates()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleApplySavedTemplate = async (templateId) => {
    if (!templateId || !activeBatchId) return
    const tpl = savedTemplates.find((t) => t.id === templateId)
    if (!tpl) return
    setError(null)
    try {
      await saveBatchFields({
        headline: tpl.headline || '',
        paragraph1: tpl.paragraph1 || '',
        paragraph2: tpl.paragraph2 || '',
        signoff: tpl.signoff || '',
        cta_line: tpl.cta_line || '',
      })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteSavedTemplate = async (templateId) => {
    if (!templateId) return
    if (!window.confirm('Delete this saved template?')) return
    setError(null)
    try {
      const res = await fetch(`/api/fair-assistant/saved-templates/${templateId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete template')
      await loadSavedTemplates()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleSaveLead = async () => {
    if (!editingLead) return
    setError(null)
    try {
      const { id, ...patch } = editingLead
      const res = await fetch(`/api/fair-assistant/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update lead')
      setEditingLead(null)
      await loadBatchDetails(activeBatchId)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteLead = async (leadId) => {
    if (!leadId) return
    if (!window.confirm('Delete this lead? This cannot be undone.')) return
    setError(null)
    try {
      const res = await fetch(`/api/fair-assistant/leads/${leadId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete lead')
      setEditingLead(null)
      await loadBatchDetails(activeBatchId)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteBatch = async () => {
    if (!activeBatchId) return
    const batchName = batches.find((b) => b.id === activeBatchId)?.name || 'this batch'
    if (!window.confirm(`Delete "${batchName}" and all its photos, leads, and drafts? This cannot be undone.`)) return
    setError(null)
    try {
      const res = await fetch(`/api/fair-assistant/batches/${activeBatchId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete batch')
      setActiveBatchId(null)
      setBatch(null)
      setLeads([])
      setImages([])
      await loadBatches()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCreateBatch = async () => {
    if (!newBatchName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/fair-assistant/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBatchName.trim(), fairName: newBatchName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create batch')
      setNewBatchName('')
      await loadBatches()
      setActiveBatchId(data.batch.id)
      setTab('upload')
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleUploadFiles = async (fileList) => {
    if (!activeBatchId || !fileList?.length) return
    const files = Array.from(fileList)
    setUploading(true)
    setError(null)
    setUploadProgress({ done: 0, total: files.length, failed: 0 })
    const failures = []
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setUploadProgress({ done: i, total: files.length, failed: failures.length })
        let toSend = file
        let compressError = null
        try {
          toSend = await compressImage(file)
        } catch (err) {
          compressError = err.message
        }
        const origKB = Math.round(file.size / 1024)
        const sentKB = Math.round(toSend.size / 1024)
        const form = new FormData()
        form.append('batchId', activeBatchId)
        form.append('file', toSend)
        try {
          const res = await fetch('/api/fair-assistant/upload', { method: 'POST', body: form })
          let data
          try {
            data = await res.json()
          } catch {
            if (res.status === 413) {
              throw new Error(
                compressError
                  ? `compression failed (${compressError}); original ${origKB} KB`
                  : `sent ${sentKB} KB (original ${origKB} KB); Vercel limit ~4.5 MB`
              )
            }
            throw new Error(`HTTP ${res.status}`)
          }
          if (!res.ok) throw new Error(data.error || 'upload failed')
        } catch (err) {
          failures.push({ name: file.name, error: err.message })
        }
        if (i % 3 === 2 || i === files.length - 1) await loadBatchDetails(activeBatchId)
      }
      setUploadProgress({ done: files.length, total: files.length, failed: failures.length })
      await loadBatchDetails(activeBatchId)
      if (failures.length) {
        const summary = failures.slice(0, 3).map((f) => `${f.name}: ${f.error}`).join(' · ')
        const more = failures.length > 3 ? ` (+${failures.length - 3} more)` : ''
        setError(`${failures.length} of ${files.length} failed — ${summary}${more}`)
      } else if (files.length > 0) {
        setTab('leads')
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setTimeout(() => setUploadProgress(null), 3000)
    }
  }

  const saveBatchFields = async (patch) => {
    if (!activeBatchId) return
    const res = await fetch(`/api/fair-assistant/batches/${activeBatchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to save')
    setBatch(data.batch)
  }

  const applyTemplate = async (templateId) => {
    const template = FAIR_OUTREACH_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return
    await saveBatchFields({
      template_id: template.id,
      headline: template.headline,
      paragraph1: template.paragraph1,
      paragraph2: template.paragraph2,
      signoff: template.signoff,
    })
  }

  const runPreview = async () => {
    if (!activeBatchId) return
    setBusyAction('preview')
    setError(null)
    try {
      const res = await fetch('/api/fair-assistant/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: activeBatchId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Preview failed')
      setPreviewHtml(data.preview.bodyHtml)
      setPreviewOpen(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyAction(null)
    }
  }

  const runGenerateAll = async () => {
    if (!activeBatchId) return
    setBusyAction('generate')
    setError(null)
    try {
      const res = await fetch('/api/fair-assistant/generate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: activeBatchId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generate failed')
      await loadBatchDetails(activeBatchId)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyAction(null)
    }
  }

  const runSend = async () => {
    if (!activeBatchId) return
    setBusyAction('send')
    setError(null)
    try {
      const genRes = await fetch('/api/fair-assistant/generate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: activeBatchId }),
      })
      const genData = await genRes.json()
      if (!genRes.ok) throw new Error(genData.error || 'Generate failed')

      // Auto-loop send until the server reports no drafts remaining. Each
      // /send call drains as many as it can within the Vercel 10s function
      // budget; for huge batches this just means a few extra round-trips.
      let totals = { sent: 0, failed: 0, skipped: 0 }
      let passes = 0
      while (true) {
        passes += 1
        if (passes > 20) throw new Error('Aborted after 20 send passes — too many drafts; check Resend quota.')
        const res = await fetch('/api/fair-assistant/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId: activeBatchId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Send failed')
        totals.sent += data.sent || 0
        totals.failed += data.failed || 0
        totals.skipped += data.skipped || 0
        await loadBatchDetails(activeBatchId)
        if (!data.remaining) break
        setBusyAction(`send-loop-${data.remaining}`) // UI sees "Sending... 47 remaining"
      }
      setError(`Done — ${totals.sent} sent, ${totals.failed} failed, ${totals.skipped} skipped (no email).`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyAction(null)
    }
  }

  if (loading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>Loading Fair Assistant...</div>
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 12px' : '24px 20px' }}>
      {editingLead && (
        <div
          onClick={() => setEditingLead(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: colors.inkPlum }}>Edit lead</h2>
              <button
                onClick={() => setEditingLead(null)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', fontSize: 24, color: colors.lovelabMuted, cursor: 'pointer', padding: 4, lineHeight: 1 }}
              >×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['first_name', 'First name'],
                ['last_name', 'Last name'],
                ['company', 'Company'],
                ['title', 'Title'],
                ['email', 'Email'],
                ['phone', 'Phone'],
                ['mobile_phone', 'Mobile phone'],
                ['country', 'Country'],
                ['city', 'City'],
              ].map(([key, label]) => (
                <label key={key} style={{ fontSize: 12, color: colors.lovelabMuted }}>
                  <span style={{ display: 'block', marginBottom: 3, fontWeight: 600, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>{label}</span>
                  <input
                    value={editingLead[key] || ''}
                    onChange={(e) => setEditingLead({ ...editingLead, [key]: e.target.value })}
                    style={{ width: '100%', padding: 10, fontSize: 14, borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, boxSizing: 'border-box' }}
                  />
                </label>
              ))}
              <label style={{ fontSize: 12, color: colors.lovelabMuted }}>
                <span style={{ display: 'block', marginBottom: 3, fontWeight: 600, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>Lead type (changes which template is used for this lead)</span>
                <select
                  value={editingLead.lead_type || 'shop'}
                  onChange={(e) => setEditingLead({ ...editingLead, lead_type: e.target.value })}
                  style={{ width: '100%', padding: 10, fontSize: 14, borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, background: '#fff' }}
                >
                  {FAIR_LEAD_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: colors.lovelabMuted }}>
                  {FAIR_LEAD_TYPES.find((t) => t.id === (editingLead.lead_type || 'shop'))?.hint}
                </span>
              </label>
              <label style={{ fontSize: 12, color: colors.lovelabMuted }}>
                <span style={{ display: 'block', marginBottom: 3, fontWeight: 600, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>Language (override auto-detection)</span>
                <select
                  value={editingLead.language || ''}
                  onChange={(e) => {
                    const code = e.target.value
                    const labels = { en: 'English', fr: 'French', nl: 'Dutch', de: 'German', it: 'Italian', es: 'Spanish', pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', pl: 'Polish', el: 'Greek', tr: 'Turkish', he: 'Hebrew', 'fr+nl': 'French + Dutch', 'de+fr': 'German + French', 'fr+de': 'French + German', 'en+fr': 'English + French', 'de+it': 'German + Italian' }
                    setEditingLead({ ...editingLead, language: code, language_label: labels[code] || code })
                  }}
                  style={{ width: '100%', padding: 10, fontSize: 14, borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, background: '#fff' }}
                >
                  <option value="en">English</option>
                  <option value="it">Italian</option>
                  <option value="fr">French</option>
                  <option value="nl">Dutch</option>
                  <option value="de">German</option>
                  <option value="es">Spanish</option>
                  <option value="pt">Portuguese</option>
                  <option value="zh">Chinese</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                  <option value="pl">Polish</option>
                  <option value="el">Greek</option>
                  <option value="tr">Turkish</option>
                  <option value="he">Hebrew</option>
                  <option value="fr+nl">French + Dutch (Belgium)</option>
                  <option value="de+fr">German + French (Switzerland)</option>
                  <option value="fr+de">French + German (Luxembourg)</option>
                  <option value="en+fr">English + French (Canada)</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, gap: 8 }}>
              <button
                onClick={() => handleDeleteLead(editingLead.id)}
                style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid #fecaca`, background: '#fff', color: '#dc2626', cursor: 'pointer', fontFamily: fonts.body, fontWeight: 600, fontSize: 13 }}
              >Delete lead</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setEditingLead(null)}
                  style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${colors.border}`, background: '#fff', cursor: 'pointer', fontFamily: fonts.body, fontWeight: 600, fontSize: 13 }}
                >Cancel</button>
                <button
                  onClick={handleSaveLead}
                  style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', cursor: 'pointer', fontFamily: fonts.body, fontWeight: 700, fontSize: 13 }}
                >Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: 16, gap: 12 }}>
          <div>
            <h1 style={{ fontSize: isMobile ? 20 : 22, fontWeight: 700, color: colors.inkPlum, margin: 0 }}>Fair Assistant</h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.lovelabMuted }}>Upload cards, review leads, send branded outreach emails.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, alignItems: isMobile ? 'stretch' : 'center' }}>
            <select
              value={activeBatchId || ''}
              onChange={(e) => setActiveBatchId(e.target.value)}
              style={{ padding: '12px', borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, minWidth: isMobile ? 'auto' : 220, fontSize: 15, background: '#fff' }}
            >
              <option value="">Select batch...</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.status})</option>
              ))}
            </select>
            <input
              value={newBatchName}
              onChange={(e) => setNewBatchName(e.target.value)}
              placeholder="New fair name"
              style={{ padding: '12px', borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, fontSize: 15 }}
            />
            <button
              onClick={handleCreateBatch}
              disabled={creating || !newBatchName.trim()}
              style={{ padding: '12px 16px', minHeight: 44, borderRadius: 8, border: 'none', background: newBatchName.trim() ? colors.inkPlum : '#c5b9cf', color: '#fff', fontWeight: 600, cursor: newBatchName.trim() ? 'pointer' : 'not-allowed', fontFamily: fonts.body, fontSize: 15 }}
            >
              + New batch
            </button>
            {activeBatchId && (
              <button
                onClick={handleDeleteBatch}
                title="Delete this batch"
                aria-label="Delete this batch"
                style={{ padding: '12px 14px', minHeight: 44, borderRadius: 8, border: `1px solid #fecaca`, background: '#fff', color: '#dc2626', fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6"/>
                  <path d="M14 11v6"/>
                </svg>
                Delete batch
              </button>
            )}
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
            {error}
            <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>×</button>
          </div>
        )}

        {!activeBatchId ? (
          <div style={{ padding: 40, textAlign: 'center', color: colors.lovelabMuted }}>Create or select a batch to begin.</div>
        ) : (
          <>
            {/* Journey stepper — shows where the user is in the workflow */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12, color: colors.lovelabMuted, flexWrap: 'wrap' }}>
              {TABS.map((t, idx) => {
                const isActive = tab === t.id
                const stepCount = t.id === 'upload' ? images.length : t.id === 'leads' ? leads.length : (batch?.total_sent || 0)
                const stepLabels = ['Upload cards', 'Review leads', 'Send outreach']
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => setTab(t.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', borderRadius: 14, border: 'none', background: 'transparent',
                        color: isActive ? colors.inkPlum : colors.lovelabMuted, cursor: 'pointer', fontWeight: isActive ? 700 : 500,
                        fontSize: 12, fontFamily: fonts.body,
                      }}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 20, height: 20, borderRadius: '50%',
                        background: isActive ? colors.inkPlum : '#e8dfee',
                        color: isActive ? '#fff' : colors.inkPlum, fontWeight: 700, fontSize: 11,
                      }}>{idx + 1}</span>
                      <span>{stepLabels[idx]}{stepCount > 0 ? ` (${stepCount})` : ''}</span>
                    </button>
                    {idx < TABS.length - 1 && <span style={{ color: '#d0c4d6' }}>›</span>}
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4, alignItems: 'center' }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: '10px 18px', minHeight: 40, borderRadius: 20, border: `1px solid ${tab === t.id ? colors.inkPlum : colors.border}`,
                    background: tab === t.id ? colors.inkPlum : '#fff', color: tab === t.id ? '#fff' : colors.text,
                    fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body, fontSize: 14, whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  {t.label}
                </button>
              ))}
              {batch && (
                <span style={{ marginLeft: 'auto', fontSize: 12, color: colors.lovelabMuted, alignSelf: 'center' }}>
                  {batch.total_leads || 0} leads · {batch.total_sent || 0} sent · status: {batch.status}
                </span>
              )}
            </div>

            {tab === 'upload' && (
              <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: isMobile ? 16 : 24 }}>
                <p style={{ marginTop: 0, color: colors.textLight, fontSize: 14 }}>Pick photos from your library, the camera, or files — multi-select supported (you can grab the whole roll). Each one is uploaded to Drive and processed automatically.</p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleUploadFiles(e.target.files)}
                  style={{ display: 'none' }}
                />

                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, marginBottom: 16 }}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{
                      flex: 1, padding: isMobile ? '20px 16px' : '16px 24px',
                      minHeight: 64, borderRadius: 12, border: 'none',
                      background: uploading ? '#c5b9cf' : colors.inkPlum, color: '#fff',
                      fontWeight: 700, fontSize: 16, cursor: uploading ? 'wait' : 'pointer',
                      fontFamily: fonts.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    {uploading
                      ? (uploadProgress ? `Uploading ${uploadProgress.done + 1} of ${uploadProgress.total}…` : 'Uploading…')
                      : 'Pick photos'}
                  </button>
                </div>

                {uploadProgress && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: colors.lovelabMuted, marginBottom: 4 }}>
                      <span>
                        {uploadProgress.done} of {uploadProgress.total} uploaded
                        {uploadProgress.failed > 0 && <span style={{ color: '#dc2626' }}> · {uploadProgress.failed} failed</span>}
                      </span>
                      <span>{Math.round((uploadProgress.done / uploadProgress.total) * 100)}%</span>
                    </div>
                    <div style={{ height: 6, background: '#f1ecf3', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(uploadProgress.done / uploadProgress.total) * 100}%`,
                        background: colors.inkPlum,
                        transition: 'width .2s',
                      }} />
                    </div>
                  </div>
                )}

                {images.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Photos in this batch</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {images.map((img, i) => {
                        const statusColor =
                          img.status === 'processed' ? '#16a34a' :
                          img.status === 'failed' ? '#dc2626' :
                          img.status === 'processing' ? '#ca8a04' : colors.lovelabMuted
                        const statusLabel =
                          img.status === 'processed' ? '✓ done' :
                          img.status === 'failed' ? '✗ failed' :
                          img.status === 'processing' ? '⋯ processing' : img.status
                        return (
                          <div key={img.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, padding: '8px 10px', background: '#fafafa', borderRadius: 6 }}>
                            <span style={{ color: colors.lovelabMuted, minWidth: 24 }}>#{i + 1}</span>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.file_name || 'card.jpg'}</span>
                            <span style={{ color: statusColor, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{statusLabel}</span>
                          </div>
                        )
                      })}
                    </div>
                    {images.some((i) => i.status === 'failed' && i.error) && (
                      <details style={{ marginTop: 10, fontSize: 12, color: colors.lovelabMuted }}>
                        <summary style={{ cursor: 'pointer', color: '#dc2626', fontWeight: 600 }}>Show failure details</summary>
                        <ul style={{ marginTop: 6, paddingLeft: 16 }}>
                          {images.filter((i) => i.status === 'failed' && i.error).map((i, idx) => (
                            <li key={idx} style={{ marginBottom: 4 }}>
                              <strong>{i.file_name || 'card.jpg'}:</strong> {i.error}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}

                {leads.length > 0 && !uploading && (
                  <button
                    onClick={() => setTab('leads')}
                    style={{
                      width: '100%', padding: '14px 16px', minHeight: 48, borderRadius: 10,
                      border: 'none', background: '#16a34a', color: '#fff',
                      fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: fonts.body,
                      marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    Done — review {leads.length} lead{leads.length === 1 ? '' : 's'} →
                  </button>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: colors.lovelabMuted, borderTop: `1px solid ${colors.borderLight || colors.border}`, paddingTop: 12 }}>
                  <span><strong style={{ color: colors.inkPlum, fontSize: 16 }}>{images.length}</strong> photo{images.length === 1 ? '' : 's'} in this batch</span>
                  <span>{batch?.total_leads || 0} lead{(batch?.total_leads || 0) === 1 ? '' : 's'} extracted</span>
                </div>
              </div>
            )}

            {tab === 'leads' && (
              <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                  <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${colors.border}` }}>
                    <option value="">All countries</option>
                    {countries.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${colors.border}` }}>
                    <option value="">All languages</option>
                    {languages.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: `1px solid ${colors.border}` }}>
                        <th style={{ padding: 8 }}>Name</th>
                        <th style={{ padding: 8 }}>Company</th>
                        <th style={{ padding: 8 }}>Country</th>
                        <th style={{ padding: 8 }}>Language</th>
                        <th style={{ padding: 8 }}>Email</th>
                        <th style={{ padding: 8 }}>Status</th>
                        <th style={{ padding: 8, width: 50 }}></th>
                        <th style={{ padding: 8, width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.map((lead) => (
                        <tr
                          key={lead.id}
                          onClick={() => setEditingLead({ ...lead })}
                          style={{ borderBottom: `1px solid ${colors.borderLight}`, cursor: 'pointer' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#faf8fc' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <td style={{ padding: 8 }}>
                            {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'}
                            {lead.lead_type && lead.lead_type !== 'shop' && (
                              <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', background: lead.lead_type === 'agent' ? '#fef3c7' : lead.lead_type === 'partner' ? '#dbeafe' : '#f3f4f6', color: lead.lead_type === 'agent' ? '#92400e' : lead.lead_type === 'partner' ? '#1e40af' : '#374151', borderRadius: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {lead.lead_type}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: 8 }}>{lead.company || '—'}</td>
                          <td style={{ padding: 8 }}>{lead.country || '—'}</td>
                          <td style={{ padding: 8 }}>{lead.language_label || lead.language || '—'}</td>
                          <td style={{ padding: 8 }}>{lead.email || '—'}</td>
                          <td style={{ padding: 8 }}>{lead.status}</td>
                          <td style={{ padding: 8, color: colors.inkPlum, fontSize: 12, fontWeight: 600 }}>Edit</td>
                          <td style={{ padding: 4 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteLead(lead.id) }}
                              title="Delete lead"
                              aria-label="Delete lead"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 6, display: 'flex', alignItems: 'center' }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!filteredLeads.length && (
                        <tr><td colSpan={8} style={{ padding: 16, color: colors.lovelabMuted }}>No leads yet. Upload card photos to begin.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 'outreach' && batch && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 20 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {FAIR_OUTREACH_TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t.id)}
                        style={{
                          padding: '6px 12px', borderRadius: 16, border: `1px solid ${batch.template_id === t.id ? colors.inkPlum : colors.border}`,
                          background: batch.template_id === t.id ? '#f8f0fa' : '#fff', cursor: 'pointer', fontFamily: fonts.body, fontSize: 12,
                        }}
                      >
                        {t.name}
                      </button>
                    ))}
                    <button onClick={() => setChatOpen(true)} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 16, border: `1px solid ${colors.inkPlum}`, background: '#fff', color: colors.inkPlum, cursor: 'pointer', fontFamily: fonts.body, fontSize: 12 }}>
                      ✨ Chat with Claude
                    </button>
                  </div>

                  {/* Saved templates — apply or save current as new */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, padding: 12, background: '#faf7fc', borderRadius: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.04em' }}>My saved templates</span>
                    {savedTemplates.length === 0 ? (
                      <span style={{ fontSize: 12, color: colors.lovelabMuted, flex: 1 }}>None yet. Save the current draft below.</span>
                    ) : (
                      <select
                        onChange={(e) => { if (e.target.value) handleApplySavedTemplate(e.target.value); e.target.value = '' }}
                        defaultValue=""
                        style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, fontSize: 12, background: '#fff', flex: 1, minWidth: 180 }}
                      >
                        <option value="" disabled>Apply a saved template…</option>
                        {savedTemplates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}{t.lead_type !== 'shop' ? ` · ${t.lead_type}` : ''}</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={handleSaveAsTemplate}
                      style={{ padding: '6px 12px', borderRadius: 16, border: `1px solid ${colors.inkPlum}`, background: colors.inkPlum, color: '#fff', cursor: 'pointer', fontFamily: fonts.body, fontSize: 12, fontWeight: 600 }}
                    >
                      💾 Save current as template
                    </button>
                    {savedTemplates.length > 0 && (
                      <details style={{ flexBasis: '100%', marginTop: 4, fontSize: 11, color: colors.lovelabMuted }}>
                        <summary style={{ cursor: 'pointer' }}>Manage saved templates ({savedTemplates.length})</summary>
                        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                          {savedTemplates.map((t) => (
                            <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                              <span style={{ flex: 1 }}>{t.name} · <em style={{ color: colors.lovelabMuted }}>{t.lead_type}</em></span>
                              <button
                                onClick={() => handleApplySavedTemplate(t.id)}
                                style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: `1px solid ${colors.border}`, background: '#fff', cursor: 'pointer', fontFamily: fonts.body }}
                              >Apply</button>
                              <button
                                onClick={() => handleDeleteSavedTemplate(t.id)}
                                style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: `1px solid #fecaca`, background: '#fff', color: '#dc2626', cursor: 'pointer', fontFamily: fonts.body }}
                              >Delete</button>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  {[
                    { key: 'headline', label: 'Headline', kind: 'input' },
                    { key: 'paragraph1', label: 'Paragraph 1', kind: 'textarea', rows: 4 },
                    { key: 'paragraph2', label: 'Paragraph 2', kind: 'textarea', rows: 4 },
                    { key: 'cta_line', label: 'Call-to-action line (the lovelab.be reference)', kind: 'textarea', rows: 2, hint: 'Shown above the signoff. Edit to control how lovelab.be is mentioned.' },
                    { key: 'signoff', label: 'Signoff', kind: 'textarea', rows: 3 },
                  ].map((field) => (
                    <label key={field.key} style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
                      <span style={{ display: 'block', marginBottom: 4, fontWeight: 600, color: colors.inkPlum }}>{field.label}</span>
                      {field.hint && <span style={{ display: 'block', marginBottom: 6, fontSize: 11, color: colors.lovelabMuted }}>{field.hint}</span>}
                      {field.kind === 'textarea' ? (
                        <textarea
                          value={batch[field.key] || ''}
                          onChange={(e) => setBatch({ ...batch, [field.key]: e.target.value })}
                          onBlur={() => saveBatchFields({ [field.key]: batch[field.key] })}
                          rows={field.rows || 3}
                          style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, resize: 'vertical' }}
                        />
                      ) : (
                        <input
                          value={batch[field.key] || ''}
                          onChange={(e) => setBatch({ ...batch, [field.key]: e.target.value })}
                          onBlur={() => saveBatchFields({ [field.key]: batch[field.key] })}
                          style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body }}
                        />
                      )}
                    </label>
                  ))}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={runPreview} disabled={busyAction === 'preview'} style={actionBtnStyle}>{busyAction === 'preview' ? 'Loading...' : 'Preview email'}</button>
                    <button onClick={runGenerateAll} disabled={busyAction === 'generate'} style={actionBtnStyle}>{busyAction === 'generate' ? 'Generating...' : 'Generate all drafts'}</button>
                    <button onClick={runSend} disabled={busyAction && busyAction.startsWith('send')} style={{ ...actionBtnStyle, background: colors.inkPlum, color: '#fff' }}>{
                      busyAction === 'send' ? 'Sending…'
                      : busyAction?.startsWith('send-loop-') ? `Sending… ${busyAction.replace('send-loop-', '')} remaining`
                      : `Send to ${leads.length} leads`
                    }</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {previewOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPreviewOpen(false)}>
          <div style={{ background: '#fff', width: 'min(720px, 100%)', maxHeight: '90vh', overflow: 'auto', borderRadius: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between' }}>
              <strong>Email preview</strong>
              <button onClick={() => setPreviewOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <iframe title="Email preview" srcDoc={previewHtml || ''} style={{ width: '100%', minHeight: 600, border: 'none' }} />
          </div>
        </div>
      )}

      <FairOutreachChatPanel
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        batch={batch}
        leadCount={leads.length}
        onApplyDraft={(draft) => {
          setBatch((prev) => ({ ...prev, ...draft }))
          saveBatchFields(draft)
        }}
      />
    </div>
  )
}

const actionBtnStyle = {
  padding: '8px 14px',
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: '#fff',
  cursor: 'pointer',
  fontFamily: fonts.body,
  fontSize: 13,
  fontWeight: 600,
}
